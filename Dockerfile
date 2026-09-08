# Build Le Pillaveur pour Dokploy (Next.js standalone + Prisma)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall lance prisma generate : le schema n'est pas encore copié ici
RUN npm ci --legacy-peer-deps --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Pas de sous-chemin /jeux dans l'image sauf choix explicite plus tard
ENV NEXT_PUBLIC_BASE_PATH=
ENV DATABASE_URL="file:./prisma/dev.db"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/geoip-lite ./node_modules/geoip-lite

USER nextjs
EXPOSE 3000
# Sonde interne alignee sur /api/health (qui touche la base) : `docker ps`
# affiche unhealthy quand le conteneur tourne sans volume de base, sans avoir
# a curler depuis l'hote. Node 22 fournit fetch nativement, pas de curl a
# installer dans l'image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
