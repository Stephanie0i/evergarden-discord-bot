import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getTheme, themedEmbed } from '../lib/theme.js';
import { SIGNATURE } from '../lib/persona.js';
import { EPHEMERAL } from '../lib/ui.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('See what this bot can do');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const t = getTheme();
  const embed = themedEmbed('primary')
    .setTitle(`✨  ${t.brandName} — Help`)
    .setThumbnail(t.logoUrl || interaction.client.user.displayAvatarURL({ size: 256 }))
    .setDescription(`A letter from your Auto Memory Doll — here is everything I can do for you.${SIGNATURE}`)
    .addFields(
      {
        name: '🌸 Everyone',
        value: '`/ping` — see how fast my letters travel\n`/health` — my current condition\n`/help` — this letter\n\n💌 To request a role, use the **role request portal** in the server.',
      },
      {
        name: '🛡️ Staff',
        value:
          '`/admin` — moderation panel: warn, timeout, kick, ban, clear messages, unban\n' +
          '`/theme` — change colors, banner, logo, texts and status messages\n' +
          '`/roles` — set up role requests and post the portal\n' +
          '`/verify-setup` — post the verification portal\n' +
          '`/join-vc` — reconnect the 24/7 voice channel',
      },
      {
        name: '🤖 Automatic',
        value: 'Welcome letters • Verification review • Role requests • Invite & keyword filter • 24/7 voice presence • Mod-log • Rotating status',
      }
    );

  await interaction.reply({ embeds: [embed], flags: EPHEMERAL });
}
