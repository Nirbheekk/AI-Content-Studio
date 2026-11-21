# syntax=docker/dockerfile:1.7
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
RUN apk add --no-cache libc6-compat openssl wget
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY packages/ai-providers/package.json ./packages/ai-providers/
COPY packages/remotion-engine/package.json ./packages/remotion-engine/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY packages/ai-providers ./packages/ai-providers
COPY packages/remotion-engine ./packages/remotion-engine
COPY packages/integrations ./packages/integrations
COPY apps/workers ./apps/workers
RUN pnpm --filter @ai-content-os/shared build \
 && pnpm --filter @ai-content-os/database build \
 && pnpm --filter @ai-content-os/ai-providers build \
 && pnpm --filter @ai-content-os/remotion-engine build \
 && pnpm --filter @ai-content-os/integrations build \
 && pnpm --filter @ai-content-os/workers build

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY packages/ai-providers/package.json ./packages/ai-providers/
COPY packages/remotion-engine/package.json ./packages/remotion-engine/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    wget \
    ffmpeg \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
 && mkdir -p /tmp/remotion && chown -R node:node /tmp/remotion \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production
ENV WORKER_ROLE=rendering
ENV WORKER_PORT=4013
ENV REMOTION_TMP_DIR=/tmp/remotion
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=prod-deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/prisma ./packages/database/prisma
COPY --from=prod-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/packages/ai-providers/package.json ./packages/ai-providers/package.json
COPY --from=builder --chown=node:node /app/packages/ai-providers/dist ./packages/ai-providers/dist
COPY --from=prod-deps --chown=node:node /app/packages/ai-providers/node_modules ./packages/ai-providers/node_modules
COPY --from=builder --chown=node:node /app/packages/remotion-engine/package.json ./packages/remotion-engine/package.json
COPY --from=builder --chown=node:node /app/packages/remotion-engine/dist ./packages/remotion-engine/dist
COPY --from=prod-deps --chown=node:node /app/packages/remotion-engine/node_modules ./packages/remotion-engine/node_modules
COPY --from=builder --chown=node:node /app/packages/integrations/package.json ./packages/integrations/package.json
COPY --from=builder --chown=node:node /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=prod-deps --chown=node:node /app/packages/integrations/node_modules ./packages/integrations/node_modules
COPY --from=builder --chown=node:node /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=builder --chown=node:node /app/apps/workers/dist ./apps/workers/dist
COPY --from=prod-deps --chown=node:node /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 4013
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4013/health || exit 1
CMD ["node", "apps/workers/dist/index.js"]
