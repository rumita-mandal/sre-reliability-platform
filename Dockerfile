# syntax=docker/dockerfile:1

# ---- Stage 1: install production dependencies only --------------------------
FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Stage 2: minimal runtime image ------------------------------------------
FROM node:25-alpine AS runtime

ARG APP_VERSION=dev
ARG GIT_COMMIT=unknown

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION} \
    GIT_COMMIT=${GIT_COMMIT}

WORKDIR /app

# Copy with correct ownership so we can run as the unprivileged "node" user.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run node directly (no npm wrapper) so SIGTERM reaches the process.
CMD ["node", "src/server.js"]
