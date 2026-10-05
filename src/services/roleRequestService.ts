import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  GuildMember,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  Role,
  StringSelectMenuBuilder,
  TextChannel,
} from 'discord.js';
import { config } from '../config.js';
import { JsonStore } from '../lib/jsonStore.js';
import { SIGNATURE } from '../lib/persona.js';
import { getTheme, themedEmbed, withBanner } from '../lib/theme.js';
import { EPHEMERAL, errorEmbed, stamp, truncate } from '../lib/ui.js';
import { ModLogService } from './modLogService.js';

interface RoleData {
  roleIds: string[];
  reviewChannelId: string;
  portal: { channelId: string; messageId: string } | null;
  pending: Record<string, number>; // "userId:roleId" -> requested at (ms)
}

const PENDING_TTL_MS = 72 * 60 * 60 * 1000;

/** Roles carrying any of these permissions can never be requestable. */
const DANGEROUS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.MentionEveryone;

type PortalRow = ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>;

export class RoleRequestService {
  private store = new JsonStore<RoleData>('roles.json', () => ({ roleIds: [], reviewChannelId: '', portal: null, pending: {} }));
  private data: RoleData = (() => {
    const saved = this.store.read();
    return { roleIds: saved.roleIds ?? [], reviewChannelId: saved.reviewChannelId ?? '', portal: saved.portal ?? null, pending: saved.pending ?? {} };
  })();

  constructor(private modLog: ModLogService) {}

  // ---------- settings ----------
  public get roleIds(): string[] {
    return this.data.roleIds;
  }
  public get reviewChannelId(): string {
    return this.data.reviewChannelId || config.roleReviewChannelId;
  }
  public get portal(): RoleData['portal'] {
    return this.data.portal;
  }

  public setRoleIds(ids: string[]): void {
    this.data.roleIds = ids;
    this.save();
  }
  public setReviewChannel(id: string): void {
    this.data.reviewChannelId = id;
    this.save();
  }
  private save(): void {
    this.store.write(this.data);
  }

  // ---------- eligibility ----------
  /** Why this role can't be offered/granted, or null if it is fine. */
  public eligibility(guild: Guild, role: Role): string | null {
    if (role.id === guild.id) return 'that is @everyone';
    if (role.managed) return 'it is managed by an integration';
    if (role.id === config.verifiedRoleId || role.id === config.unverifiedRoleId) return 'it is used by the verification system';
    if (role.permissions.any(DANGEROUS)) return 'it has moderation/admin permissions';
    const me = guild.members.me;
    if (!me || role.comparePositionTo(me.roles.highest) >= 0) return 'it is above my highest role';
    return null;
  }

  public eligibleRoles(guild: Guild): Role[] {
    return this.roleIds
      .map((id) => guild.roles.cache.get(id))
      .filter((r): r is Role => !!r && this.eligibility(guild, r) === null);
  }

  // ---------- pending requests ----------
  private key(userId: string, roleId: string): string {
    return `${userId}:${roleId}`;
  }
  public hasPending(userId: string, roleId: string): boolean {
    const at = this.data.pending[this.key(userId, roleId)];
    if (!at) return false;
    if (Date.now() - at > PENDING_TTL_MS) {
      delete this.data.pending[this.key(userId, roleId)];
      this.save();
      return false;
    }
    return true;
  }
  private markPending(userId: string, roleId: string): void {
    this.data.pending[this.key(userId, roleId)] = Date.now();
    this.save();
  }
  private clearPending(userId: string, roleId: string): void {
    delete this.data.pending[this.key(userId, roleId)];
    this.save();
  }

