import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  GuildMember,
  InteractionContextType,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  User,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
} from 'discord.js';
import { moderationService, modLogService } from '../index.js';
import { ColorKey, getTheme, themedEmbed } from '../lib/theme.js';
import { EPHEMERAL, errorEmbed, parseDuration, stamp, truncate } from '../lib/ui.js';
import { ActionResult } from '../services/moderationService.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Open the moderation panel (warn, timeout, kick, ban, clear messages)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setContexts(InteractionContextType.Guild);

// ---------------------------------------------------------------------------
// Panel rendering. Everything is stateless: the selected user's ID lives in the
// buttons' customIds ("adm:<action>:<userId>"), so the panel survives restarts.
// ---------------------------------------------------------------------------
interface PanelState {
  target?: User | null;
  member?: GuildMember | null;
  notice?: { kind: ColorKey; text: string };
}

type PanelRow = ActionRowBuilder<UserSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>;
interface PanelPayload {
  embeds: EmbedBuilder[];
  components: PanelRow[];
}

const NEED: Record<string, bigint> = {
  user: PermissionFlagsBits.ModerateMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  warnings: PermissionFlagsBits.ModerateMembers,
  clearwarn: PermissionFlagsBits.ModerateMembers,
  back: PermissionFlagsBits.ModerateMembers,
  close: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  clear: PermissionFlagsBits.ManageMessages,
};

const btn = (id: string, label: string, emoji: string, style: ButtonStyle, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);

