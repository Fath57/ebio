# Stage 1: base
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# Stage 2: install, build, prune
FROM base AS builder
ENV CI=true
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install -r --offline --prefer-offline
RUN pnpm --filter {apps/landing}... build
RUN pnpm deploy --legacy --filter="./apps/landing" --prod /prod/landing

# Stage 3: runtime — SSR needs Node, not nginx
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /prod/landing/node_modules ./node_modules
COPY --from=builder /prod/landing/package.json ./package.json
COPY --from=builder /app/apps/landing/build ./build

EXPOSE 3000
CMD ["./node_modules/.bin/react-router-serve", "./build/server/index.js"]
