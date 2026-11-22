import type { Prisma } from '@prisma/client'

export const FEEDBACK_TYPES = ['bug', 'improvement', 'comment'] as const
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

/**
 * Avis de 1re partie (POST /api/feedback/first-game) : une note 1..5, le jeu,
 * le mode, un commentaire facultatif. VOLONTAIREMENT absent de FEEDBACK_TYPES :
 * le POST générique /api/feedback valide le type contre cette liste — s'il
 * l'acceptait, n'importe qui fabriquerait des « avis de 1re partie » sans
 * note, hors de leur quota propre, et fausserait le résumé de la Supervision.
 */
export const FIRST_GAME_FEEDBACK_TYPE = 'first-game'

/**
 * Votes du Mode Soirée (POST /api/feedback/soiree) : « Ce jeu vous a plu ? »
 * à chaque entracte (note 1..5 et jeu), puis « La soirée vous a plu ? » sur
 * l'addition (note, commentaire facultatif, sans jeu). Hors de FEEDBACK_TYPES
 * pour la même raison que l'avis de 1re partie.
 */
export const SOIREE_FEEDBACK_TYPE = 'soiree'

/** Types de retour qui portent une note 1..5 (résumés à part dans la Supervision). */
export const RATED_FEEDBACK_TYPES = [FIRST_GAME_FEEDBACK_TYPE, SOIREE_FEEDBACK_TYPE] as const

export function isRatedFeedbackType(type: string): boolean {
  return (RATED_FEEDBACK_TYPES as readonly string[]).includes(type)
}

/**
 * Filtre de la BOÎTE DE TRI des retours : liste admin, compteurs
 * activeCount / resolvedCount, file de la vue d'ensemble. Une note SANS
 * commentaire (avis de 1re partie, vote de soirée) n'a rien à lire ni à
 * traiter — et il en arrive une par nouveau joueur et par manche, de quoi
 * noyer les vrais signalements. Elle reste en base et nourrit son résumé ;
 * avec un commentaire, elle entre dans la boîte comme les autres retours.
 * `message` et `type` sont NOT NULL : le NOT n'a pas de piège de NULL en SQL.
 * Import de TYPE seulement : ce module est aussi chargé côté client
 * (FeedbackDialog), Prisma n'y entre pas.
 */
export const FEEDBACK_INBOX_WHERE: Prisma.UserFeedbackWhereInput = {
  NOT: { type: { in: [...RATED_FEEDBACK_TYPES] }, message: '' },
}

export const FEEDBACK_STATUSES = ['open', 'read', 'resolved'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const MAX_FEEDBACK_MESSAGE = 2000
export const MAX_SCREENSHOTS = 3
export const MAX_SCREENSHOT_BYTES = 500 * 1024
export const MAX_TOTAL_SCREENSHOT_BYTES = 1.5 * 1024 * 1024

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp']

export function isFeedbackType(value: string): value is FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(value)
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return (FEEDBACK_STATUSES as readonly string[]).includes(value)
}

/**
 * Libellé staff d'un type de retour. Prend une chaîne brute (la colonne en
 * base) : un type inconnu — ancien, ou ajouté sans libellé — ressort tel quel
 * plutôt que de casser la liste.
 */
export function feedbackTypeLabel(type: string): string {
  switch (type) {
    case 'bug':
      return 'Bug'
    case 'improvement':
      return 'Amélioration'
    case 'comment':
      return 'Commentaire'
    case FIRST_GAME_FEEDBACK_TYPE:
      return 'Avis 1re partie'
    case SOIREE_FEEDBACK_TYPE:
      return 'Avis Mode Soirée'
    default:
      return type
  }
}

export function feedbackStatusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Nouveau'
    case 'read':
      return 'Lu'
    case 'resolved':
      return 'Résolu'
    default:
      return status
  }
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: number } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
  if (!match) return null
  const mime = match[1]
  if (!ALLOWED_MIME.includes(mime)) return null
  const base64 = match[2]
  const bytes = Math.ceil((base64.length * 3) / 4)
  return { mime, bytes }
}

export function validateScreenshots(screenshots: unknown): string[] | null {
  if (screenshots == null) return []
  if (!Array.isArray(screenshots)) return null
  if (screenshots.length > MAX_SCREENSHOTS) return null

  let totalBytes = 0
  const valid: string[] = []

  for (const item of screenshots) {
    if (typeof item !== 'string') return null
    const parsed = parseDataUrl(item)
    if (!parsed) return null
    if (parsed.bytes > MAX_SCREENSHOT_BYTES) return null
    totalBytes += parsed.bytes
    if (totalBytes > MAX_TOTAL_SCREENSHOT_BYTES) return null
    valid.push(item)
  }

  return valid
}

export async function compressImageFile(file: File, maxBytes = MAX_SCREENSHOT_BYTES): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImage(dataUrl)

  let width = img.width
  let height = img.height
  let quality = 0.85
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')

  for (let attempt = 0; attempt < 8; attempt++) {
    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)

    const result =
      mime === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', quality)

    const bytes = Math.ceil(((result.split(',')[1]?.length ?? 0) * 3) / 4)
    if (bytes <= maxBytes) return result

    if (mime === 'image/jpeg' && quality > 0.4) {
      quality -= 0.1
    } else {
      width = Math.floor(width * 0.75)
      height = Math.floor(height * 0.75)
    }
  }

  return canvas.toDataURL(mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.5)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Lecture fichier impossible'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image invalide'))
    img.src = src
  })
}