function buildPanel(guild: Guild, state: PanelState): PanelPayload {
  const t = state.target ?? null;
  const m = state.member ?? null;
  const id = t?.id ?? '0';
  const noMember = !t || !m;

  const embed = themedEmbed(state.notice?.kind ?? 'primary').setTitle('🛡️  Moderation Panel');
  const noticeLine = state.notice ? `${state.notice.text}\n\n` : '';

  if (t) {
    const timedOut = m?.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now();
    embed
      .setThumbnail(t.displayAvatarURL({ size: 256 }))
      .setDescription(`${noticeLine}**Selected member**\n<@${t.id}>  •  \`${t.tag}\`  •  \`${t.id}\``)
      .addFields(
        { name: '📅 Account created', value: stamp(t.createdTimestamp), inline: true },
        { name: '📥 Joined server', value: m?.joinedTimestamp ? stamp(m.joinedTimestamp) : '`Not in server`', inline: true },
        { name: '⚠️ Warnings', value: `\`${moderationService.getWarnings(t.id).length}\``, inline: true },
        { name: '🎖️ Top role', value: m ? `${m.roles.highest}` : '—', inline: true },
        { name: '⏳ Timeout', value: timedOut ? stamp(m!.communicationDisabledUntilTimestamp!) : 'None', inline: true }
      );
  } else {
    const icon = getTheme().logoUrl || guild.iconURL() || undefined;
    if (icon) embed.setThumbnail(icon);
    embed.setDescription(
      `${noticeLine}Pick a member from the menu below, then choose an action.\n` +
        '> You can also **clear messages** or **unban** without picking anyone.'
    );
  }

  const select = new UserSelectMenuBuilder()
    .setCustomId('adm:user')
    .setPlaceholder('👤  Select a member…')
    .setMinValues(1)
    .setMaxValues(1);
  if (t) select.setDefaultUsers(t.id);

  const row1 = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`adm:warn:${id}`, 'Warn', '⚠️', ButtonStyle.Secondary, !t),
    btn(`adm:timeout:${id}`, 'Timeout', '⏳', ButtonStyle.Secondary, noMember),
    btn(`adm:untimeout:${id}`, 'Untimeout', '🔓', ButtonStyle.Secondary, noMember),
    btn(`adm:kick:${id}`, 'Kick', '👢', ButtonStyle.Danger, noMember),
    btn(`adm:ban:${id}`, 'Ban', '🔨', ButtonStyle.Danger, !t)
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`adm:warnings:${id}`, 'Warnings', '📜', ButtonStyle.Primary, !t),
    btn(`adm:clear:${id}`, 'Clear messages', '🧹', ButtonStyle.Secondary),
    btn('adm:unban:0', 'Unban', '🕊️', ButtonStyle.Secondary),
    btn('adm:close:0', 'Close', '✖️', ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

function buildWarningsView(target: User, notice?: string): PanelPayload {
  const list = moderationService.getWarnings(target.id);
  const shown = list.slice(-8).reverse();
  const body = shown.length
    ? shown
        .map((w, i) => `**${list.length - i}.** ${stamp(w.at)} • by <@${w.moderatorId}>\n> ${truncate(w.reason, 180).replace(/\n/g, ' ')}`)
        .join('\n\n')
    : '_No warnings on record._';

  const embed = themedEmbed('warning')
    .setTitle(`📜  Warnings — ${target.tag}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(`${notice ? `${notice}\n\n` : ''}${body}`);
  if (list.length > shown.length) embed.addFields({ name: '\u200b', value: `_Showing the latest ${shown.length} of ${list.length}._` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(`adm:back:${target.id}`, 'Back', '⬅️', ButtonStyle.Secondary),
    btn(`adm:clearwarn:${target.id}`, 'Clear all warnings', '🧽', ButtonStyle.Danger, list.length === 0)
  );
  return { embeds: [embed], components: [row] };
}

type AnyPanelInteraction = ButtonInteraction | UserSelectMenuInteraction | ModalSubmitInteraction;

async function render(i: AnyPanelInteraction, payload: PanelPayload): Promise<void> {
  if (i.isModalSubmit()) {
    if (i.isFromMessage()) await i.update(payload);
    else await i.reply({ ...payload, flags: EPHEMERAL });
  } else {
    await i.update(payload);
  }
}

async function loadTarget(guild: Guild, id: string): Promise<{ user: User | null; member: GuildMember | null }> {
  const member = await guild.members.fetch({ user: id, force: true }).catch(() => null);
  const user = member?.user ?? (await guild.client.users.fetch(id).catch(() => null));
  return { user, member };
}

async function denyPerm(i: AnyPanelInteraction): Promise<void> {
  await i.reply({ embeds: [errorEmbed("You don't have permission to use this action.")], flags: EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Slash command
// ---------------------------------------------------------------------------
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  await interaction.reply({ ...buildPanel(interaction.guild, {}), flags: EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Buttons + user select
// ---------------------------------------------------------------------------
export async function handleComponent(i: ButtonInteraction | UserSelectMenuInteraction): Promise<void> {
  const guild = i.guild;
  if (!guild) return;
  const [, action, arg = '0'] = i.customId.split(':');

  const need = NEED[action];
  if (need && !i.memberPermissions?.has(need)) return denyPerm(i);

  // --- member picked from the dropdown ---
  if (i.isUserSelectMenu()) {
    const { user, member } = await loadTarget(guild, i.values[0]);
    if (!user) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ Could not find that user.' } }));
    return render(i, buildPanel(guild, { target: user, member }));
  }

  switch (action) {
    case 'warn':
      return void (await i.showModal(
        reasonModal(`adm:m:warn:${arg}`, 'Warn member', 'Why are you warning this member?')
      ));

    case 'kick':
      return void (await i.showModal(
        reasonModal(`adm:m:kick:${arg}`, 'Kick member', 'Why are you kicking this member?')
      ));

    case 'ban': {
      const modal = reasonModal(`adm:m:ban:${arg}`, 'Ban member', 'Why are you banning this member?');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('days')
            .setLabel('Delete message history (days, 0-7)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('0')
            .setRequired(false)
            .setMaxLength(1)
        )
      );
      return void (await i.showModal(modal));
    }

    case 'timeout': {
      const modal = new ModalBuilder().setCustomId(`adm:m:timeout:${arg}`).setTitle('Timeout member');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Duration (max 28 days)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('10m, 2h, 1d, 1w')
            .setRequired(true)
            .setMaxLength(6)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Why is this member being timed out?')
            .setRequired(false)
            .setMaxLength(400)
        )
      );
      return void (await i.showModal(modal));
    }

    case 'clear': {
      const modal = new ModalBuilder().setCustomId(`adm:m:clear:${arg}`).setTitle('Clear messages');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('amount')
            .setLabel(arg !== '0' ? 'How many messages from this member? (1-100)' : 'How many messages? (1-100)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('10')
            .setRequired(true)
            .setMaxLength(3)
        )
      );
      return void (await i.showModal(modal));
    }

    case 'unban': {
      const modal = new ModalBuilder().setCustomId('adm:m:unban:0').setTitle('Unban a user');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('userid')
            .setLabel('User ID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true)
            .setMaxLength(20)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Optional')
            .setRequired(false)
            .setMaxLength(200)
        )
      );
      return void (await i.showModal(modal));
    }

    case 'untimeout': {
      const { user, member } = await loadTarget(guild, arg);
      if (!user || !member) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ That member is not in the server.' } }));
      const bad = moderationService.guard(guild, i.member as GuildMember, user.id, member, true);
      if (bad) return render(i, buildPanel(guild, { target: user, member, notice: { kind: 'danger', text: `❌ ${bad}` } }));
      const res = await safely(() => moderationService.untimeout(i.user, member));
      const fresh = await loadTarget(guild, arg);
      return render(i, buildPanel(guild, { target: user, member: fresh.member, notice: noticeFrom(res) }));
    }

    case 'warnings': {
      const { user } = await loadTarget(guild, arg);
      if (!user) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ Could not find that user.' } }));
      return render(i, buildWarningsView(user));
    }

    case 'clearwarn': {
      const { user } = await loadTarget(guild, arg);
      if (!user) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ Could not find that user.' } }));
      const res = await moderationService.clearWarnings(i.user, user);
      return render(i, buildWarningsView(user, `✅ ${res.message}`));
    }

    case 'back': {
      const { user, member } = await loadTarget(guild, arg);
      return render(i, buildPanel(guild, { target: user, member }));
    }

    case 'close':
      return render(i, {
        embeds: [themedEmbed('info').setDescription('🛡️ Moderation panel closed. Use `/admin` to open it again.')],
        components: [],
      });
  }
}

// ---------------------------------------------------------------------------
// Modal submissions (warn / timeout / kick / ban / clear / unban)
// ---------------------------------------------------------------------------
export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  const guild = i.guild;
  if (!guild) return;
  const [, , action, arg = '0'] = i.customId.split(':');

  const need = NEED[action];
  if (need && !i.memberPermissions?.has(need)) return denyPerm(i);

  const moderator = i.member as GuildMember;
  const field = (name: string): string => {
    try {
      return i.fields.getTextInputValue(name).trim();
    } catch {
      return '';
    }
  };

  // Actions that don't need a selected member
  if (action === 'unban') {
    const userId = field('userid');
    if (!/^\d{15,22}$/.test(userId)) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ That is not a valid user ID.' } }));
    const res = await safely(() => moderationService.unban(guild, i.user, userId, field('reason') || 'No reason provided'));
    return render(i, buildPanel(guild, { notice: noticeFrom(res) }));
  }

  if (action === 'clear') return handleClear(i, guild, arg);

  // Actions on a member
  const { user, member } = await loadTarget(guild, arg);
  if (!user) return render(i, buildPanel(guild, { notice: { kind: 'danger', text: '❌ Could not find that user.' } }));

  const needsMember = action !== 'warn' && action !== 'ban';
  const bad = moderationService.guard(guild, moderator, user.id, member, needsMember);
  if (bad) return render(i, buildPanel(guild, { target: user, member, notice: { kind: 'danger', text: `❌ ${bad}` } }));

  const reason = field('reason') || 'No reason provided';
  let res: ActionResult;

  switch (action) {
    case 'warn':
      res = await safely(() => moderationService.warn(guild, i.user, user, reason));
      break;

    case 'timeout': {
      const ms = parseDuration(field('duration'));
      if (!ms || ms > 28 * 864e5) {
        return render(i, buildPanel(guild, { target: user, member, notice: { kind: 'danger', text: '❌ Invalid duration. Use e.g. `10m`, `2h`, `1d` (max `4w`).' } }));
      }
      res = await safely(() => moderationService.timeout(guild, i.user, member!, ms, reason));
      break;
    }

    case 'kick':
      res = await safely(() => moderationService.kick(guild, i.user, member!, reason));
      break;

    case 'ban': {
      const days = Math.min(7, Math.max(0, parseInt(field('days') || '0', 10) || 0));
      res = await safely(() => moderationService.ban(guild, i.user, user, member, reason, days));
      break;
    }

    default:
      return;
  }

  // After kick/ban the member is gone, so reload to show the fresh state
  const fresh = await loadTarget(guild, arg);
  return render(i, buildPanel(guild, { target: user, member: fresh.member, notice: noticeFrom(res) }));
}

async function handleClear(i: ModalSubmitInteraction, guild: Guild, targetId: string): Promise<void> {
  const amount = parseInt(i.fields.getTextInputValue('amount').trim(), 10);
  const target = targetId !== '0' ? await loadTarget(guild, targetId) : { user: null, member: null };
  const back = (kind: ColorKey, text: string) =>
    render(i, buildPanel(guild, { target: target.user, member: target.member, notice: { kind, text } }));

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) return back('danger', '❌ Enter a number between 1 and 100.');

  const channel = i.channel;
  if (!channel || !('bulkDelete' in channel)) return back('danger', '❌ I can only clear messages in server text channels.');

  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) {
    return back('danger', '❌ I need **Manage Messages** (plus View Channel and Read Message History) in this channel.');
  }

  try {
    let toDelete: number | Message[] = amount;
    if (target.user) {
      const recent = await channel.messages.fetch({ limit: 100 });
      toDelete = [...recent.filter((m) => m.author.id === target.user!.id).values()].slice(0, amount);
    }
    // filterOld=true: Discord can't bulk-delete messages older than 14 days
    const deleted = await channel.bulkDelete(toDelete, true);

    await modLogService.logAction({
      action: 'MESSAGES_CLEARED',
      moderator: `<@${i.user.id}>`,
      target: target.user ? `<@${target.user.id}> (${target.user.tag})` : `<#${channel.id}>`,
      reason: `Deleted ${deleted.size} message(s)`,
      details: { Channel: `<#${channel.id}>`, Count: String(deleted.size) },
    });

    return back(
      deleted.size ? 'success' : 'warning',
      deleted.size
        ? `🧹 Deleted **${deleted.size}** message(s)${target.user ? ` from **${target.user.tag}**` : ''}.`
        : '⚠️ Nothing deleted — messages older than 14 days can\'t be bulk deleted.'
    );
  } catch (err) {
    console.error('❌ /admin clear failed:', err);
    return back('danger', '❌ Failed to delete messages. Check my permissions in this channel.');
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function reasonModal(customId: string, title: string, placeholder: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(placeholder)
        .setRequired(true)
        .setMaxLength(400)
    )
  );
  return modal;
}

function noticeFrom(res: ActionResult): { kind: ColorKey; text: string } {
  return res.ok ? { kind: 'success', text: `✅ ${res.message}` } : { kind: 'danger', text: `❌ ${res.message}` };
}

/** Turns unexpected Discord API errors into a friendly panel notice instead of a crash. */
async function safely(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    console.error('❌ [admin panel] action failed:', err);
    return { ok: false, message: 'Discord rejected that action. Check my permissions and role position.' };
  }
}

