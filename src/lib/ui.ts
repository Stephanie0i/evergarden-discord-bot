import { MessageFlags } from 'discord.js';
import { themedEmbed } from './theme.js';

export const EPHEMERAL = MessageFlags.Ephemeral;

export const errorEmbed = (text: string) => themedEmbed('danger').setDescription(`❌ ${text}`);
export const successEmbed = (text: string) => themedEmbed('success').setDescription(`✅ ${text}`);
export const warningEmbed = (text: string) => themedEmbed('warning').setDescription(`⚠️ ${text}`);

/** Discord timestamp markup, e.g. <t:1700000000:R> */
export const stamp = (ms: number, style: 'R' | 'F' | 'f' | 'd' | 'D' = 'R'): string =>
  `<t:${Math.floor(ms / 1000)}:${style}>`;

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "10m", "2h", "1d", "1w" -> milliseconds (null if invalid). */
export function parseDuration(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d|w)$/);
  if (!m) return null;
  const mult: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
  return parseInt(m[1], 10) * mult[m[2]];
}

export function formatDuration(ms: number): string {
  const d = Math.floor(ms / 864e5);
  const h = Math.floor((ms % 864e5) / 36e5);
  const m = Math.floor((ms % 36e5) / 6e4);
  const s = Math.floor((ms % 6e4) / 1e3);
  const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, !d && !h && !m && s && `${s}s`].filter(Boolean);
  return parts.join(' ') || '0s';
}

/** Replaces {placeholders} in a template; unknown placeholders are left untouched. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
