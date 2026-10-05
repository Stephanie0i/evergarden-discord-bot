import { ActivityType, Client } from 'discord.js';
import { config } from '../config.js';
import { getTheme } from '../lib/theme.js';
import { fill } from '../lib/ui.js';

/** Rotates the bot's status through the phrases saved in the theme (edit them with /theme). */
export class PresenceService {
  private timer: NodeJS.Timeout | null = null;
  private index = 0;

  constructor(private client: Client) {}

  public start(): void {
    this.stop();
    this.tick();
  }

  /** Call after the phrases or interval change so they apply immediately. */
  public restart(): void {
    this.index = 0;
    this.start();
  }

  public stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private tick = (): void => {
    const theme = getTheme();
    const phrases = theme.statuses.length ? theme.statuses : [config.activityText];
    const members = this.client.guilds.cache.get(config.guildId)?.memberCount ?? this.client.guilds.cache.first()?.memberCount ?? 0;
    const text = fill(phrases[this.index % phrases.length], { members: String(members) });
    this.index = (this.index + 1) % phrases.length;

    try {
      const type = ActivityType[config.activityType as keyof typeof ActivityType] ?? ActivityType.Custom;
      this.client.user?.setPresence({
        status: config.presenceStatus,
        activities: type === ActivityType.Custom ? [{ name: 'Custom Status', type, state: text }] : [{ name: text, type: type as number }],
      });
    } catch (err) {
      console.error('⚠️ [Presence] Failed to update status:', err);
    }

    // Presence updates are rate-limited by Discord, so never go below one minute
    this.timer = setTimeout(this.tick, Math.max(1, theme.statusIntervalMin) * 60_000);
  };
}
