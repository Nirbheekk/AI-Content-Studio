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
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/workers ./apps/workers
RUN pnpm --filter @ai-content-os/shared build \
 && pnpm --filter @ai-content-os/database build \
 && pnpm --filter @ai-content-os/workers build

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
RUN apk add --no-cache libc6-compat openssl wget ffmpeg \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=prod-deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/prisma ./packages/database/prisma
COPY --from=prod-deps --chown=node:node /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=node:node /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=builder --chown=node:node /app/apps/workers/dist ./apps/workers/dist
COPY --from=prod-deps --chown=node:node /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 4010 4011 4012 4014
CMD ["node", "apps/workers/dist/index.js"]
