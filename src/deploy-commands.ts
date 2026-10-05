// Registers the slash commands with Discord. Run on your PC with: npm run deploy:commands
// REGISTER_ONLY stops index.ts from logging the bot in while we only need the command definitions.
process.env.REGISTER_ONLY = '1';

import { REST, Routes } from 'discord.js';
import { config } from './config.js';

const modules = await Promise.all([
  import('./commands/admin.js'),
  import('./commands/health.js'),
  import('./commands/help.js'),
  import('./commands/join-vc.js'),
  import('./commands/ping.js'),
  import('./commands/roles.js'),
  import('./commands/theme.js'),
  import('./commands/verify-setup.js'),
]);

const commands = modules.map((m) => m.data.toJSON());
const rest = new REST({ version: '10' }).setToken(config.token);

try {
  console.log(`🚀 Registering ${commands.length} slash commands...`);

  if (config.guildId) {
    // Guild commands update instantly
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log(`✅ Registered ${commands.length} commands to guild ${config.guildId}: ${commands.map((c) => `/${c.name}`).join(' ')}`);
  } else {
    // Global commands can take up to an hour to appear
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`✅ Registered ${commands.length} global commands.`);
  }
  process.exit(0);
} catch (error) {
  console.error('❌ Failed to register commands:', error);
  process.exit(1);
}
