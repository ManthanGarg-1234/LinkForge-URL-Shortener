
FROM node:26-bookworm-slim AS base

WORKDIR /app

ENV npm_config_audit=false
ENV npm_config_fund=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# Install complete workspace dependencies
FROM base AS dependencies

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci


# Generate Prisma Client
FROM dependencies AS build

COPY server ./server

RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    npm run db:generate --workspace=@linkforge/server


# Production database migration image
FROM build AS migration

ENV NODE_ENV=production

CMD ["npm", "run", "db:deploy", "--workspace=@linkforge/server"]


# Install production dependencies
FROM base AS runtime-dependencies

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci --workspace=@linkforge/server --omit=dev


# API runtime image
FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=5000

# Root-level dependencies
COPY --from=runtime-dependencies --chown=node:node \
    /app/node_modules ./node_modules

# Server workspace-local dependencies
COPY --from=runtime-dependencies --chown=node:node \
    /app/server/node_modules ./server/node_modules

# Application source and generated Prisma Client
COPY --from=build --chown=node:node \
    /app/server/src ./server/src

COPY --chown=node:node \
    server/package.json ./server/package.json

COPY --chown=node:node \
    package.json ./package.json

USER node

EXPOSE 5000

CMD ["node", "server/src/server.js"]
