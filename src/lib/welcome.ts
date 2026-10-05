import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { SIGNATURE } from './persona.js';
import { getTheme, themedEmbed } from './theme.js';
import { fill } from './ui.js';

export interface WelcomeInput {
  mention: string; // "<@id>" for real members, plain text for previews
  displayName: string;
  avatarUrl: string;
  guildName: string;
  memberCount: number;
}

/**
 * The welcome card posted the moment someone joins.
 * Template placeholders (editable in /theme): {user} {server} {members} {verify}
 */
export function buildWelcomeEmbed(w: WelcomeInput): EmbedBuilder {
  const t = getTheme();
  const verify = config.verificationChannelId ? `<#${config.verificationChannelId}>` : 'the verification channel';
  const vars = { user: w.mention, server: w.guildName, members: String(w.memberCount), verify };

  const intro = fill(t.welcome.description, vars);
  const body = t.welcome.description.includes('{user}') ? intro : `Hey ${w.mention}, ${intro}`;

  const embed = themedEmbed('primary')
    .setAuthor({ name: w.displayName, iconURL: w.avatarUrl })
    .setTitle(fill(t.welcome.title, vars))
    .setDescription(
      `${body}\n\n` +
        `> 📮 Write your letter of introduction in ${verify}\n` +
        '> 🔊 Visit the voice lounge once the doors open\n' +
        `> 🌸 Be kind — every word is a letter someone will read${SIGNATURE}`
    )
    .setThumbnail(w.avatarUrl)
    .setTimestamp();

  const image = t.welcome.gifUrl || t.bannerUrl;
  if (image) embed.setImage(image);
  if (config.welcomeShowMemberCount) embed.setFooter({ text: `${t.brandName} • Guest #${w.memberCount}` });
  return embed;
}
