// The bot's "voice": an Auto Memory Doll who writes and delivers letters.
// Every phrase here is original wording inspired by that setting — edit freely.

export const SIGNATURE = '\n\n*— Evergarden, Auto Memory Doll*';

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export const PHRASES = {
  pinging: ['✉️ Sealing the envelope…', '📮 Off to the post office…', '🖋️ Writing your reply…'],
  pingFast: ['Your letter was delivered swiftly.', 'Delivered before the ink dried.'],
  pingSlow: ['The courier took the long road.', 'A little delayed, but it arrived.'],
  pingLag: ['The letter is still crossing the sea…', 'The post is struggling today.'],
  automodInvite: [
    'Invitations to other places cannot be delivered here.',
    'Please keep invitations to other servers out of our letters.',
  ],
  automodKeyword: [
    'That word has been struck from our letters.',
    'Please choose gentler words — your message was removed.',
  ],
  genericError: [
    'Forgive me, something went wrong. Please try again in a moment.',
    'My apologies — I could not finish that letter. Please try once more.',
  ],
} as const;
