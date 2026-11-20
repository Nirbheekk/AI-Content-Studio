# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat wget
RUN corepack enable && corepack prepare pnpm@12.21.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --no-frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ai-content-os/shared build \
 && pnpm --filter @ai-content-os/web build

FROM node:22-alpine AS runner
RUN apk add --no-cache wget
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared ./packages/shared
COPY --from=builder --chown=node:node /app/apps/web ./apps/web
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3000"]
