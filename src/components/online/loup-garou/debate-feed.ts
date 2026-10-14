import type { LGDebateSpeech } from '@/lib/loup-garou/engine'
import {
  SAY_VARIANTS_MAX,
  TV_FEED_SIZE,
  botLine,
  botSayKey,
  botTic,
  genreOf,
  playerIcon,
  sayVariantKey,
  speechFeedItems,
  type FeedAuthor,
  type LineOptions,
  type LineTranslator,
  type SpeechFeedItem,
} from '../bot-speech/bot-speech-feed'

/**
 * FIL DU DÉBAT DU LOUP-GAROU — la logique vit dans le socle commun aux jeux à
 * débat (../bot-speech/bot-speech-feed.ts) ; ce module la nomme et la type
 * pour le Loup-Garou (carte téléphone LoupGarouOnline, écran TvLoupGarou).
 */

export type DebateFeedItem = SpeechFeedItem<LGDebateSpeech['kind']>

/** Paroles gardées à l'écran de la TV : le début de la manche sort du champ. */
export const LG_TV_FEED_SIZE = TV_FEED_SIZE

export function lgDebateFeedItems(
  speeches: readonly LGDebateSpeech[],
  round: number,
  meId: string | null | undefined,
  limit?: number
): DebateFeedItem[] {
  return speechFeedItems(speeches, round, meId, limit)
}

export const lgGenreOf = genreOf

/** Variantes max d'une phrase : `<clé>`, `<clé>_2` … `<clé>_9` ; borne de la recherche au catalogue. */
export const LG_SAY_VARIANTS_MAX = SAY_VARIANTS_MAX

export const lgSayVariantKey = sayVariantKey

export function lgBotSayKey(
  kind: LGDebateSpeech['kind'],
  author: FeedAuthor,
  has: (key: string) => boolean,
  seed?: string
): string | null {
  return botSayKey(kind, author, has, seed)
}

export const lgBotTic = botTic

/** Ce que lgBotLine demande à next-intl : `t.has` et `t(key, values)`. */
export type LGLineTranslator = LineTranslator

export type LGLineOptions = Omit<LineOptions, 'values'>

export function lgBotLine(
  kind: LGDebateSpeech['kind'],
  author: FeedAuthor,
  target: FeedAuthor,
  t: LGLineTranslator,
  options: LGLineOptions = {}
): string | null {
  return botLine(kind, author, target, t, options)
}

export const lgPlayerIcon = playerIcon
