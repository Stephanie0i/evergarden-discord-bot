import { Guild, GuildMember, User } from 'discord.js';
import { config } from '../config.js';
import { JsonStore } from '../lib/jsonStore.js';
import { SIGNATURE } from '../lib/persona.js';
import { ColorKey, themedEmbed } from '../lib/theme.js';
import { formatDuration, truncate } from '../lib/ui.js';
import { ModLogService } from './modLogService.js';

export interface WarningEntry {
  id: string;
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  at: number;
}

type WarningDb = Record<string, WarningEntry[]>;

export interface ActionResult {
  ok: boolean;
  message: string;
}

export class ModerationService {
  private store = new JsonStore<WarningDb>('warnings.json', () => ({}));
  private db: WarningDb = this.store.read();

  constructor(private modLog: ModLogService) {}

  // ---------- warnings storage ----------
  public getWarnings(userId: string): WarningEntry[] {
    return this.db[userId] ?? [];
  }

  // ---------- safety checks ----------
  /** Returns an error message if the moderator may not act on this target, otherwise null. */
  public guard(guild: Guild, moderator: GuildMember, targetId: string, targetMember: GuildMember | null, needsMember: boolean): string | null {
    if (targetId === moderator.id) return "You can't moderate yourself.";
    if (targetId === guild.client.user.id) return "I can't moderate myself.";
    if (targetId === guild.ownerId) return "The server owner can't be moderated.";
    if (!targetMember) return needsMember ? 'That user is not in the server.' : null;
    if (guild.ownerId !== moderator.id && targetMember.roles.highest.comparePositionTo(moderator.roles.highest) >= 0) {
      return 'That member has the same or a higher role than you.';
    }
    return null;
  }

  private async dm(user: User, guild: Guild, title: string, kind: ColorKey, reason: string, extra?: string): Promise<boolean> {
    if (!config.modDmEnabled) return false;
    try {
      const embed = themedEmbed(kind)
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
        .setTitle(title)
        .setDescription(`${extra ? `${extra}\n\n` : ''}**Reason**\n> ${truncate(reason, 900)}${SIGNATURE}`)
        .setTimestamp();
      await user.send({ embeds: [embed] });
      return true;
    } catch {
      return false; // DMs closed
    }
  }

  private auditReason(moderator: User, reason: string): string {
    return truncate(`${reason} (by ${moderator.tag})`, 500);
  }

  // ---------- actions ----------
  public async warn(guild: Guild, moderator: User, target: User, reason: string): Promise<ActionResult> {
    const list = (this.db[target.id] ??= []);
    list.push({ id: Date.now().toString(36), reason, moderatorId: moderator.id, moderatorTag: moderator.tag, at: Date.now() });
    this.store.write(this.db);

    const dmOk = await this.dm(target, guild, '⚠️ You received a warning', 'warning', reason, `Total warnings: **${list.length}**`);
    await this.modLog.logAction({
      action: 'MEMBER_WARNED',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.tag})`,
      reason,
      targetAvatarUrl: target.displayAvatarURL(),
      details: { 'Total warnings': String(list.length), 'DM delivered': dmOk ? 'Yes' : 'No' },
    });
    return { ok: true, message: `Warned **${target.tag}** — they now have **${list.length}** warning(s).${dmOk ? '' : ' (DM could not be delivered)'}` };
  }

  public async clearWarnings(moderator: User, target: User): Promise<ActionResult> {
    const count = this.getWarnings(target.id).length;
    delete this.db[target.id];
    this.store.write(this.db);
    await this.modLog.logAction({
      action: 'WARNINGS_CLEARED',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.tag})`,
      reason: `Cleared ${count} warning(s)`,
      targetAvatarUrl: target.displayAvatarURL(),
    });
    return { ok: true, message: `Cleared **${count}** warning(s) for **${target.tag}**.` };
  }

  public async timeout(guild: Guild, moderator: User, target: GuildMember, ms: number, reason: string): Promise<ActionResult> {
    if (!target.moderatable) return { ok: false, message: "I can't time out that member (my role must be above theirs, with Moderate Members permission)." };
    const dmOk = await this.dm(target.user, guild, '⏳ You have been timed out', 'warning', reason, `Duration: **${formatDuration(ms)}**`);
    await target.timeout(ms, this.auditReason(moderator, reason));
    await this.modLog.logAction({
      action: 'MEMBER_TIMEOUT',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.user.tag})`,
      reason,
      targetAvatarUrl: target.user.displayAvatarURL(),
      details: { Duration: formatDuration(ms), 'DM delivered': dmOk ? 'Yes' : 'No' },
    });
    return { ok: true, message: `Timed out **${target.user.tag}** for **${formatDuration(ms)}**.` };
  }

  public async untimeout(moderator: User, target: GuildMember): Promise<ActionResult> {
    if (!target.moderatable) return { ok: false, message: "I can't change that member's timeout." };
    await target.timeout(null, this.auditReason(moderator, 'Timeout removed'));
    await this.modLog.logAction({
      action: 'MEMBER_UNTIMEOUT',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.user.tag})`,
      reason: 'Timeout removed by staff',
      targetAvatarUrl: target.user.displayAvatarURL(),
    });
    return { ok: true, message: `Removed the timeout from **${target.user.tag}**.` };
  }

  public async kick(guild: Guild, moderator: User, target: GuildMember, reason: string): Promise<ActionResult> {
    if (!target.kickable) return { ok: false, message: "I can't kick that member (my role must be above theirs, with Kick Members permission)." };
    const dmOk = await this.dm(target.user, guild, '👢 You were kicked', 'danger', reason); // must DM before the kick
    await target.kick(this.auditReason(moderator, reason));
    await this.modLog.logAction({
      action: 'MEMBER_KICKED',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.user.tag})`,
      reason,
      targetAvatarUrl: target.user.displayAvatarURL(),
      details: { 'DM delivered': dmOk ? 'Yes' : 'No' },
    });
    return { ok: true, message: `Kicked **${target.user.tag}**.` };
  }

  public async ban(guild: Guild, moderator: User, target: User, member: GuildMember | null, reason: string, deleteDays: number): Promise<ActionResult> {
    if (member && !member.bannable) return { ok: false, message: "I can't ban that member (my role must be above theirs, with Ban Members permission)." };
    const dmOk = member ? await this.dm(target, guild, '🔨 You were banned', 'danger', reason) : false;
    await guild.members.ban(target.id, { reason: this.auditReason(moderator, reason), deleteMessageSeconds: deleteDays * 86400 });
    await this.modLog.logAction({
      action: 'MEMBER_BANNED',
      moderator: `<@${moderator.id}>`,
      target: `<@${target.id}> (${target.tag})`,
      reason,
      targetAvatarUrl: target.displayAvatarURL(),
      details: { 'Messages deleted': `${deleteDays} day(s)`, 'DM delivered': dmOk ? 'Yes' : 'No' },
    });
    return { ok: true, message: `Banned **${target.tag}**.` };
  }

  public async unban(guild: Guild, moderator: User, userId: string, reason: string): Promise<ActionResult> {
    try {
      const user = await guild.bans.remove(userId, this.auditReason(moderator, reason));
      await this.modLog.logAction({
        action: 'MEMBER_UNBANNED',
        moderator: `<@${moderator.id}>`,
        target: user ? `<@${user.id}> (${user.tag})` : userId,
        reason,
        targetAvatarUrl: user?.displayAvatarURL(),
      });
      return { ok: true, message: `Unbanned **${user?.tag ?? userId}**.` };
    } catch {
      return { ok: false, message: 'That user is not banned (or the ID is invalid).' };
    }
  }
}
