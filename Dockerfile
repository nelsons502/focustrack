FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS sync-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts \
    && rm -rf node_modules/next node_modules/@next node_modules/react node_modules/react-dom node_modules/@vercel node_modules/caniuse-lite

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=1000:1000 /app/.next/standalone ./
COPY --from=builder --chown=1000:1000 /app/.next/static ./.next/static
COPY --from=builder --chown=1000:1000 /app/public ./public
# The schedule-sync CronJob runs its TypeScript sources with Node's type stripping.
# The standalone bundle inlines the Elastic client, so the job gets its own
# production-only node_modules and leaves the web server's files untouched.
COPY --from=sync-dependencies --chown=1000:1000 /app/node_modules ./sync/node_modules
COPY --from=builder --chown=1000:1000 /app/package.json ./sync/package.json
COPY --from=builder --chown=1000:1000 /app/scripts ./sync/scripts
COPY --from=builder --chown=1000:1000 /app/lib ./sync/lib
USER 1000:1000
EXPOSE 8080
CMD ["node", "server.js"]
