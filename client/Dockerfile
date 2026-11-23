
# --------------------------------------------------
# Frontend build stage
# --------------------------------------------------
FROM node:26-bookworm-slim AS build

WORKDIR /app

ENV npm_config_audit=false
ENV npm_config_fund=false

# Copy workspace manifests and lockfile
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

# Install client workspace and root dependencies
RUN npm ci --workspace=@linkforge/client --include-workspace-root=true

# Copy frontend source
COPY client ./client

# Production build configuration
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_SHORT_URL_BASE=https://go.example.com

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SHORT_URL_BASE=${VITE_SHORT_URL_BASE}

ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}

# Build static frontend
RUN npm run build --workspace=@linkforge/client


# --------------------------------------------------
# Nginx production stage
# --------------------------------------------------
FROM nginx:stable-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY client/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
