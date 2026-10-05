# ========================================================
# Stage 1: Build & TypeScript Compilation
# ========================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools needed for native voice dependencies (opus/sodium)
RUN apk add --no-cache python3 make g++ git

COPY package*.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

# ========================================================
# Stage 2: Production Minimal Runtime (~48MB RSS)
# ========================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# dumb-init provides proper SIGTERM/SIGINT signal handling for Fly.io machines
RUN apk add --no-cache dumb-init curl ffmpeg

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Run as unprivileged node user
USER node

EXPOSE 8080

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]