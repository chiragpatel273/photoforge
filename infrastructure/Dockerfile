FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
FROM base AS build
ENV API_INTERNAL_URL=http://api:4000
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm db:generate && pnpm build
FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 4000
CMD ["pnpm", "--filter", "@photoforge/api", "start"]
