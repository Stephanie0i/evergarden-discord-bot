import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';
import { healthService } from '../index.js';
import { themedEmbed } from '../lib/theme.js';

export const data = new SlashCommandBuilder()
  .setName('health')
  .setDescription('Live status of the bot');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const m = healthService.getMetrics();
  const voiceOk = m.voice.status === 'Connected';
  const kind = !voiceOk || m.discord.wsPingMs > 500 ? 'warning' : 'success';

  const embed = themedEmbed(kind)
    .setTitle(`${kind === 'success' ? '💚' : '🟡'}  Bot Health`)
    .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: '🌐 Gateway',
        value: `Ping: **${m.discord.wsPingMs} ms**\nServers: **${m.discord.guildCount}**\nCached users: **${m.discord.cachedUsers}**`,
        inline: true,
      },
      {
        name: '🔊 24/7 Voice',
        value: `Status: **${m.voice.status}**\nChannel: <#${config.voiceChannelId}>`,
        inline: true,
      },
      { name: '⏱️ Uptime', value: `**${m.uptimeFormatted}**`, inline: true },
      {
        name: '🧠 Memory',
        value: `RAM: **${m.memory.rssMb} MB**\nHeap: **${m.memory.heapUsedMb} MB**`,
        inline: true,
      },
      {
        name: '🖥️ Host',
        value: `Node: **${m.system.nodeVersion}**\nPlatform: **${m.system.platform}**`,
        inline: true,
      }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
