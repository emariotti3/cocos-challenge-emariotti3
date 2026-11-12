# syntax=docker/dockerfile:1.6

# ---- deps: install all dependencies (build needs devDependencies) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build: compile TypeScript, then drop devDependencies ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY scripts/copy-assets.cjs ./scripts/
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

# ---- runtime: minimal, non-root, healthchecked ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health/live || exit 1
ENTRYPOINT ["./entrypoint.sh"]
