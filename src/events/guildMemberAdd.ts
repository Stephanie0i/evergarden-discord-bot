import { GuildMember } from 'discord.js';
import { config } from '../config.js';
import { buildWelcomeEmbed } from '../lib/welcome.js';

export async function handleMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;
  console.log(`📥 [Member Join] ${member.user.tag} (${member.id}) joined ${member.guild.name}`);

  // 1. Quarantine role until staff approve the verification letter
  if (config.unverifiedRoleId) {
    try {
      await member.roles.add(config.unverifiedRoleId);
    } catch (err) {
      console.error(`Failed to assign unverified role to ${member.user.tag}:`, err);
    }
  }

  // 2. Welcome card — sent right away, not after verification
  const channel = await member.client.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel || !channel.isSendable()) {
    console.warn(`⚠️ Welcome channel ${config.welcomeChannelId} not found or not writable.`);
    return;
  }

  await channel
    .send({
      content: `<@${member.id}>`,
      embeds: [
        buildWelcomeEmbed({
          mention: `<@${member.id}>`,
          displayName: member.user.displayName,
          avatarUrl: member.user.displayAvatarURL({ size: 256 }),
          guildName: member.guild.name,
          memberCount: member.guild.memberCount,
        }),
      ],
    })
    .catch((err) => console.error('❌ Failed to send welcome message:', err));
}
