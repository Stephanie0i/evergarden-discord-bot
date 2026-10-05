import { ButtonInteraction, ChatInputCommandInteraction, Interaction, UserSelectMenuInteraction } from 'discord.js';
import { verificationService } from '../index.js';
import { PHRASES, pick } from '../lib/persona.js';
import { EPHEMERAL, errorEmbed } from '../lib/ui.js';
import * as adminCmd from '../commands/admin.js';
import * as healthCmd from '../commands/health.js';
import * as helpCmd from '../commands/help.js';
import * as joinVcCmd from '../commands/join-vc.js';
import * as pingCmd from '../commands/ping.js';
import * as rolesCmd from '../commands/roles.js';
import * as themeCmd from '../commands/theme.js';
import * as verifySetupCmd from '../commands/verify-setup.js';

const commands = new Map<string, { execute: (i: ChatInputCommandInteraction) => Promise<void> }>([
  ['admin', adminCmd],
  ['health', healthCmd],
  ['help', helpCmd],
  ['join-vc', joinVcCmd],
  ['ping', pingCmd],
  ['roles', rolesCmd],
  ['theme', themeCmd],
  ['verify-setup', verifySetupCmd],
]);

export async function handleInteraction(interaction: Interaction): Promise<void> {
  try {
    // 1. Slash commands
    if (interaction.isChatInputCommand()) {
      await commands.get(interaction.commandName)?.execute(interaction);
      return;
    }

    // 2. Buttons and select menus
    if (interaction.isButton() || interaction.isAnySelectMenu()) {
      const id = interaction.customId;
      if (id.startsWith('adm:')) return await adminCmd.handleComponent(interaction as ButtonInteraction | UserSelectMenuInteraction);
      if (id.startsWith('rol:')) return await rolesCmd.handleComponent(interaction);
      if (interaction.isButton()) {
        if (id.startsWith('thm:')) return await themeCmd.handleComponent(interaction);
        if (id === 'verify_start') return await verificationService.showVerificationModal(interaction);
        if (id.startsWith('verify_approve_')) return await verificationService.handleApproval(interaction, id.replace('verify_approve_', ''));
        if (id.startsWith('verify_reject_')) return await verificationService.handleRejection(interaction, id.replace('verify_reject_', ''));
      }
      return;
    }

    // 3. Modals
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith('adm:m:')) return await adminCmd.handleModal(interaction);
      if (id.startsWith('thm:m:')) return await themeCmd.handleModal(interaction);
      if (id.startsWith('rol:m:')) return await rolesCmd.handleModal(interaction);
      if (id === 'verify_modal') return await verificationService.handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    if (interaction.isRepliable()) {
      const payload = { embeds: [errorEmbed(pick(PHRASES.genericError))], flags: EPHEMERAL } as const;
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch {
        /* interaction expired */
      }
    }
  }
}
