import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { JsonStore } from './jsonStore.js';

export type ColorKey = 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface Theme {
  brandName: string;
  footerText: string;
  bannerUrl: string;
  logoUrl: string;
  statuses: string[];
  statusIntervalMin: number;
  colors: Record<ColorKey, string>;
  welcome: { title: string; description: string; gifUrl: string };
  verification: { title: string; description: string; buttonLabel: string; buttonEmoji: string };
}

export interface ThemePatch {
  brandName?: string;
  footerText?: string;
  bannerUrl?: string;
  logoUrl?: string;
  statuses?: string[];
  statusIntervalMin?: number;
  colors?: Partial<Record<ColorKey, string>>;
  welcome?: Partial<Theme['welcome']>;
  verification?: Partial<Theme['verification']>;
}

/** Built-in look. Text defaults come from config.ts (env vars), so nothing changes until you edit the theme. */
export function defaultTheme(): Theme {
  return {
    brandName: 'Evergarden',
    footerText: 'Auto Memory Doll Service',
    bannerUrl: '',
    logoUrl: '',
    // Rotating bot status. {members} is replaced with the server's member count.
    statuses: [
      '✉️ Writing letters for those who cannot',
      '💜 Delivering feelings, one letter at a time',
      '🌸 Tending the garden of Evergarden',
      '📮 Auto Memory Doll, at your service',
      '🔊 Keeping the lounge company • {members} guests',
      '🪻 Need help? Type /help',
    ],
    statusIntervalMin: 3,
    // Violet (the hair ribbon & flowers), gold (the hair ornaments), emerald (the brooch), dusk blue, rose
    colors: {
      primary: '#9B7EDE',
      success: '#4FB99F',
      warning: '#E3C27D',
      danger: '#D96C7B',
      info: '#7C9CD6',
    },
    welcome: {
      title: config.welcomeTitle,
      description: config.welcomeDescription,
      gifUrl: config.welcomeGifUrl,
    },
    verification: {
      title: config.verificationPortalTitle,
      description: config.verificationPortalDesc,
      buttonLabel: config.verificationBtnLabel,
      buttonEmoji: config.verificationBtnEmoji,
    },
  };
}

function mergePatch(a: ThemePatch, b: ThemePatch): ThemePatch {
  return {
    ...a,
    ...b,
    colors: { ...a.colors, ...b.colors },
    welcome: { ...a.welcome, ...b.welcome },
    verification: { ...a.verification, ...b.verification },
  };
}

function applyPatch(base: Theme, patch: ThemePatch): Theme {
  return {
    brandName: patch.brandName ?? base.brandName,
    footerText: patch.footerText ?? base.footerText,
    bannerUrl: patch.bannerUrl ?? base.bannerUrl,
    logoUrl: patch.logoUrl ?? base.logoUrl,
    statuses: patch.statuses ?? base.statuses,
    statusIntervalMin: patch.statusIntervalMin ?? base.statusIntervalMin,
    colors: { ...base.colors, ...patch.colors } as Theme['colors'],
    welcome: { ...base.welcome, ...patch.welcome } as Theme['welcome'],
    verification: { ...base.verification, ...patch.verification } as Theme['verification'],
  };
}

const store = new JsonStore<ThemePatch>('theme.json', () => ({}));
let saved: ThemePatch = store.read();
let current: Theme = applyPatch(defaultTheme(), saved);

export function getTheme(): Theme {
  return current;
}

export function updateTheme(patch: ThemePatch): void {
  saved = mergePatch(saved, patch);
  store.write(saved);
  current = applyPatch(defaultTheme(), saved);
}

export function resetTheme(): void {
  saved = {};
  store.remove();
  current = defaultTheme();
}

// ---------- validation helpers ----------
export function isHexColor(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim());
}

export function normalizeHex(value: string): string {
  return `#${value.trim().replace('#', '').toLowerCase()}`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Unicode emoji or custom Discord emoji like <:name:123> / <a:name:123>. */
export function isValidEmoji(value: string): boolean {
  const v = value.trim();
  return (
    /^<a?:\w{2,32}:\d{17,20}>$/.test(v) ||
    /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}]*$/u.test(v)
  );
}

// ---------- embed helpers ----------
export function colorInt(key: ColorKey): number {
  return parseInt(current.colors[key].replace('#', ''), 16);
}

export function footerLine(): string {
  const t = current;
  return t.footerText ? `${t.brandName} • ${t.footerText}` : t.brandName;
}

/** Base embed with the theme's color + footer. Use for every message the bot sends. */
export function themedEmbed(kind: ColorKey = 'primary'): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(colorInt(kind));
  embed.setFooter(
    current.logoUrl ? { text: footerLine(), iconURL: current.logoUrl } : { text: footerLine() }
  );
  return embed;
}

export function withBanner(embed: EmbedBuilder): EmbedBuilder {
  if (current.bannerUrl) embed.setImage(current.bannerUrl);
  return embed;
}
