import { getTranslations } from 'next-intl/server'

/**
 * Empreinte de la version qui tourne, en pied de la Supervision.
 *
 * Le sha git court est injecté au build de l'image (Dockerfile :
 * `ARG GIT_SHA` → `ENV NEXT_PUBLIC_BUILD_SHA`, posé par prod-deploy.sh depuis
 * le BUILD_INFO que deploy-from-local.sh glisse dans l'archive). Jusqu'ici
 * rien ne disait quelle révision était en ligne : package.json figé en 1.1.01,
 * /api/health muet là-dessus. Composant SERVEUR : la valeur est lue dans
 * process.env au rendu. Le sha n'est pas un secret : le préfixe NEXT_PUBLIC_
 * l'inline aussi dans le bundle client, où src/lib/client-error-report.ts
 * l'envoie avec chaque rapport de plantage (pour reconnaître un bundle
 * périmé) — quiconque lit le JS peut le voir. Ce pied de page ne vit que dans
 * l'espace staff et /api/health reste muet parce qu'ANNONCER la révision
 * n'apporte rien au joueur, pas parce qu'elle serait cachée.
 * « dev » = image construite sans sha (poste local, build à la main).
 */
export default async function BuildStamp({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'supervision' })
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev'
  return (
    <footer className="mx-auto max-w-6xl px-3 pb-6 text-center text-[11px] text-white/35 sm:px-6">
      <span className="font-display uppercase tracking-[0.18em]">{t('buildStamp')}</span>
      <span className="ml-2 font-mono text-white/50">{sha}</span>
    </footer>
  )
}
