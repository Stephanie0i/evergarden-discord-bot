import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { modLogService, presenceService } from '../index.js';
import {
  ColorKey,
  getTheme,
  isHexColor,
  isHttpUrl,
  isValidEmoji,
  normalizeHex,
  resetTheme,
  themedEmbed,
  updateTheme,
} from '../lib/theme.js';
import { EPHEMERAL, errorEmbed, truncate } from '../lib/ui.js';
import { buildWelcomeEmbed } from '../lib/welcome.js';

export const data = new SlashCommandBuilder()
  .setName('theme')
  .setDescription("Customize the bot's look: colors, banner, logo and texts")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setContexts(InteractionContextType.Guild);

interface Notice {
  kind: ColorKey;
  text: string;
}

const COLOR_KEYS: ColorKey[] = ['primary', 'success', 'warning', 'danger', 'info'];

const btn = (id: string, label: string, emoji: string, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

function input(id: string, label: string, value: string, opts: { max: number; paragraph?: boolean; required?: boolean; placeholder?: string }) {
  const t = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(opts.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(opts.required ?? true)
    .setMaxLength(opts.max);
  if (opts.placeholder) t.setPlaceholder(opts.placeholder);
  if (value) t.setValue(value.slice(0, opts.max));
  return new ActionRowBuilder<TextInputBuilder>().addComponents(t);
}

function buildPanel(notice?: Notice, confirmReset = false) {
  const t = getTheme();
  const embed = themedEmbed(notice?.kind ?? 'primary')
    .setTitle('🎨  Theme Studio')
    .setDescription(
      `${notice ? `${notice.text}\n\n` : ''}Edit how the bot looks. The bar on the left of this card always shows your current **primary** color.\n` +
        '> New messages use the changes immediately. Re-run `/verify-setup` to refresh an existing verification portal.'
    )
    .addFields(
      { name: '🏷️ Branding', value: `Name: **${t.brandName}**\nFooter: ${t.footerText ? `\`${truncate(t.footerText, 60)}\`` : '_none_'}`, inline: true },
      {
        name: '🎨 Colors',
        value: COLOR_KEYS.map((k) => `\`${k.padEnd(7)}\` ${t.colors[k]}`).join('\n'),
        inline: true,
      },
      {
        name: '🖼️ Images',
        value: `Banner: ${t.bannerUrl ? '✅ set' : '—'}\nLogo: ${t.logoUrl ? '✅ set' : '—'}\nWelcome GIF: ${t.welcome.gifUrl ? '✅ set' : '—'}`,
        inline: true,
      },
      { name: '👋 Welcome title', value: truncate(t.welcome.title, 100), inline: true },
      { name: '🛡️ Portal title', value: truncate(t.verification.title, 100), inline: true },
      { name: '🔘 Portal button', value: `${t.verification.buttonEmoji} ${t.verification.buttonLabel}`, inline: true },
      {
        name: '🔁 Status rotation',
        value: `**${t.statuses.length}** phrase(s), changing every **${t.statusIntervalMin} min**`,
        inline: true,
      }
    );
  if (t.bannerUrl) embed.setImage(t.bannerUrl);
  if (t.logoUrl) embed.setThumbnail(t.logoUrl);

  const rows: ActionRowBuilder<ButtonBuilder>[] = confirmReset
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          btn('thm:reset_yes', 'Yes, reset everything', '♻️', ButtonStyle.Danger),
          btn('thm:reset_no', 'Cancel', '✖️')
        ),
      ]
    : [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          btn('thm:colors', 'Colors', '🎨', ButtonStyle.Primary),
          btn('thm:images', 'Images', '🖼️', ButtonStyle.Primary),
          btn('thm:branding', 'Branding & welcome', '🏷️', ButtonStyle.Primary),
          btn('thm:portal', 'Verification portal', '🛡️', ButtonStyle.Primary)
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          btn('thm:status', 'Status messages', '🔁', ButtonStyle.Primary),
          btn('thm:preview', 'Preview', '👁️'),
          btn('thm:reset', 'Reset to default', '♻️')
        ),
      ];

  return { embeds: [embed], components: rows };
}

