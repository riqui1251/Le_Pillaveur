/**
 * Repli des caractères qui trompent l'œil ou le filtre : formes de
 * compatibilité (pleine chasse ｃｏｎ, lettres mathématiques 𝐜𝐨𝐧, ligatures),
 * caractères invisibles et homoglyphes (« cоnnard » au о cyrillique).
 *
 * Module SANS AUCUN import : scripts/backfill-display-name-keys.mjs le charge
 * tel quel avec Node (types effacés à la volée), hors de Next et des alias
 * `@/`. Un import ici casserait ce script.
 */

/**
 * Contrôles de format Unicode (\p{Cf} : inversion bidi U+202E, jointures et
 * espaces sans chasse, U+2061-2064, U+180E…) et remplissages Hangul (U+115F,
 * U+1160, U+3164, U+FFA0), des « lettres » qui ne s'affichent pas.
 */
const INVISIBLE_CHAR_RE = /[\p{Cf}ᅟᅠㅤﾠ]/u
const INVISIBLE_CHARS_RE = /[\p{Cf}ᅟᅠㅤﾠ]/gu

/**
 * Table réduite d'après les confusables d'UTS #39 : lettres cyrilliques,
 * grecques et arméniennes dessinées comme une lettre latine, petites
 * capitales et lettres latines sans point. Appliquée sur la forme décomposée
 * (NFD) : « ё » devient « ë », « ά » devient « á ».
 */
const CONFUSABLES: Readonly<Record<string, string>> = {
  // Cyrillique
  'А': 'A', 'а': 'a',
  'В': 'B', 'в': 'b',
  'Е': 'E', 'е': 'e',
  'К': 'K', 'к': 'k',
  'М': 'M', 'м': 'm',
  'Н': 'H', 'н': 'h',
  'О': 'O', 'о': 'o',
  'Р': 'P', 'р': 'p',
  'С': 'C', 'с': 'c',
  'Т': 'T', 'т': 't',
  'У': 'Y', 'у': 'y',
  'Х': 'X', 'х': 'x',
  'Ь': 'b', 'ь': 'b',
  'п': 'n',
  'Ѕ': 'S', 'ѕ': 's',
  'І': 'I', 'і': 'i',
  'Ј': 'J', 'ј': 'j',
  'Ѵ': 'V', 'ѵ': 'v',
  'Ү': 'Y', 'ү': 'y',
  'Һ': 'H', 'һ': 'h',
  'Ӏ': 'l', 'ӏ': 'l',
  'ԁ': 'd',
  'Ԛ': 'Q', 'ԛ': 'q',
  'Ԝ': 'W', 'ԝ': 'w',
  // Grec
  'Α': 'A', 'α': 'a',
  'Β': 'B',
  'Ε': 'E', 'ε': 'e',
  'Ζ': 'Z',
  'Η': 'H', 'η': 'n',
  'Ι': 'I', 'ι': 'i',
  'Κ': 'K', 'κ': 'k',
  'Μ': 'M',
  'Ν': 'N', 'ν': 'v',
  'Ο': 'O', 'ο': 'o',
  'Ρ': 'P', 'ρ': 'p',
  'Τ': 'T', 'τ': 't',
  'Υ': 'Y', 'υ': 'u',
  'Χ': 'X', 'χ': 'x',
  'γ': 'y',
  'ω': 'w',
  'Ϲ': 'C', 'ϲ': 'c',
  'Ϳ': 'J', 'ϳ': 'j',
  // Arménien
  'Օ': 'O', 'օ': 'o',
  'Ս': 'U', 'ս': 'u',
  'Տ': 'S',
  'զ': 'q',
  'հ': 'h',
  'ո': 'n',
  'ց': 'g',
  // Latin : sans point, alphabet phonétique, petites capitales
  'ı': 'i', 'ȷ': 'j',
  'ǀ': 'l',
  'ɑ': 'a', 'ɡ': 'g', 'ɩ': 'i',
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e',
  'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j',
  'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o',
  'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u',
  'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}

/** Alphabets dont les lettres se confondent entre elles (ceux de la table). */
const CONFUSABLE_SCRIPT_RES: readonly RegExp[] = [
  /\p{Script=Latin}/u,
  /\p{Script=Cyrillic}/u,
  /\p{Script=Greek}/u,
  /\p{Script=Armenian}/u,
]

export function hasInvisibleChars(text: string): boolean {
  return INVISIBLE_CHAR_RE.test(text)
}

export function stripInvisibleChars(text: string): string {
  return text.replace(INVISIBLE_CHARS_RE, '')
}

/** NFKC, invisibles retirés, homoglyphes ramenés à la lettre latine. Casse conservée. */
export function foldConfusables(text: string): string {
  let out = ''
  for (const char of stripInvisibleChars(text.normalize('NFKC')).normalize('NFD')) {
    out += CONFUSABLES[char] ?? char
  }
  return out.normalize('NFC')
}

/**
 * Repli en minuscules. Deux passes : avant la mise en minuscules pour qu'un
 * Η grec reste un H (et non le η, lu « n »), après pour un П qui ne devient
 * lisible qu'en п.
 */
export function foldConfusablesLower(text: string): string {
  return foldConfusables(foldConfusables(text).toLowerCase())
}

/**
 * Vrai si le texte mêle des lettres de plusieurs de ces alphabets : « Kеvin »
 * au е cyrillique, « pуte » au у cyrillique. Un pseudo entièrement cyrillique
 * ou grec reste permis.
 */
export function mixesConfusableScripts(text: string): boolean {
  const normalized = text.normalize('NFKC')
  return CONFUSABLE_SCRIPT_RES.filter((script) => script.test(normalized)).length > 1
}

/**
 * Clé d'unicité d'un pseudo, stockée dans User.displayNameKey et
 * User.onlineDisplayNameKey : deux pseudos de même clé se confondent à
 * l'écran (casse, pleine chasse, invisibles, homoglyphes). Minuscules sans
 * locale : la clé ne dépend pas de la langue du serveur.
 */
export function displayNameKey(name: string): string {
  return foldConfusablesLower(name).trim()
}
