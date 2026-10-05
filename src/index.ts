import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  Events
} from 'discord.js';
import http from 'node:http';
import { config } from './config.js';
import { VoiceService } from './services/voiceService.js';
import { VerificationService } from './services/verificationService.js';
import { ModLogService } from './services/modLogService.js';
import { ModerationService } from './services/moderationService.js';
import { PresenceService } from './services/presenceService.js';
import { RoleRequestService } from './services/roleRequestService.js';
import { HealthService } from './services/healthService.js';
import { handleInteraction } from './events/interactionCreate.js';
import { handleMemberAdd } from './events/guildMemberAdd.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate.js';

// 1. Initialize Client with strict minimal required Gateway Intents
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Required for verification, role assignment & welcome
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required for message event monitoring
    GatewayIntentBits.GuildVoiceStates, // Required for 24/7 voice persistence
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Message],
  presence: {
    status: config.presenceStatus || 'online',
    activities: [
      {
        name: config.activityText || 'Server Security & 24/7 Audio',
        type: ActivityType[config.activityType as keyof typeof ActivityType] ?? ActivityType.Custom,
      },
    ],
  },
});

// 2. Initialize Core Subsystem Services
export const modLogService = new ModLogService(client);
export const moderationService = new ModerationService(modLogService);
export const roleRequestService = new RoleRequestService(modLogService);
export const presenceService = new PresenceService(client);
export const verificationService = new VerificationService(client, modLogService);
export const voiceService = new VoiceService(client, modLogService);
export const healthService = new HealthService(client, voiceService);

// 3. Register Event Listeners
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ [${new Date().toISOString()}] Bot online as ${readyClient.user.tag}`);
  console.log(`🌐 Connected to ${readyClient.guilds.cache.size} guilds`);

  // Start the rotating status
  presenceService.start();

  // Join the persistent 24/7 voice channel immediately on startup
  try {
    await voiceService.joinPersistentChannel();
  } catch (err) {
    console.error('Failed to join voice channel on ready:', err);
  }
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch((err) => console.error('❌ Unhandled interaction error:', err));
});
client.on(Events.GuildMemberAdd, (member) => handleMemberAdd(member));
client.on(Events.MessageCreate, (message) => handleMessageCreate(message));
client.on(Events.VoiceStateUpdate, (oldState, newState) => handleVoiceStateUpdate(oldState, newState));

// Gateway-Level Network & WebSocket Safety Listeners
client.on(Events.Error, (error) => {
  console.error('🌐 [Discord Gateway Error]:', error.message || error);
});

client.on(Events.Warn, (warning) => {
  console.warn('⚠️ [Discord Gateway Warning]:', warning);
});

client.rest.on('rateLimited', (info) => {
  console.warn(`⏳ [Discord REST Rate Limit] Hit route: ${info.route}. Retry after: ${info.timeToReset}ms`);
});

// 4. Global Anti-Crash & Process Resilience Handlers
// Prevents abrupt Node.js process crashes from transient Discord WebSocket drops,
// socket resets (ECONNRESET, ETIMEDOUT), or unhandled asynchronous rejections.
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  const errorMsg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error('⚠️ [Anti-Crash] Unhandled Promise Rejection detected:');
  console.error('• Reason:', errorMsg);
  console.error('• Promise Context:', promise);

  // Safely forward error notice to mod-logs channel without crashing
  if (client.isReady() && config.modLogChannelId) {
    modLogService.logAction({
      action: 'SYSTEM_ERROR',
      moderator: 'Node.js Runtime Guard',
      target: 'Promise Pipeline',
      reason: errorMsg.slice(0, 500),
      details: { 'Type': 'unhandledRejection', 'Timestamp': new Date().toISOString() },
    }).catch(() => null);
  }
});

process.on('uncaughtException', (error: Error, origin: string) => {
  console.error(`💥 [Anti-Crash] Uncaught Exception encountered (${origin}):`);
  console.error(error.stack || error.message);

  if (client.isReady() && config.modLogChannelId) {
    modLogService.logAction({
      action: 'SYSTEM_ERROR',
      moderator: 'Node.js Runtime Guard',
      target: origin || 'Event Loop',
      reason: (error.message || 'Unknown Exception').slice(0, 500),
      details: { 'Type': 'uncaughtException', 'Stack Trace': (error.stack || '').slice(0, 400) },
    }).catch(() => null);
  }
});

process.on('uncaughtExceptionMonitor', (error: Error, origin: string) => {
  console.warn(`🔍 [Anti-Crash Monitor] Exception observed in process (${origin}):`, error.message);
});

// 5. Lightweight HTTP health endpoint (optional: handy for uptime monitors). Returns JSON telemetry
const server = http.createServer((req, res) => {
  const isHealth = req.url === config.healthCheckEndpoint || req.url === '/healthz' || req.url === '/health';
  if (isHealth) {
    const metrics = healthService.getMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), metrics }, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// REGISTER_ONLY is set by `npm run deploy:commands` so registering commands never starts a second live bot
const REGISTER_ONLY = process.env.REGISTER_ONLY === '1';

if (!REGISTER_ONLY) {
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`🩺 Health server listening on port ${config.port} (${config.healthCheckEndpoint})`);
  });
}

// 6. Clean Process Termination (SIGINT / SIGTERM from the host)
async function shutdown(signal: string) {
  console.log(`🛑 Received ${signal}. Shutting down gracefully...`);
  server.close();
  presenceService.stop();
  voiceService.destroy();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 7. Connect to Discord Gateway
if (!REGISTER_ONLY) {
  client.login(config.token).catch((err) => {
    console.error('💥 Fatal Discord login failure:', err);
    process.exit(1);
  });
}