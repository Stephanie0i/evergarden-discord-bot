import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { voiceService } from '../index.js';
import { EPHEMERAL, errorEmbed, successEmbed } from '../lib/ui.js';

export const data = new SlashCommandBuilder()
  .setName('join-vc')
  .setDescription('Reconnect the bot to the 24/7 voice channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: EPHEMERAL });

  try {
    await voiceService.joinPersistentChannel();
    await interaction.editReply({
      embeds: [successEmbed(`Reconnecting to <#${config.voiceChannelId}>. Check \`/health\` in a few seconds.`)],
    });
  } catch (error) {
    console.error('❌ /join-vc failed:', error);
    await interaction.editReply({ embeds: [errorEmbed('Could not join the voice channel. Check my permissions there.')] });
  }
}
