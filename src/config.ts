import 'dotenv/config';

export interface AppConfig {
  token: string;
  clientId: string;
  guildId: string;
  presenceStatus: 'online' | 'idle' | 'dnd';
  activityType: string;
  activityText: string;
  voiceChannelId: string;
  voiceSelfDeaf: boolean;
  voiceSelfMute: boolean;
  voiceAutoReconnectDelayMs: number;
  verificationChannelId: string;
  adminReviewChannelId: string;
  welcomeChannelId: string;
  modLogChannelId: string;
  verifiedRoleId: string;
  unverifiedRoleId?: string;
  verificationPortalTitle: string;
  verificationPortalDesc: string;
  verificationBtnLabel: string;
  verificationBtnEmoji: string;
  verifyQ1Label: string;
  verifyQ1Placeholder: string;
  verifyQ2Label: string;
  verifyQ2Placeholder: string;
  verifyQ3Label: string;
  verifyQ3Placeholder: string;
  autoDmOnApproval: boolean;
  dmApprovalMessage: string;
  welcomeGifUrl: string;
  welcomeTitle: string;
  welcomeDescription: string;
  welcomeEmbedColor: string;
  welcomeShowMemberCount: boolean;
  enableAntiInvite: boolean;
  blockedKeywords: string[];
  enableSpamDetection: boolean;
  staffNotificationRole: string;
  modDmEnabled: boolean;
  roleReviewChannelId: string;
  port: number;
  healthCheckEndpoint: string;
}

function requireEnv(key: string, defaultValue?: string): string {
  // Strip stray whitespace and wrapping quotes (common when pasting into PowerShell / .env files)
  const value = (process.env[key] || defaultValue || '').trim().replace(/^["']|["']$/g, '');
  if (!value) {
    throw new Error(`[Config Error] Missing required environment variable: ${key}`);
  }
  return value;
}

// The token must NEVER have a hardcoded fallback: set it with `fly secrets set DISCORD_TOKEN=...`
const token = requireEnv('DISCORD_TOKEN');
if (!/^[\w-]{20,}\.[\w-]{6}\.[\w-]{20,}$/.test(token)) {
  throw new Error(
    '[Config Error] DISCORD_TOKEN does not look like a bot token (expected 3 parts separated by dots). ' +
      'Use the token from Developer Portal > Bot > Reset Token, not the Client ID / Secret / Public Key.'
  );
}

export const config: AppConfig = {
  token,
  clientId: requireEnv('CLIENT_ID'),
  guildId: requireEnv('GUILD_ID'),
  presenceStatus: (process.env.PRESENCE_STATUS as any) || 'online',
  activityType: process.env.ACTIVITY_TYPE || 'Custom',
  activityText: process.env.ACTIVITY_TEXT || '✉️ Writing letters for those who cannot',
  voiceChannelId: requireEnv('VOICE_CHANNEL_ID'),
  voiceSelfDeaf: process.env.VOICE_SELF_DEAF !== 'false',
  voiceSelfMute: process.env.VOICE_SELF_MUTE === 'true',
  voiceAutoReconnectDelayMs: parseInt(process.env.VOICE_RECONNECT_DELAY_MS || '2000', 10),
  verificationChannelId: requireEnv('VERIFICATION_CHANNEL_ID'),
  adminReviewChannelId: requireEnv('ADMIN_REVIEW_CHANNEL_ID'),
  welcomeChannelId: requireEnv('WELCOME_CHANNEL_ID'),
  modLogChannelId: requireEnv('MOD_LOG_CHANNEL_ID'),
  verifiedRoleId: requireEnv('VERIFIED_ROLE_ID'),
  unverifiedRoleId: process.env.UNVERIFIED_ROLE_ID || undefined,
  verificationPortalTitle: process.env.VERIFICATION_PORTAL_TITLE || '💌 Letter of Introduction',
  verificationPortalDesc: process.env.VERIFICATION_PORTAL_DESC || 'Every guest of Evergarden is welcomed with a letter. Tell us a little about yourself, and our staff will read it and open the doors of the server for you.',
  verificationBtnLabel: process.env.VERIFICATION_BTN_LABEL || 'Write your letter',
  verificationBtnEmoji: process.env.VERIFICATION_BTN_EMOJI || '✉️',
  verifyQ1Label: process.env.VERIFY_Q1_LABEL || 'What brings you to Evergarden?',
  verifyQ1Placeholder: process.env.VERIFY_Q1_PLACEHOLDER || 'Tell us about your interests, projects, or goals...',
  verifyQ2Label: process.env.VERIFY_Q2_LABEL || 'Do you agree to abide by all server rules?',
  verifyQ2Placeholder: process.env.VERIFY_Q2_PLACEHOLDER || 'Type "Yes, I agree"',
  verifyQ3Label: process.env.VERIFY_Q3_LABEL || 'How did you find this server? (Optional)',
  verifyQ3Placeholder: process.env.VERIFY_Q3_PLACEHOLDER || 'Friend invite, GitHub, Twitter, etc.',
  autoDmOnApproval: process.env.AUTO_DM_ON_APPROVAL !== 'false',
  dmApprovalMessage: process.env.DM_APPROVAL_MESSAGE || 'Your letter has been read and approved. The doors of the server are now open to you — welcome.',
  welcomeGifUrl: process.env.WELCOME_GIF_URL || 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnEwNHpxdzd6cHBkcmZocGpxbTllMWsydnB2OWtrb2RjMXR0cWdycyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mDFpdL1UxdVFa/giphy.gif',
  welcomeTitle: process.env.WELCOME_TITLE || '💌 A letter has arrived',
  welcomeDescription: process.env.WELCOME_DESCRIPTION || 'Welcome to {server}, {user}. We are so glad you found us. One more step before the doors open: write a short letter of introduction in {verify}, and our staff will welcome you properly.',
  welcomeEmbedColor: process.env.WELCOME_EMBED_COLOR || '#5865F2',
  welcomeShowMemberCount: process.env.WELCOME_SHOW_MEMBER_COUNT !== 'false',
  enableAntiInvite: process.env.ENABLE_ANTI_INVITE !== 'false',
  blockedKeywords: (process.env.BLOCKED_KEYWORDS || 'discord.gg/,telegram.me/,t.me/,free nitro,crypto gift').split(',').map((s) => s.trim()).filter(Boolean),
  enableSpamDetection: process.env.ENABLE_SPAM_DETECTION !== 'false',
  staffNotificationRole: process.env.STAFF_NOTIFICATION_ROLE || 'Moderator',
  modDmEnabled: process.env.MOD_DM_ENABLED !== 'false',
  roleReviewChannelId: process.env.ROLE_REVIEW_CHANNEL_ID || process.env.ADMIN_REVIEW_CHANNEL_ID || '1497788833587003393',
  port: parseInt(process.env.PORT || '8080', 10),
  healthCheckEndpoint: process.env.HEALTH_CHECK_ENDPOINT || '/healthz',
};