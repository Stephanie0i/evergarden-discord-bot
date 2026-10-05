import { Message, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { modLogService } from '../index.js';
import { PHRASES, pick } from '../lib/persona.js';
import { themedEmbed } from '../lib/theme.js';
import { truncate } from '../lib/ui.js';

const INVITE_REGEX = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/.+/i;

export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bots (prevents feedback loops) and DMs
  if (message.author.bot || !message.inGuild()) return;

  // Staff are exempt from auto-moderation
  if (message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) return;

  // 1. Anti-invite guard
  if (config.enableAntiInvite && INVITE_REGEX.test(message.content)) {
    await punish(message, pick(PHRASES.automodInvite), 'Posted a Discord invite link');
    return;
  }

  // 2. Blocked keywords
  if (config.blockedKeywords.length > 0) {
    const text = message.content.toLowerCase();
    const hit = config.blockedKeywords.find((k) => text.includes(k.toLowerCase()));
    if (hit) {
      await punish(message, pick(PHRASES.automodKeyword), `Used a blocked keyword: \`${hit}\``);
    }
  }
}

async function punish(message: Message<true>, notice: string, logReason: string): Promise<void> {
  const content = message.content;
  await message.delete().catch(() => null);

  if (message.channel.isSendable()) {
    const warn = await message.channel
      .send({
        content: `<@${message.author.id}>`,
        embeds: [themedEmbed('warning').setDescription(`⚠️ ${notice}`)],
      })
      .catch(() => null);
    if (warn) setTimeout(() => warn.delete().catch(() => null), 6000);
  }

  await modLogService.logAction({
    action: 'AUTOMOD',
    moderator: 'Auto-Moderation',
    target: `<@${message.author.id}> (${message.author.tag})`,
    reason: logReason,
    targetAvatarUrl: message.author.displayAvatarURL(),
    details: {
      Channel: `<#${message.channelId}>`,
      Message: `\`\`\`${truncate(content.replace(/`/g, "'"), 200)}\`\`\``,
    },
  });
}
