import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  GuildMember,
  TextChannel,
} from 'discord.js';
import { config } from '../config.js';
import { SIGNATURE } from '../lib/persona.js';
import { getTheme, themedEmbed, withBanner } from '../lib/theme.js';
import { EPHEMERAL, errorEmbed, stamp, successEmbed, truncate } from '../lib/ui.js';
import { ModLogService } from './modLogService.js';

export class VerificationService {
  private client: Client;
  private modLogService: ModLogService;

  constructor(client: Client, modLogService: ModLogService) {
    this.client = client;
    this.modLogService = modLogService;
  }

  // 1. Public verification portal
  public async sendVerificationPrompt(channel: TextChannel): Promise<void> {
    const t = getTheme();
    const embed = withBanner(
      themedEmbed('primary')
        .setTitle(t.verification.title)
        .setDescription(
          `${t.verification.description}\n\n` +
            '**How it works**\n' +
            '> `1` Press the button below and write your letter\n' +
            '> `2` Our staff read it with care\n' +
            '> `3` The doors of the server open for you'
        )
        .setThumbnail(t.logoUrl || channel.guild.iconURL() || null)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_start')
        .setLabel(t.verification.buttonLabel)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(t.verification.buttonEmoji)
    );

    await channel.send({ embeds: [embed], components: [row] });
  }

  // 2. Questionnaire modal
  public async showVerificationModal(interaction: ButtonInteraction): Promise<void> {
    const member = interaction.member as GuildMember | null;
    if (member && config.verifiedRoleId && member.roles.cache.has(config.verifiedRoleId)) {
      await interaction.reply({ embeds: [successEmbed("You're already verified — enjoy the server!")], flags: EPHEMERAL });
      return;
    }

    const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Community Verification');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('verify_reason')
          .setLabel(config.verifyQ1Label.slice(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(config.verifyQ1Placeholder.slice(0, 100))
          .setRequired(true)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('verify_rules')
          .setLabel(config.verifyQ2Label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(config.verifyQ2Placeholder.slice(0, 100))
          .setRequired(true)
          .setMaxLength(20)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('verify_referral')
          .setLabel(config.verifyQ3Label.slice(0, 45))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(config.verifyQ3Placeholder.slice(0, 100))
          .setRequired(false)
          .setMaxLength(100)
      )
    );

    await interaction.showModal(modal);
  }

  // 3. Modal submitted -> staff review card
  public async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const member = interaction.member as GuildMember;
    const reason = interaction.fields.getTextInputValue('verify_reason');
    const rules = interaction.fields.getTextInputValue('verify_rules');
    const referral = interaction.fields.getTextInputValue('verify_referral') || '_None provided_';

    const reviewChannel = (await this.client.channels
      .fetch(config.adminReviewChannelId)
      .catch(() => null)) as TextChannel | null;

    if (!reviewChannel) {
      console.error(`❌ Admin review channel ${config.adminReviewChannelId} not found!`);
      await interaction.reply({
        embeds: [errorEmbed('Verification is temporarily unavailable. Please contact a staff member.')],
        flags: EPHEMERAL,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          '**Your letter has been sent!**\nStaff will read it soon — the doors will open as soon as it is approved.'
        ),
      ],
      flags: EPHEMERAL,
    });

    const reviewEmbed = themedEmbed('warning')
      .setTitle('📥  New Verification Application')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`<@${member.id}>  •  \`${member.user.tag}\`  •  \`${member.id}\``)
      .addFields(
        { name: '📅 Account created', value: stamp(member.user.createdTimestamp), inline: true },
        { name: '📥 Joined server', value: member.joinedTimestamp ? stamp(member.joinedTimestamp) : '—', inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: `💬 ${truncate(config.verifyQ1Label, 240)}`, value: `>>> ${truncate(reason, 900)}` },
        { name: `📜 ${truncate(config.verifyQ2Label, 240)}`, value: `\`${truncate(rules, 40)}\``, inline: true },
        { name: `🔎 ${truncate(config.verifyQ3Label, 240)}`, value: truncate(referral, 100), inline: true }
      )
      .setTimestamp();

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_approve_${member.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`verify_reject_${member.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚫')
    );

    await reviewChannel.send({ embeds: [reviewEmbed], components: [actionRow] });
  }

  private decide(interaction: ButtonInteraction, approved: boolean): EmbedBuilder {
    const t = getTheme();
    const color = approved ? t.colors.success : t.colors.danger;
    return EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(parseInt(color.replace('#', ''), 16))
      .setTitle(approved ? '✅  Application Approved' : '🚫  Application Rejected')
      .addFields({
        name: 'Decision',
        value: `${approved ? 'Approved' : 'Rejected'} by <@${interaction.user.id}> • ${stamp(Date.now())}`,
      });
  }

  // 4. Approve
  public async handleApproval(interaction: ButtonInteraction, targetUserId: string): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ embeds: [errorEmbed('That member is no longer in the server.')], flags: EPHEMERAL });
      return;
    }

    if (config.verifiedRoleId) await targetMember.roles.add(config.verifiedRoleId).catch(console.error);
    if (config.unverifiedRoleId) await targetMember.roles.remove(config.unverifiedRoleId).catch(console.error);

    await interaction.update({ embeds: [this.decide(interaction, true)], components: [] });

    await this.modLogService.logAction({
      action: 'MEMBER_VERIFIED',
      moderator: `<@${interaction.user.id}>`,
      target: `<@${targetMember.id}> (${targetMember.user.tag})`,
      reason: 'Staff approved the verification application',
      targetAvatarUrl: targetMember.user.displayAvatarURL(),
      details: { 'Role given': `<@&${config.verifiedRoleId}>` },
    });

    if (config.autoDmOnApproval) {
      const dm = themedEmbed('success')
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
        .setTitle('💌  Your letter was approved')
        .setDescription(`${config.dmApprovalMessage || `You have been approved for **${guild.name}**. Welcome!`}${SIGNATURE}`);
      await targetMember.send({ embeds: [dm] }).catch(() => null);
    }
  }

  // 5. Reject
  public async handleRejection(interaction: ButtonInteraction, targetUserId: string): Promise<void> {
    await interaction.update({ embeds: [this.decide(interaction, false)], components: [] });

    const user = await this.client.users.fetch(targetUserId).catch(() => null);
    await this.modLogService.logAction({
      action: 'MEMBER_REJECTED',
      moderator: `<@${interaction.user.id}>`,
      target: user ? `<@${user.id}> (${user.tag})` : targetUserId,
      reason: 'Staff rejected the verification application',
      targetAvatarUrl: user?.displayAvatarURL(),
    });
  }
}