function previewEmbeds(i: ButtonInteraction): EmbedBuilder[] {
  return [
    buildWelcomeEmbed({
      mention: '**A New Guest**',
      displayName: i.user.displayName,
      avatarUrl: i.user.displayAvatarURL({ size: 256 }),
      guildName: i.guild?.name ?? 'Evergarden',
      memberCount: i.guild?.memberCount ?? 21,
    }),
    themedEmbed('success').setDescription('✅ **Success** — this is how confirmations look.'),
    themedEmbed('warning').setDescription('⚠️ **Warning** — this is how warnings and automod notices look.'),
    themedEmbed('danger').setDescription('❌ **Error** — this is how errors look.'),
    themedEmbed('info').setDescription('ℹ️ **Info** — this is how neutral info looks.'),
  ];
}

// ---------------------------------------------------------------------------
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ ...buildPanel(), flags: EPHEMERAL });
}

export async function handleComponent(i: ButtonInteraction): Promise<void> {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await i.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to edit the theme.')], flags: EPHEMERAL });
    return;
  }

  const t = getTheme();
  const action = i.customId.split(':')[1];

  switch (action) {
    case 'colors': {
      const modal = new ModalBuilder().setCustomId('thm:m:colors').setTitle('Colors (hex, e.g. #B794F4)');
      modal.addComponents(
        ...COLOR_KEYS.map((k) =>
          input(k, `${k[0].toUpperCase()}${k.slice(1)} color`, t.colors[k], { max: 7, placeholder: '#B794F4' })
        )
      );
      return void (await i.showModal(modal));
    }

    case 'images': {
      const modal = new ModalBuilder().setCustomId('thm:m:images').setTitle('Images (direct image links)');
      modal.addComponents(
        input('banner', 'Banner image URL (empty = none)', t.bannerUrl, { max: 400, required: false, placeholder: 'https://…/banner.png' }),
        input('logo', 'Logo / thumbnail URL (empty = none)', t.logoUrl, { max: 400, required: false, placeholder: 'https://…/logo.png' }),
        input('gif', 'Welcome GIF URL (empty = none)', t.welcome.gifUrl, { max: 400, required: false, placeholder: 'https://…/welcome.gif' })
      );
      return void (await i.showModal(modal));
    }

    case 'branding': {
      const modal = new ModalBuilder().setCustomId('thm:m:branding').setTitle('Branding & welcome message');
      modal.addComponents(
        input('brand', 'Brand name (shown in footers)', t.brandName, { max: 40 }),
        input('footer', 'Extra footer text (optional)', t.footerText, { max: 80, required: false }),
        input('wtitle', 'Welcome title', t.welcome.title, { max: 100 }),
        input('wdesc', 'Welcome text: {user} {server} {verify}', t.welcome.description, { max: 800, paragraph: true })
      );
      return void (await i.showModal(modal));
    }

    case 'portal': {
      const modal = new ModalBuilder().setCustomId('thm:m:portal').setTitle('Verification portal');
      modal.addComponents(
        input('ptitle', 'Portal title', t.verification.title, { max: 100 }),
        input('pdesc', 'Portal description', t.verification.description, { max: 800, paragraph: true }),
        input('plabel', 'Button label', t.verification.buttonLabel, { max: 40 }),
        input('pemoji', 'Button emoji', t.verification.buttonEmoji, { max: 40, placeholder: '📋' })
      );
      return void (await i.showModal(modal));
    }

    case 'status': {
      const modal = new ModalBuilder().setCustomId('thm:m:status').setTitle('Rotating status messages');
      modal.addComponents(
        input('lines', 'One status per line (max 10)', t.statuses.join('\n'), {
          max: 900,
          paragraph: true,
          placeholder: '✉️ Writing letters…\n💜 Delivering feelings…\nUse {members} for the member count',
        }),
        input('interval', 'Change every how many minutes? (1-60)', String(t.statusIntervalMin), { max: 2, placeholder: '3' })
      );
      return void (await i.showModal(modal));
    }

    case 'preview':
      return void (await i.reply({ embeds: previewEmbeds(i), flags: EPHEMERAL }));

    case 'reset':
      return void (await i.update(buildPanel({ kind: 'warning', text: '⚠️ Reset **all** theme settings to the defaults?' }, true)));

    case 'reset_no':
      return void (await i.update(buildPanel()));

    case 'reset_yes':
      resetTheme();
      await log(i.user.id, 'Theme reset to defaults');
      return void (await i.update(buildPanel({ kind: 'success', text: '✅ Theme reset to the defaults.' })));
  }
}

