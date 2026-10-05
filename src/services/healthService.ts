import { Client } from 'discord.js';
import os from 'node:os';
import { VoiceService } from './voiceService.js';

export class HealthService {
  private client: Client;
  private voiceService: VoiceService;
  private startTime = Date.now();

  constructor(client: Client, voiceService: VoiceService) {
    this.client = client;
    this.voiceService = voiceService;
  }

  public getMetrics() {
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor((Date.now() - this.startTime) / 1000);
    const cpuLoads = os.loadavg();

    return {
      status: 'healthy',
      uptimeSeconds: uptimeSec,
      uptimeFormatted: this.formatUptime(uptimeSec),
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      },
      discord: {
        wsPingMs: this.client.ws.ping >= 0 ? this.client.ws.ping : 0,
        guildCount: this.client.guilds.cache.size,
        cachedUsers: this.client.users.cache.size,
      },
      voice: {
        status: this.voiceService.getConnectionStatus(),
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuLoad1m: Math.round(cpuLoads[0] * 100) / 100,
        freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      },
    };
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${d > 0 ? `${d}d ` : ''}${h}h ${m}m ${s}s`;
  }
}