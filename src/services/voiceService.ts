import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  NoSubscriberBehavior,
  DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { Client, VoiceBasedChannel } from 'discord.js';
import { config } from '../config.js';
import { ModLogService } from './modLogService.js';

export class VoiceService {
  private client: Client;
  private modLogService: ModLogService;
  private connection: VoiceConnection | null = null;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private audioPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  constructor(client: Client, modLogService: ModLogService) {
    this.client = client;
    this.modLogService = modLogService;
  }

  public getConnectionStatus(): 'Connected' | 'Reconnecting' | 'Disconnected' {
    if (!this.connection) return 'Disconnected';
    if (this.connection.state.status === VoiceConnectionStatus.Ready) return 'Connected';
    if (this.isReconnecting) return 'Reconnecting';
    return 'Disconnected';
  }

  public async joinPersistentChannel(): Promise<void> {
    if (!config.voiceChannelId) {
      console.warn('⚠️ [VoiceService] VOICE_CHANNEL_ID not set in environment.');
      return;
    }

    const channel = await this.client.channels.fetch(config.voiceChannelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) {
      console.error(`❌ [VoiceService] Voice channel ${config.voiceChannelId} not found or invalid.`);
      return;
    }

    await this.connectToChannel(channel as VoiceBasedChannel);
  }

  private async connectToChannel(channel: VoiceBasedChannel): Promise<void> {
    try {
      // Never keep two connections alive (e.g. /join-vc while already connected)
      if (this.connection) {
        this.connection.removeAllListeners();
        this.connection.destroy();
        this.connection = null;
      }

      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild
          .voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
        selfDeaf: config.voiceSelfDeaf, // Configurable: true to save bandwidth & CPU
        selfMute: config.voiceSelfMute, // Configurable
      });

      this.connection.subscribe(this.audioPlayer);

      // Listen for disconnection events and initiate auto-recovery
      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        console.warn('⚠️ [VoiceService] Voice connection disconnected. Attempting auto-reconnect...');
        try {
          await Promise.race([
            entersState(this.connection!, VoiceConnectionStatus.Signalling, 5_000),
            entersState(this.connection!, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new voice server automatically
        } catch {
          // Hard disconnect: destroy and reconnect
          this.triggerAutoReconnect(channel);
        }
      });

      this.connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.warn('⚠️ [VoiceService] Voice connection destroyed. Scheduling immediate reconnection...');
        this.triggerAutoReconnect(channel);
      });

      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      console.log(`🔊 [VoiceService] Successfully connected 24/7 to voice channel: ${channel.name}`);
    } catch (error) {
      console.error('❌ [VoiceService] Error connecting to voice channel:', error);
      this.triggerAutoReconnect(channel);
    }
  }

  private triggerAutoReconnect(channel: VoiceBasedChannel): void {
    if (this.isReconnecting) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ [VoiceService] Max reconnect attempts reached. Giving up until /join-vc is used.');
      return;
    }
    this.isReconnecting = true;
    this.reconnectAttempts++;

    const baseDelay = config.voiceAutoReconnectDelayMs || 2000;
    const delayMs = Math.min(baseDelay * Math.pow(1.5, this.reconnectAttempts), 30_000);
    console.log(
      `🔄 [VoiceService] Reconnecting to ${channel.name} in ${Math.round(delayMs / 1000)}s (Attempt #${this.reconnectAttempts})...`
    );

    setTimeout(async () => {
      try {
        // Release the lock BEFORE connecting, otherwise a failed attempt inside
        // connectToChannel() can never schedule the next retry (it would return early).
        this.isReconnecting = false;
        await this.connectToChannel(channel);
        if (this.connection?.state.status === VoiceConnectionStatus.Ready) {
          await this.modLogService.logAction({
            action: 'VOICE_RECONNECTED',
            moderator: 'System Guard',
            target: channel.name,
            reason: `Automatic 24/7 voice persistence recovery (Attempt #${this.reconnectAttempts})`,
          });
        }
      } catch (err) {
        console.error('❌ [VoiceService] Reconnection failed:', err);
        this.isReconnecting = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.triggerAutoReconnect(channel);
        }
      }
    }, delayMs);
  }

  public destroy(): void {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
  }
}