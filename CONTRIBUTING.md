# Contributing to Evergarden

Thank you for helping make this bot more useful and beautiful.

## Guidelines

1. **Keep it free-to-run** — Prefer low memory, no heavy databases, and Fly.io / small VPS friendliness.
2. **Stay themed** — New user-facing text should fit the Auto Memory Doll / letter metaphor (or be clearly optional).
3. **TypeScript strict** — No `any` unless justified. Run `npm run lint` before opening a PR.
4. **Modular** — Put logic in `services/` or `lib/`, keep commands thin.
5. **No secrets** — Never commit `.env` or real tokens/IDs.

## Setup for development

```bash
npm install
cp .env.example .env   # fill with a test bot
npm run deploy:commands
npm run dev
```

## Pull requests

- One focused change per PR when possible.
- Describe what and why.
- Screenshots of embeds / commands are appreciated.

## Ideas welcome

- More theme presets
- Optional SQLite/Postgres store
- Extra moderation modules
- Multi-guild improvements

Open an issue first for larger features so we can align on design.
