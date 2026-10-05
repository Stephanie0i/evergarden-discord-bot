import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
} from 'discord.js';
import { modLogService } from '../index.js';

export const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderation commands with automated audit logging')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addSubcommand((sub) =>
    sub
      .setName('warn')
      .setDescription('Issue a formal warning to a member')
      .addUserOption((opt) => opt.setName('target').setDescription('User to warn').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for warning').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('kick')
      .setDescription('Kick a member from the server')
      .addUserOption((opt) => opt.setName('target').setDescription('User to kick').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for kick').setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Ban a member from the server')
      .addUserOption((opt) => opt.setName('target').setDescription('User to ban').setRequired(true))
      .addStringOption((opt) => opt.setName('reason').setDescription('Reason for ban').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('target', true);
  const reason = interaction.options.getString('reason', true);
  const member = interaction.options.getMember('target') as GuildMember | null;

  if (subcommand === 'warn') {
    await modLogService.logAction({
      action: 'MEMBER_WARNED',
      moderator: interaction.user.tag,
      target: targetUser.tag,
      reason,
    });
    await interaction.reply({
      content: `⚠️ **${targetUser.tag}** has been warned for: ${reason}`,
      ephemeral: false,
    });
  } else if (subcommand === 'kick') {
    if (!member) {
      await interaction.reply({ content: '❌ User is not currently in the server.', ephemeral: true });
      return;
    }
    await member.kick(reason);
    await modLogService.logAction({
      action: 'MEMBER_KICKED',
      moderator: interaction.user.tag,
      target: targetUser.tag,
      reason,
    });
    await interaction.reply({ content: `👢 **${targetUser.tag}** was kicked. Reason: ${reason}` });
  } else if (subcommand === 'ban') {
    await interaction.guild?.members.ban(targetUser.id, { reason });
    await modLogService.logAction({
      action: 'MEMBER_BANNED',
      moderator: interaction.user.tag,
      target: targetUser.tag,
      reason,
    });
    await interaction.reply({ content: `🔨 **${targetUser.tag}** was banned. Reason: ${reason}` });
  }
}
