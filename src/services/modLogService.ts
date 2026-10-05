import { Client } from 'discord.js';
import { config } from '../config.js';
import { ColorKey, themedEmbed } from '../lib/theme.js';
import { truncate } from '../lib/ui.js';

export type ModAction =
  | 'MEMBER_VERIFIED'
  | 'MEMBER_REJECTED'
  | 'ROLE_APPROVED'
  | 'ROLE_REJECTED'
  | 'MEMBER_WARNED'
  | 'WARNINGS_CLEARED'
  | 'MEMBER_TIMEOUT'
  | 'MEMBER_UNTIMEOUT'
  | 'MEMBER_KICKED'
  | 'MEMBER_BANNED'
  | 'MEMBER_UNBANNED'
  | 'MESSAGES_CLEARED'
  | 'AUTOMOD'
  | 'THEME_UPDATED'
  | 'VOICE_RECONNECTED'
  | 'SYSTEM_ERROR';

export interface ModLogPayload {
  action: ModAction;
  moderator: string;
  target: string;
  reason: string;
  details?: Record<string, string>;
  targetAvatarUrl?: string;
}

const META: Record<ModAction, { emoji: string; label: string; kind: ColorKey }> = {
  MEMBER_VERIFIED: { emoji: '✅', label: 'Member Verified', kind: 'success' },
  MEMBER_REJECTED: { emoji: '🚫', label: 'Application Rejected', kind: 'danger' },
  ROLE_APPROVED: { emoji: '🎀', label: 'Role Request Approved', kind: 'success' },
  ROLE_REJECTED: { emoji: '🚫', label: 'Role Request Rejected', kind: 'danger' },
  MEMBER_WARNED: { emoji: '⚠️', label: 'Member Warned', kind: 'warning' },
  WARNINGS_CLEARED: { emoji: '🧽', label: 'Warnings Cleared', kind: 'info' },
  MEMBER_TIMEOUT: { emoji: '⏳', label: 'Member Timed Out', kind: 'warning' },
  MEMBER_UNTIMEOUT: { emoji: '🔓', label: 'Timeout Removed', kind: 'info' },
  MEMBER_KICKED: { emoji: '👢', label: 'Member Kicked', kind: 'danger' },
  MEMBER_BANNED: { emoji: '🔨', label: 'Member Banned', kind: 'danger' },
  MEMBER_UNBANNED: { emoji: '🕊️', label: 'Member Unbanned', kind: 'success' },
  MESSAGES_CLEARED: { emoji: '🧹', label: 'Messages Cleared', kind: 'info' },
  AUTOMOD: { emoji: '🤖', label: 'Auto-Moderation', kind: 'warning' },
  THEME_UPDATED: { emoji: '🎨', label: 'Theme Updated', kind: 'primary' },
  VOICE_RECONNECTED: { emoji: '🔊', label: 'Voice Reconnected', kind: 'info' },
  SYSTEM_ERROR: { emoji: '🚨', label: 'System Error', kind: 'danger' },
};

export class ModLogService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public async logAction(payload: ModLogPayload): Promise<void> {
    if (!config.modLogChannelId) return;

    try {
      const channel = await this.client.channels.fetch(config.modLogChannelId).catch(() => null);
      if (!channel || !channel.isSendable()) {
        console.warn(`⚠️ [ModLogService] Mod log channel ${config.modLogChannelId} not found or not writable.`);
        return;
      }

      const meta = META[payload.action];
      const embed = themedEmbed(meta.kind)
        .setTitle(`${meta.emoji}  ${meta.label}`)
        .setDescription(
          `**Target**  ${payload.target}\n` +
            `**Staff**  ${payload.moderator}\n\n` +
            `**Reason**\n> ${truncate(payload.reason || 'No reason provided', 900).replace(/\n/g, '\n> ')}`
        )
        .setTimestamp();

      if (payload.targetAvatarUrl) embed.setThumbnail(payload.targetAvatarUrl);

      if (payload.details) {
        for (const [key, val] of Object.entries(payload.details)) {
          embed.addFields({ name: key, value: truncate(val, 1000), inline: true });
        }
      }

      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('❌ [ModLogService] Failed to send audit log:', err);
    }
  }
}
