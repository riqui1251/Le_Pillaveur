# Image de production de Le Pillaveur (Next.js standalone + Prisma), construite
# SUR le VPS par scripts/prod-deploy.sh a partir de l'archive envoyee par
# scripts/deploy-from-local.sh.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# postinstall lance prisma generate : le schema n'est pas encore copié ici.
# --legacy-peer-deps reste par prudence, mais ne change plus rien : depuis le
# 25/10/2026, `npm ci` installe le même arbre avec ou sans lui (vérifié dans
# un dossier vierge, npm 10.9), et src/lib/package-lock.test.ts refuse un lock
# dont une dépendance paire n'est pas satisfaite. Le retirer ne se vérifie
# qu'en construisant l'image, donc ici, sur le VPS, où un refus coûterait un
# déploiement.
RUN npm ci --legacy-peer-deps --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Pas de sous-chemin /jeux dans l'image sauf choix explicite plus tard
ENV NEXT_PUBLIC_BASE_PATH=
ENV DATABASE_URL="file:./prisma/dev.db"
RUN npx prisma generate
# Sha git court de ce qui est construit : prod-deploy.sh le lit dans le
# BUILD_INFO de l'archive et le passe en --build-arg. Posé en NEXT_PUBLIC_*
# juste AVANT `next build`, pour que Next l'inline à la compilation ; il est lu
# par src/components/supervision/BuildStamp.tsx (serveur) ET par
# src/lib/client-error-report.ts (navigateur, avec chaque rapport de
# plantage) : il est donc public dans le bundle client, ce n'est pas un
# secret. Déclaré ICI et pas en tête de
# fichier : un ARG n'invalide le cache qu'à partir de sa première utilisation,
# donc un sha différent à chaque déploiement laisse `npm ci` et
# `prisma generate` en cache. `dev` = image construite sans sha (à la main).
ARG GIT_SHA=dev
ENV NEXT_PUBLIC_BUILD_SHA=$GIT_SHA
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
# Pas de copie de /app/prisma : en prod le volume de données est monté sur
# /app/prisma et masquerait tout ce qu'on y aurait mis ; le client généré
# ci-dessous embarque déjà son schéma. Plus de copie de geoip-lite non plus :
# le paquet a quitté le projet.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Même sha que le build, relu à l'exécution par BuildStamp (process.env) et
# posé en étiquette OCI, lisible par `docker image inspect` sans démarrer le
# conteneur. Un ARG ne traverse pas les étapes : il est redéclaré ici, et en
# fin d'étape pour ne réécrire que des couches de métadonnées.
ARG GIT_SHA=dev
ENV NEXT_PUBLIC_BUILD_SHA=$GIT_SHA
LABEL org.opencontainers.image.revision=$GIT_SHA

USER nextjs
EXPOSE 3000
# Sonde interne alignee sur /api/health (qui touche la base) : `docker ps`
# affiche unhealthy quand le conteneur tourne sans volume de base, sans avoir
# a curler depuis l'hote. Node 22 fournit fetch nativement, pas de curl a
# installer dans l'image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
