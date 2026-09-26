import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { OPS_JOB_IDS } from './ops-status-types'

// Les scripts d'exploitation (scripts/*.sh) passent de longs blocs à
// `sh -c '…'` / `bash -c '…'`, entre apostrophes, avec des commentaires en
// français dedans. Une seule apostrophe dans ce texte (« d'écriture ») referme
// le bloc en plein milieu : la suite s'exécute alors sur l'HÔTE au lieu du
// conteneur, et `bash -n` ne voit rien, les apostrophes restant appariées plus
// loin dans le fichier. Vécu le 25/09/2026 : vps-secure-max.sh mourait sur
// « ls: cannot access '/data/' ». La règle vérifiée ici : un bloc ouvert en fin
// de ligne se referme sur une ligne qui COMMENCE par l'apostrophe fermante.
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts')
const OPENER = /\b(?:sh|bash) -c '[ \t]*$/gm

function earlyClosedBlocks(source: string): string[] {
  const problems: string[] = []
  for (const match of source.matchAll(OPENER)) {
    const blockStart = (match.index ?? 0) + match[0].length
    const closing = source.indexOf("'", blockStart)
    const lineStart = source.lastIndexOf('\n', closing) + 1
    if (closing === -1 || source.slice(lineStart, closing).trim() !== '') {
      const line = source.slice(0, Math.max(closing, 0)).split('\n').length
      const text = source.slice(lineStart, source.indexOf('\n', closing)).trim()
      problems.push(`ligne ${line} : ${text}`)
    }
  }
  return problems
}

