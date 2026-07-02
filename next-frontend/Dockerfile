FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build evaluates lib/env.ts (server env schema) while collecting route
# handler page data — these are placeholders just to satisfy that check; the
# real values are supplied at container runtime via docker-compose.prod.yml.
ARG API_URL=http://localhost:3000
ARG SESSION_PASSWORD=build-time-placeholder-must-be-32-characters-long
ENV API_URL=${API_URL}
ENV SESSION_PASSWORD=${SESSION_PASSWORD}
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
