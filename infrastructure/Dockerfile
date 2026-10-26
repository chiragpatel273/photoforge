FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV COREPACK_HOME=/pnpm/corepack
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
FROM base AS build
ENV API_INTERNAL_URL=http://api:4000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY infrastructure/prisma ./infrastructure/prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate && pnpm build
FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
CMD ["pnpm", "--filter", "@photoforge/api", "start"]