describe('scripts shell : blocs entre apostrophes', () => {
  const scripts = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.sh'))

  it('trouve bien des scripts à vérifier', () => {
    expect(scripts.length).toBeGreaterThan(5)
  })

  it.each(scripts)('%s : aucun bloc refermé par une apostrophe du texte', (file) => {
    const source = readFileSync(path.join(SCRIPTS_DIR, file), 'utf8').replace(/\r\n/g, '\n')
    expect(earlyClosedBlocks(source)).toEqual([])
  })

  it('repère le piège (garde du test lui-même)', () => {
    const broken = "docker run alpine sh -c '\n  # le seul bit d'écriture\n  ls /data\n'\n"
    const fixed = "docker run alpine sh -c '\n  # le seul droit en écriture\n  ls /data\n'\n"
    expect(earlyClosedBlocks(broken)).toHaveLength(1)
    expect(earlyClosedBlocks(fixed)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Onglet « Surveillance » : les tâches root du VPS écrivent un fichier d'état
// que le conteneur lit en lecture seule. Rien de tout ça ne s'exécute en
// local (root, docker, cron) : ces tests sont STATIQUES, ils lisent le texte
// des scripts. Ce qu'ils gardent, c'est ce qui casserait EN SILENCE — un
// montage oublié au retour arrière, une copie de write_status qui diverge, un
// code d'état que l'interface ne sait pas traduire.
// ---------------------------------------------------------------------------

const readScript = (file: string) =>
  readFileSync(path.join(SCRIPTS_DIR, file), 'utf8').replace(/\r\n/g, '\n')

const OPS_MOUNT = '-v /var/lib/le-pillaveur-status:/app/ops-status:ro'

/** Options du conteneur de prod : le tableau RUN_ARGS de prod-deploy.sh. */
function deployRunArgs(source: string): string[] {
  const start = source.indexOf('RUN_ARGS=(\n')
  const end = source.indexOf('\n)\n', start)
  if (start === -1 || end === -1) return []
  return source
    .slice(start + 'RUN_ARGS=(\n'.length, end)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
}

/** Nom du conteneur de prod, pas celui de la sonde `le-pillaveur-probe`. */
const CONTAINER_NAME = /--name le-pillaveur(?![\w-])/
const CONTAINER_RUN = 'docker run -d \\\n  --name le-pillaveur \\\n'

/**
 * Options de CHAQUE `docker run -d --name le-pillaveur` d'un script : les
 * lignes continuées par `\` qui suivent le nom, jusqu'à la dernière (l'image,
 * qui change d'un script à l'autre et n'est pas comparée).
 */
function containerRunArgs(source: string): string[][] {
  const blocks: string[][] = []
  for (let start = source.indexOf(CONTAINER_RUN); start !== -1; start = source.indexOf(CONTAINER_RUN, start + 1)) {
    const args: string[] = []
    for (const raw of source.slice(start + CONTAINER_RUN.length).split('\n')) {
      const line = raw.trim()
      if (!line.endsWith('\\')) break
      args.push(line.slice(0, -1).trim())
    }
    blocks.push(args)
  }
  return blocks
}

/** Lignes de code (hors commentaires) qui nomment le conteneur de prod. */
function containerNameLines(source: string): string[] {
  return source.split('\n').filter((l) => !l.trim().startsWith('#') && CONTAINER_NAME.test(l))
}

/** Corps de la fonction write_status, de sa ligne d'ouverture à la `}` en colonne 0. */
function writeStatusBody(source: string): string | null {
  const start = source.indexOf('write_status() {\n')
  if (start === -1) return null
  const end = source.indexOf('\n}\n', start)
  return end === -1 ? null : source.slice(start, end + 3)
}

/** Script de sauvegarde tel que vps-secure-max.sh l'écrit (heredoc <<'SCRIPT'). */
function generatedBackupScript(): string {
  const source = readScript('vps-secure-max.sh')
  const start = source.indexOf("<<'SCRIPT'\n")
  const end = source.indexOf('\nSCRIPT\n', start)
  return start === -1 || end === -1 ? '' : source.slice(start + "<<'SCRIPT'\n".length, end + 1)
}

// Codes d'état par tâche : le contrat (src/lib/ops-status-types.ts, détaillé
// dans docs/ops/ALERTES.md). L'interface traduit ces codes ; un code écrit par
// un script mais absent d'ici s'afficherait brut, un code d'ici jamais écrit
// serait une traduction morte.
const STATE_WRITERS = [
  {
    name: 'vps-site-probe.sh',
    source: () => readScript('vps-site-probe.sh'),
    jobs: ['probe'],
    codes: ['ok', 'http_error', 'keyword_missing', 'unreachable'],
  },
  {
    name: 'sauvegarde (générée par vps-secure-max.sh)',
    source: generatedBackupScript,
    jobs: ['backup-daily', 'backup-hourly'],
    codes: ['ok', 'integrity_failed', 'gzip_failed', 'failed'],
  },
  {
    name: 'vps-backup-offsite.sh',
    source: () => readScript('vps-backup-offsite.sh'),
    jobs: ['offsite'],
    codes: ['ok', 'not_configured', 'no_local_backup', 'stale_local_backup', 'gzip_failed', 'failed'],
  },
  {
    name: 'vps-disk-watch.sh',
    source: () => readScript('vps-disk-watch.sh'),
    jobs: ['disk'],
    codes: ['ok', 'over_threshold', 'df_failed'],
  },
]

/** Codes réellement écrits : littéraux passés à write_status + valeurs de STATUS_CODE. */
function emittedCodes(source: string): string[] {
  const codes = new Set<string>()
  for (const m of source.matchAll(/^\s*write_status\s+\S+\s+(?:true|false|null)\s+([a-z_]+)\s/gm)) codes.add(m[1])
  for (const m of source.matchAll(/\bSTATUS_CODE=([a-z_]+)\b/g)) codes.add(m[1])
  return [...codes].sort()
}

/**
 * Lignes qui fabriquent le `detail` d'un fichier d'état : appels de
 * write_status (hors sa définition) et affectations des variables qui le
 * portent. Le détail traverse l'API jusqu'à l'écran, qui promet des codes, des
 * nombres et des noms de fichiers — pas l'arborescence du serveur.
 */
function detailLines(source: string): string[] {
  const body = writeStatusBody(source) ?? ''
  return source
    .replace(body, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .filter((l) => /^\s*write_status\s|\b(?:STATUS_DETAIL|STATE_DETAIL|DETAIL|LOG_HINT)=/.test(l))
}

/**
 * Chemin de l'hôte écrit en dur, ou variable qui en contient un (journal,
 * fichiers de configuration et de secrets, dossiers, fichier de sauvegarde
 * complet, URL de ping). `$(basename …)` et `$(stat …)` sont retirés avant :
 * ils ne laissent passer qu'un nom ou un nombre.
 */
const HOST_PATH_IN_DETAIL =
  /\/(?:etc|var|opt|root|home|usr)\/|\$\{?(?:LOG|ENV_FILE|RCLONE_CONF|BACKUP_DIR|STATUS_DIR|OUT|LATEST|PING_URL|PING_URL_FILE)\b/

function detailPathLeaks(source: string): string[] {
  return detailLines(source).filter((l) =>
    HOST_PATH_IN_DETAIL.test(l.replace(/\$\((?:basename|stat)\b[^()]*\)/g, '')),
  )
}

/** Identifiants de tâche passés à write_status (« backup-$MODE » déplié). */
function emittedJobs(source: string): string[] {
  const jobs = new Set<string>()
  for (const m of source.matchAll(/^\s*write_status\s+("?)([a-z$A-Z_-]+)\1\s/gm)) {
    if (m[2] === 'backup-$MODE') ['backup-daily', 'backup-hourly'].forEach((j) => jobs.add(j))
    else jobs.add(m[2])
  }
  return [...jobs].sort()
}

describe("onglet Surveillance : montage du dossier d'état dans le conteneur", () => {
  const deploy = readScript('prod-deploy.sh')
  const restore = readScript('prod-db-restore.sh')
  const envResend = readScript('prod-env-resend.sh')
  // Tout script du dépôt qui (re)crée le conteneur de prod, pas une liste
  // tenue à la main : prod-env-resend.sh le recréait avec ses propres options
  // et échappait au test, qui ne regardait que le déploiement et la
  // restauration.
  const recreators = readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.sh'))
    .filter((f) => containerNameLines(readScript(f)).length > 0)

  it("prod-deploy.sh monte le dossier d'état en lecture seule", () => {
    expect(deployRunArgs(deploy).filter((a) => a === OPS_MOUNT)).toHaveLength(1)
  })

  it('repère les scripts qui recréent le conteneur (garde du test lui-même)', () => {
    expect(recreators).toEqual(expect.arrayContaining(['prod-deploy.sh', 'prod-db-restore.sh', 'prod-env-resend.sh']))
  })

  it.each(recreators)('%s : recrée le conteneur avec EXACTEMENT les options du déploiement', (file) => {
    // Un redémarrage sans le montage laisserait le panneau aveugle jusqu'au
    // déploiement suivant ; sans --memory, le conteneur tournerait sans plafond.
    const deployArgs = deployRunArgs(deploy)
    expect(deployArgs.length).toBeGreaterThan(8)
    const source = readScript(file)
    const blocks = containerRunArgs(source)
    // Chaque ligne qui nomme le conteneur est celle d'un `docker run -d` au
    // gabarit lu ici : une autre forme échapperait à la comparaison.
    expect(blocks).toHaveLength(containerNameLines(source).length)
    const ownRunArgs = deployRunArgs(source)
    for (const args of blocks) {
      if (ownRunArgs.length > 0) {
        // Le script porte son tableau RUN_ARGS : copie conforme, et c'est lui
        // que `docker run` reçoit.
        expect(ownRunArgs).toEqual(deployArgs)
        expect(args).toEqual(['"${RUN_ARGS[@]}"'])
      } else {
        expect(args).toEqual(deployArgs)
      }
    }
  })

  it('le dossier est créé (755) avant de couper le site, dans les trois scripts', () => {
    // Sous set -e, un `sudo mkdir` refusé arrête le script là où il est : il
    // doit donc passer AVANT toute coupure, pas juste avant le redémarrage.
    const firstIndex = (source: string, needle: string) => {
      const i = source.indexOf(needle)
      expect(i, needle).toBeGreaterThan(-1)
      return i
    }
    const mkdirDeploy = firstIndex(deploy, 'sudo mkdir -p /var/lib/le-pillaveur-status')
    expect(deploy).toContain('sudo chmod 755 /var/lib/le-pillaveur-status')
    expect(mkdirDeploy).toBeLessThan(firstIndex(deploy, 'docker stop -t 20 le-pillaveur'))
    expect(mkdirDeploy).toBeLessThan(firstIndex(deploy, 'docker create --name le-pillaveur-probe'))

    const mkdirRestore = firstIndex(restore, 'sudo mkdir -p /var/lib/le-pillaveur-status')
    expect(restore).toContain('sudo chmod 755 /var/lib/le-pillaveur-status')
    expect(mkdirRestore).toBeLessThan(firstIndex(restore, 'docker rm -f le-pillaveur 2>/dev/null'))
    expect(mkdirRestore).toBeLessThan(firstIndex(restore, 'docker run -d \\\n  --name le-pillaveur'))

    const mkdirResend = firstIndex(envResend, 'sudo mkdir -p /var/lib/le-pillaveur-status')
    expect(envResend).toContain('sudo chmod 755 /var/lib/le-pillaveur-status')
    expect(mkdirResend).toBeLessThan(firstIndex(envResend, 'docker rm -f le-pillaveur 2>/dev/null'))
    expect(mkdirResend).toBeLessThan(firstIndex(envResend, 'docker create --name le-pillaveur-probe'))
  })

  it('les lecteurs de gabarit repèrent bien leurs blocs (garde du test lui-même)', () => {
    expect(deployRunArgs('RUN_ARGS=(\n  # note\n  --a b\n  -v x:y\n)\n')).toEqual(['--a b', '-v x:y'])
    expect(
      containerRunArgs('docker run -d \\\n  --name le-pillaveur \\\n  --a b \\\n  -v x:y \\\n  "$RESTART_IMAGE"\n'),
    ).toEqual([['--a b', '-v x:y']])
    // La sonde du déploiement porte un autre nom : elle n'est pas un redémarrage.
    expect(containerNameLines('docker create --name le-pillaveur-probe "${RUN_ARGS[@]}" img\n')).toEqual([])
    expect(containerNameLines('# docker run --name le-pillaveur\n  --name le-pillaveur \\\n')).toHaveLength(1)
  })
})

describe('onglet Surveillance : installation de la sonde du site', () => {
  const secure = readScript('vps-secure-max.sh')

  it('le script de sonde existe dans le dépôt', () => {
    expect(existsSync(path.join(SCRIPTS_DIR, 'vps-site-probe.sh'))).toBe(true)
  })

  it('vps-secure-max.sh la recopie en root sous /usr/local/bin', () => {
    expect(secure).toContain('PROBE_SCRIPT="/usr/local/bin/le-pillaveur-site-probe.sh"')
    expect(secure).toContain('install_root_script "$SCRIPT_DIR/vps-site-probe.sh" "$PROBE_SCRIPT"')
  })

  it('pose la ligne cron toutes les 5 minutes, sans doublon', () => {
    expect(secure).toContain(
      'CRON_PROBE="*/5 * * * * $PROBE_SCRIPT >> /var/log/le-pillaveur-probe.log 2>&1"',
    )
    // Même filtre que les autres lignes : toutes celles qui citent le script
    // sont retirées avant réécriture.
    const existing = secure.split('\n').find((l) => l.startsWith('EXISTING=$(sudo crontab -l'))
    expect(existing).toContain('grep -Fv "$PROBE_SCRIPT"')
    expect(secure).toMatch(/CRON_LINES=\$\(printf '%s\\n%s' "\$CRON_LINES" "\$CRON_PROBE"\)/)
  })

  it("crée le dossier d'état et vérifie le fichier de ping « site »", () => {
    expect(secure).toContain('STATUS_DIR="/var/lib/le-pillaveur-status"')
    expect(secure).toContain('sudo mkdir -p "$STATUS_DIR"')
    expect(secure).toContain('sudo chmod 755 "$STATUS_DIR"')
    expect(secure).toMatch(/^for check in backup offsite disk site; do$/m)
  })
})

describe("onglet Surveillance : écriture des fichiers d'état", () => {
  it('le contrat et ces tests couvrent les mêmes tâches', () => {
    const jobs = STATE_WRITERS.flatMap((w) => w.jobs).sort()
    expect(jobs).toEqual([...OPS_JOB_IDS].sort())
  })

  it.each(STATE_WRITERS)('$name : write_status écrit par mktemp + mv (atomique)', ({ source }) => {
    const text = source()
    const body = writeStatusBody(text)
    expect(body).not.toBeNull()
    const tmp = body!.indexOf('tmp=$(mktemp "$STATUS_DIR/.$job.json.XXXXXX")')
    const mv = body!.indexOf('mv -f "$tmp" "$STATUS_DIR/$job.json"')
    expect(tmp).toBeGreaterThan(-1)
    expect(mv).toBeGreaterThan(tmp)
    // Jamais d'écriture directe du fichier final : le panneau pourrait lire
    // un fichier à moitié écrit.
    expect(text).not.toMatch(/>\s*"?\$STATUS_DIR\/[^"\s]*\.json/)
    expect(text).toContain('STATUS_DIR="${STATUS_DIR:-/var/lib/le-pillaveur-status}"')
  })

  it('les quatre copies de write_status sont identiques', () => {
    // Dupliquée parce que chaque script est installé seul sous /usr/local/bin :
    // une correction faite dans une copie doit l'être dans toutes.
    const bodies = STATE_WRITERS.map((w) => writeStatusBody(w.source()))
    expect(bodies[0]).toBeTruthy()
    for (const body of bodies) expect(body).toBe(bodies[0])
  })

  it.each(STATE_WRITERS)("$name : n'écrit que ses tâches, avec les codes du contrat", ({ source, jobs, codes }) => {
    const text = source()
    expect(emittedJobs(text)).toEqual([...jobs].sort())
    expect(emittedCodes(text)).toEqual([...codes].sort())
  })

  it.each(STATE_WRITERS)('$name : aucun chemin du serveur dans le détail', ({ source }) => {
    const text = source()
    expect(detailLines(text).length).toBeGreaterThan(0)
    expect(detailPathLeaks(text)).toEqual([])
  })

  it('repère un chemin glissé dans le détail (garde du test lui-même)', () => {
    const leaky = [
      'write_status offsite null not_configured "$ENV_FILE absent"',
      '  STATUS_DETAIL="aucune copie dans $BACKUP_DIR"',
      'write_status offsite false x "${STATUS_DETAIL:-voir $LOG}"',
      'if [ x ]; then LOG_HINT="/var/log/le-pillaveur-backup.log"; fi',
      'DETAIL="voir ${OUT}.gz"',
    ].join('\n')
    expect(detailPathLeaks(leaky)).toHaveLength(5)
    const clean = [
      'write_status backup-daily true ok "$(basename "$OUT").gz" "sizeBytes=$(stat -c %s "${OUT}.gz" 2>/dev/null || echo 0)"',
      'STATUS_DETAIL="$(basename "$LATEST") ne se decompresse pas"',
      'LOG_HINT="le-pillaveur-backup.log"',
      'STATE_DETAIL="/ occupe a ${USED_PCT} %"',
    ].join('\n')
    expect(detailPathLeaks(clean)).toEqual([])
  })
})