export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await i.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to edit the theme.')], flags: EPHEMERAL });
    return;
  }

  const action = i.customId.split(':')[2];
  const get = (id: string) => i.fields.getTextInputValue(id).trim();
  const show = async (notice: Notice) => {
    const payload = buildPanel(notice);
    if (i.isFromMessage()) await i.update(payload);
    else await i.reply({ ...payload, flags: EPHEMERAL });
  };
  const fail = (text: string) => show({ kind: 'danger', text: `❌ ${text} Nothing was saved.` });

  switch (action) {
    case 'colors': {
      const colors: Partial<Record<ColorKey, string>> = {};
      for (const k of COLOR_KEYS) {
        const v = get(k);
        if (!isHexColor(v)) return fail(`**${k}** must be a hex color like \`#B794F4\`.`);
        colors[k] = normalizeHex(v);
      }
      updateTheme({ colors });
      await log(i.user.id, 'Colors changed');
      return show({ kind: 'success', text: '✅ Colors updated.' });
    }

    case 'images': {
      const banner = get('banner');
      const logo = get('logo');
      const gif = get('gif');
      for (const [name, v] of [['Banner', banner], ['Logo', logo], ['Welcome GIF', gif]] as const) {
        if (v && !isHttpUrl(v)) return fail(`**${name}** must be a direct http(s) link.`);
      }
      updateTheme({ bannerUrl: banner, logoUrl: logo, welcome: { gifUrl: gif } });
      await log(i.user.id, 'Images changed');
      return show({ kind: 'success', text: '✅ Images updated.' });
    }

    case 'branding': {
      updateTheme({
        brandName: get('brand') || 'Evergarden',
        footerText: get('footer'),
        welcome: { title: get('wtitle'), description: get('wdesc') },
      });
      await log(i.user.id, 'Branding & welcome text changed');
      return show({ kind: 'success', text: '✅ Branding and welcome message updated.' });
    }

    case 'status': {
      const lines = get('lines')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const minutes = parseInt(get('interval'), 10);
      if (lines.length === 0 || lines.length > 10) return fail('Write between **1 and 10** status lines.');
      if (lines.some((l) => l.length > 100)) return fail('Each status must be **100 characters or fewer**.');
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return fail('The interval must be a number of minutes from **1 to 60**.');
      updateTheme({ statuses: lines, statusIntervalMin: minutes });
      presenceService.restart();
      await log(i.user.id, `Status rotation changed (${lines.length} phrases, every ${minutes} min)`);
      return show({ kind: 'success', text: `✅ Saved **${lines.length}** status phrase(s). They rotate every **${minutes} min**.` });
    }

    case 'portal': {
      const emoji = get('pemoji');
      if (!isValidEmoji(emoji)) return fail('The button emoji must be a single emoji (e.g. 📋) or a custom emoji like `<:name:123…>`.');
      updateTheme({
        verification: { title: get('ptitle'), description: get('pdesc'), buttonLabel: get('plabel'), buttonEmoji: emoji },
      });
      await log(i.user.id, 'Verification portal text changed');
      return show({ kind: 'success', text: '✅ Verification portal updated. Run `/verify-setup` again to post the new version.' });
    }
  }
}

async function log(userId: string, what: string): Promise<void> {
  await modLogService.logAction({
    action: 'THEME_UPDATED',
    moderator: `<@${userId}>`,
    target: 'Bot theme',
    reason: what,
  });
}