  // ---------- public portal ----------
  public buildPortal(guild: Guild): { embeds: EmbedBuilder[]; components: PortalRow[] } {
    const t = getTheme();
    const roles = this.eligibleRoles(guild);

    const embed = withBanner(
      themedEmbed('primary')
        .setTitle('💌  Request a Role')
        .setThumbnail(t.logoUrl || guild.iconURL() || null)
        .setDescription(
          `Would you like a special role in **${guild.name}**?\n\n` +
            '> `1` Choose a role from the menu below\n' +
            '> `2` Tell us briefly why you would like it\n' +
            `> \`3\` Our staff will read your letter and reply soon${SIGNATURE}`
        )
    );
    if (roles.length) embed.addFields({ name: '🪻 Available roles', value: truncate(roles.map((r) => `${r}`).join('  •  '), 1000) });

    const row: PortalRow = roles.length
      ? new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rol:pick')
            .setPlaceholder('🪻  Choose the role you wish to request…')
            .addOptions(
              roles.slice(0, 25).map((r) => ({
                label: r.name.slice(0, 100),
                value: r.id,
                ...(r.unicodeEmoji ? { emoji: r.unicodeEmoji } : {}),
              }))
            )
        )
      : new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('rol:none').setLabel('No roles available right now').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );

    return { embeds: [embed], components: [row] };
  }

  public async postPortal(channel: TextChannel): Promise<string> {
    const old = this.data.portal;
    const msg = await channel.send(this.buildPortal(channel.guild));
    this.data.portal = { channelId: channel.id, messageId: msg.id };
    this.save();

    if (old && old.messageId !== msg.id) {
      const oldChannel = await channel.client.channels.fetch(old.channelId).catch(() => null);
      if (oldChannel?.isTextBased()) await oldChannel.messages.delete(old.messageId).catch(() => null);
    }
    return msg.url;
  }

  /** Re-renders the existing portal after the role list changes. */
  public async refreshPortal(guild: Guild): Promise<void> {
    const ref = this.data.portal;
    if (!ref) return;
    const channel = await guild.client.channels.fetch(ref.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(ref.messageId).catch(() => null);
    await message?.edit(this.buildPortal(guild)).catch(() => null);
  }

  // ---------- member: submit a request ----------
  public async submitRequest(i: ModalSubmitInteraction, member: GuildMember, role: Role, reason: string): Promise<void> {
    const guild = member.guild;
    const bad = this.eligibility(guild, role);
    if (!this.roleIds.includes(role.id) || bad) {
      await i.reply({ embeds: [errorEmbed('That role is no longer available for requests.')], flags: EPHEMERAL });
      return;
    }
    if (member.roles.cache.has(role.id)) {
      await i.reply({ embeds: [errorEmbed('You already have that role.')], flags: EPHEMERAL });
      return;
    }
    if (this.hasPending(member.id, role.id)) {
      await i.reply({ embeds: [errorEmbed('You already have a pending request for that role. Please wait for staff to reply.')], flags: EPHEMERAL });
      return;
    }

    const channel = await guild.client.channels.fetch(this.reviewChannelId).catch(() => null);
    if (!channel || !channel.isSendable()) {
      console.error(`❌ Role review channel ${this.reviewChannelId} not found or not writable.`);
      await i.reply({ embeds: [errorEmbed('Role requests are temporarily unavailable. Please contact a staff member.')], flags: EPHEMERAL });
      return;
    }

    const card = themedEmbed('warning')
      .setTitle('💌  New Role Request')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`<@${member.id}>  •  \`${member.user.tag}\`  •  \`${member.id}\``)
      .addFields(
        { name: '🎀 Requested role', value: `${role}`, inline: true },
        { name: '📥 Joined server', value: member.joinedTimestamp ? stamp(member.joinedTimestamp) : '—', inline: true },
        { name: '✍️ Their letter', value: `>>> ${truncate(reason, 900)}` }
      )
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rol:ok:${member.id}:${role.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rol:no:${member.id}:${role.id}`).setLabel('Reject').setEmoji('🚫').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [card], components: [buttons] });
    this.markPending(member.id, role.id);

    await i.reply({
      embeds: [
        themedEmbed('success').setDescription(
          `✅ **Your letter has been sent!**\nStaff will review your request for ${role} and let you know.`
        ),
      ],
      flags: EPHEMERAL,
    });
  }

  // ---------- staff: decisions ----------
  private decided(message: ButtonInteraction['message'], approved: boolean, staffId: string, note?: string): EmbedBuilder {
    const t = getTheme();
    const color = approved ? t.colors.success : t.colors.danger;
    const embed = EmbedBuilder.from(message.embeds[0])
      .setColor(parseInt(color.replace('#', ''), 16))
      .setTitle(approved ? '✅  Role Request Approved' : '🚫  Role Request Rejected')
      .addFields({ name: 'Decision', value: `${approved ? 'Approved' : 'Rejected'} by <@${staffId}> • ${stamp(Date.now())}` });
    if (note) embed.addFields({ name: 'Note to member', value: truncate(note, 500) });
    return embed;
  }

  public async approve(i: ButtonInteraction, userId: string, roleId: string): Promise<void> {
    const guild = i.guild;
    if (!guild) return;
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await i.reply({ embeds: [errorEmbed('You need the **Manage Roles** permission to review requests.')], flags: EPHEMERAL });
      return;
    }

    const role = guild.roles.cache.get(roleId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!role) return void (await i.reply({ embeds: [errorEmbed('That role no longer exists.')], flags: EPHEMERAL }));
    if (!member) {
      this.clearPending(userId, roleId);
      return void (await i.reply({ embeds: [errorEmbed('That member is no longer in the server.')], flags: EPHEMERAL }));
    }

    const bad = this.eligibility(guild, role);
    if (bad) return void (await i.reply({ embeds: [errorEmbed(`I can't grant that role: ${bad}.`)], flags: EPHEMERAL }));

    const reviewer = i.member as GuildMember;
    if (guild.ownerId !== reviewer.id && role.comparePositionTo(reviewer.roles.highest) >= 0) {
      return void (await i.reply({ embeds: [errorEmbed('That role is equal to or higher than your highest role.')], flags: EPHEMERAL }));
    }

    await member.roles.add(role, `Role request approved by ${i.user.tag}`);
    this.clearPending(userId, roleId);
    await i.update({ embeds: [this.decided(i.message, true, i.user.id)], components: [] });

    await member
      .send({
        embeds: [
          themedEmbed('success')
            .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
            .setTitle('💌  Your request was approved')
            .setDescription(`You now have the **${role.name}** role. Enjoy!${SIGNATURE}`),
        ],
      })
      .catch(() => null);

    await this.modLog.logAction({
      action: 'ROLE_APPROVED',
      moderator: `<@${i.user.id}>`,
      target: `<@${member.id}> (${member.user.tag})`,
      reason: `Role request approved: ${role.name}`,
      targetAvatarUrl: member.user.displayAvatarURL(),
      details: { Role: `${role}` },
    });
  }

  public async reject(i: ModalSubmitInteraction, userId: string, roleId: string, note: string): Promise<void> {
    const guild = i.guild;
    if (!guild) return;
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await i.reply({ embeds: [errorEmbed('You need the **Manage Roles** permission to review requests.')], flags: EPHEMERAL });
      return;
    }

    const role = guild.roles.cache.get(roleId);
    const user = await guild.client.users.fetch(userId).catch(() => null);
    this.clearPending(userId, roleId);

    if (i.isFromMessage()) {
      await i.update({ embeds: [this.decided(i.message, false, i.user.id, note)], components: [] });
    } else {
      await i.reply({ embeds: [themedEmbed('success').setDescription('✅ Request rejected.')], flags: EPHEMERAL });
    }

    await user
      ?.send({
        embeds: [
          themedEmbed('danger')
            .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
            .setTitle('💌  About your role request')
            .setDescription(
              `Unfortunately, your request for **${role?.name ?? 'that role'}** was not approved this time.` +
                `${note ? `\n\n**Note from staff**\n> ${truncate(note, 500)}` : ''}${SIGNATURE}`
            ),
        ],
      })
      .catch(() => null);

    await this.modLog.logAction({
      action: 'ROLE_REJECTED',
      moderator: `<@${i.user.id}>`,
      target: user ? `<@${user.id}> (${user.tag})` : userId,
      reason: note || `Role request rejected: ${role?.name ?? roleId}`,
      targetAvatarUrl: user?.displayAvatarURL(),
      details: { Role: role ? `${role}` : roleId },
    });
  }
}
