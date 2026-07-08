FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Strip devDependencies so the runtime stage copies a prod-only node_modules.
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY migrations/ ./migrations/
RUN mkdir -p /data

# `exec` makes node PID 1 so it receives SIGTERM directly from the platform;
# without it the shell stays PID 1 and never forwards signals, so the app's
# graceful-shutdown handler (await in-flight tick, close SQLite) never runs.
CMD ["sh", "-c", "node dist/infra/db/migrate.js up && exec node dist/main.js"]
