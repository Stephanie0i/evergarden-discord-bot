import { VoiceState } from 'discord.js';
import { config } from '../config.js';
import { voiceService } from '../index.js';

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const botId = newState.client.user?.id;
  if (!botId) return;

  // Check if this event involves our bot
  if (newState.id === botId || oldState.id === botId) {
    const isNowInVoice = !!newState.channelId;
    const isTargetChannel = newState.channelId === config.voiceChannelId;

    // If bot was disconnected from voice or moved away from configured channel, trigger reconnect
    if (!isNowInVoice || !isTargetChannel) {
      console.warn('⚠️ [Voice Guard] Bot was disconnected or moved from persistent voice channel. Recovering...');
      setTimeout(async () => {
        try {
          await voiceService.joinPersistentChannel();
        } catch (err) {
          console.error('Failed to restore voice persistence:', err);
        }
      }, 1500);
    }
  }
}