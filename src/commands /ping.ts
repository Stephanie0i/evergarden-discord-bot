import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { PHRASES, pick } from '../lib/persona.js';
import { themedEmbed } from '../lib/theme.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription("Check how fast the bot's letters travel");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [themedEmbed('info').setDescription(pick(PHRASES.pinging))] });
  const sent = await interaction.fetchReply();

  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
  const ws = Math.max(0, Math.round(interaction.client.ws.ping));
  const worst = Math.max(roundtrip, ws);
  const kind = worst < 200 ? 'success' : worst < 500 ? 'warning' : 'danger';
  const mood = pick(worst < 200 ? PHRASES.pingFast : worst < 500 ? PHRASES.pingSlow : PHRASES.pingLag);

  await interaction.editReply({
    embeds: [
      themedEmbed(kind)
        .setTitle('📮  Delivered')
        .setDescription(`*${mood}*`)
        .addFields(
          { name: '📡 Roundtrip', value: `\`${roundtrip} ms\``, inline: true },
          { name: '💓 Gateway', value: `\`${ws} ms\``, inline: true }
        ),
    ],
  });
}
