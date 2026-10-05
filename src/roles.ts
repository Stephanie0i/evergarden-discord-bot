import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelSelectMenuInteraction,
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  InteractionContextType,
  MentionableSelectMenuInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  RoleSelectMenuInteraction,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuInteraction,
} from 'discord.js';
import { roleRequestService as svc } from '../index.js';
import { ColorKey, themedEmbed } from '../lib/theme.js';
import { EPHEMERAL, errorEmbed } from '../lib/ui.js';

export const data = new SlashCommandBuilder()
  .setName('roles')
  .setDescription('Set up role requests: choose roles, the staff review channel, and post the portal')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setContexts(InteractionContextType.Guild);

type RoleComponent = ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction | ChannelSelectMenuInteraction;

function buildPanel(guild: Guild, notice?: { kind: ColorKey; text: string }) {
  const roles = svc.eligibleRoles(guild);
  const portal = svc.portal;
  const embed = themedEmbed(notice?.kind ?? 'primary')
    .setTitle('🎀  Role Requests — Setup')
    .setDescription(
      `${notice ? `${notice.text}\n\n` : ''}Members request a role from a portal message; staff approve or reject it in the review channel.\n` +
        '> Run `/roles` **inside the channel** where members should request roles, then press **Post portal here**.'
    )
    .addFields(
      { name: '🪻 Requestable roles', value: roles.length ? roles.map((r) => `${r}`).join(' • ') : '_None yet — pick some below_' },
      { name: '📬 Staff review channel', value: `<#${svc.reviewChannelId}>`, inline: true },
      {
        name: '📮 Portal',
        value: portal ? `[Posted in <#${portal.channelId}>](https://discord.com/channels/${guild.id}/${portal.channelId}/${portal.messageId})` : '_Not posted yet_',
        inline: true,
      }
    );

  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId('rol:set')
    .setPlaceholder('🪻  Choose the roles members may request (up to 25)')
    .setMinValues(0)
    .setMaxValues(25);
  if (roles.length) roleMenu.setDefaultRoles(roles.map((r) => r.id));

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId('rol:review')
    .setPlaceholder('📬  Choose the staff review channel')
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);
  if (svc.reviewChannelId) channelMenu.setDefaultChannels(svc.reviewChannelId);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleMenu),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('rol:post').setLabel('Post portal here').setEmoji('📮').setStyle(ButtonStyle.Success).setDisabled(roles.length === 0),
        new ButtonBuilder().setCustomId('rol:close').setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) return;
  await interaction.reply({ ...buildPanel(interaction.guild), flags: EPHEMERAL });
}

// ---------------------------------------------------------------------------
export async function handleComponent(i: RoleComponent | UserSelectMenuInteraction | MentionableSelectMenuInteraction): Promise<void> {
  const guild = i.guild;
  if (!guild) return;
  const [, action, userId, roleId] = i.customId.split(':');

  // ----- members: picked a role from the portal -----
  if (action === 'pick' && i.isStringSelectMenu()) {
    const picked = i.values[0];
    const role = guild.roles.cache.get(picked);
    const member = i.member as GuildMember;

    // Reset the menu so the same role can be picked again later
    void i.message.edit(svc.buildPortal(guild)).catch(() => null);

    if (!role || !svc.roleIds.includes(role.id) || svc.eligibility(guild, role)) {
      return void (await i.reply({ embeds: [errorEmbed('That role is not available anymore. Ask staff to refresh the portal.')], flags: EPHEMERAL }));
    }
    if (member.roles.cache.has(role.id)) {
      return void (await i.reply({ embeds: [errorEmbed('You already have that role.')], flags: EPHEMERAL }));
    }
    if (svc.hasPending(member.id, role.id)) {
      return void (await i.reply({ embeds: [errorEmbed('You already have a pending request for that role. Please wait for staff to reply.')], flags: EPHEMERAL }));
    }

    const modal = new ModalBuilder().setCustomId(`rol:m:req:${role.id}`).setTitle(`Request: ${role.name}`.slice(0, 45));
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why would you like this role?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('A few words are enough…')
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(300)
      )
    );
    return void (await i.showModal(modal));
  }

  // ----- staff: review buttons on request cards -----
  if (action === 'ok' && i.isButton()) return svc.approve(i, userId, roleId);
  if (action === 'no' && i.isButton()) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return void (await i.reply({ embeds: [errorEmbed('You need the **Manage Roles** permission to review requests.')], flags: EPHEMERAL }));
    }
    const modal = new ModalBuilder().setCustomId(`rol:m:no:${userId}:${roleId}`).setTitle('Reject role request');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Note for the member (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Tell them why, kindly…')
          .setRequired(false)
          .setMaxLength(300)
      )
    );
    return void (await i.showModal(modal));
  }

  // ----- staff: setup panel -----
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return void (await i.reply({ embeds: [errorEmbed('You need the **Manage Roles** permission for this.')], flags: EPHEMERAL }));
  }

  if (action === 'set' && i.isRoleSelectMenu()) {
    const skipped: string[] = [];
    const ok: string[] = [];
    for (const picked of i.roles.values()) {
      const role = guild.roles.cache.get(picked.id);
      if (!role) continue;
      const why = svc.eligibility(guild, role);
      if (why) skipped.push(`${role} — ${why}`);
      else ok.push(role.id);
    }
    svc.setRoleIds(ok);
    await svc.refreshPortal(guild);
    const text = `✅ Saved **${ok.length}** requestable role(s).` + (skipped.length ? `\n⚠️ Skipped:\n${skipped.map((s) => `> ${s}`).join('\n')}` : '');
    return void (await i.update(buildPanel(guild, { kind: skipped.length ? 'warning' : 'success', text })));
  }

  if (action === 'review' && i.isChannelSelectMenu()) {
    const channel = i.channels.first();
    const me = guild.members.me;
    const canSend = channel && 'permissionsFor' in channel && me && channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages);
    if (!channel || !canSend) {
      return void (await i.update(buildPanel(guild, { kind: 'danger', text: "❌ I can't view or write in that channel. Fix my permissions there first." })));
    }
    svc.setReviewChannel(channel.id);
    return void (await i.update(buildPanel(guild, { kind: 'success', text: `✅ Review channel set to <#${channel.id}>.` })));
  }

  if (action === 'post' && i.isButton()) {
    const channel = i.channel;
    const me = guild.members.me;
    if (!channel || channel.type !== ChannelType.GuildText || !me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel)) {
      return void (await i.update(buildPanel(guild, { kind: 'danger', text: "❌ I can only post the portal in a text channel where I can write." })));
    }
    await svc.postPortal(channel);
    return void (await i.update(buildPanel(guild, { kind: 'success', text: `✅ Portal posted in <#${channel.id}>.` })));
  }

  if (action === 'close' && i.isButton()) {
    return void (await i.update({
      embeds: [themedEmbed('info').setDescription('🎀 Closed. Use `/roles` to open the setup again.')],
      components: [],
    }));
  }
}

export async function handleModal(i: ModalSubmitInteraction): Promise<void> {
  const guild = i.guild;
  if (!guild) return;
  const [, , action, a, b] = i.customId.split(':');

  if (action === 'req') {
    const role = guild.roles.cache.get(a);
    if (!role) return void (await i.reply({ embeds: [errorEmbed('That role no longer exists.')], flags: EPHEMERAL }));
    return svc.submitRequest(i, i.member as GuildMember, role, i.fields.getTextInputValue('reason').trim());
  }

  if (action === 'no') {
    return svc.reject(i, a, b, i.fields.getTextInputValue('note').trim());
  }
}

