# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl wget ffmpeg
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY apps/workers/package.json ./apps/workers/
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/workers ./apps/workers
RUN pnpm --filter @ai-content-os/shared build \
 && pnpm --filter @ai-content-os/database build \
 && pnpm --filter @ai-content-os/workers build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl wget ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/workers ./apps/workers
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 4010 4011 4012 4014
CMD ["node", "apps/workers/dist/index.js"]
