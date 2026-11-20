# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl wget
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY packages/integrations ./packages/integrations
COPY apps/api ./apps/api
RUN pnpm --filter @ai-content-os/shared build \
 && pnpm --filter @ai-content-os/database build \
 && pnpm --filter @ai-content-os/integrations build \
 && pnpm --filter @ai-content-os/api build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl wget
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/api ./apps/api
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
