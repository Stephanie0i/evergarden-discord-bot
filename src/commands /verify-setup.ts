import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { verificationService } from '../index.js';
import { EPHEMERAL, errorEmbed, successEmbed } from '../lib/ui.js';

export const data = new SlashCommandBuilder()
  .setName('verify-setup')
  .setDescription('Post the verification portal in a channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Channel where the portal should be posted')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true) as TextChannel;

  try {
    await verificationService.sendVerificationPrompt(channel);
    await interaction.reply({ embeds: [successEmbed(`Verification portal posted in <#${channel.id}>.`)], flags: EPHEMERAL });
  } catch (error) {
    console.error('❌ /verify-setup failed:', error);
    await interaction.reply({
      embeds: [errorEmbed(`I couldn't post in <#${channel.id}>. Make sure I can view and send messages there.`)],
      flags: EPHEMERAL,
    });
  }
}
