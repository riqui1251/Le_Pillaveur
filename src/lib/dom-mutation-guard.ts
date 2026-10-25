/**
 * Script INLINE du layout de langue, exécuté avant tout bundle : la
 * traduction automatique du navigateur (Chrome mobile qui propose de traduire
 * une page /en/) remplace les nœuds texte de React par les siens. Au rendu
 * suivant, React retire ou insère à côté d'un nœud qui n'est plus là, le DOM
 * lève `NotFoundError` (removeChild / insertBefore) et la page entière tombe
 * sur l'écran d'erreur — relevé en prod sur /en/games/imposteur le 25/10.
 * Contournement connu (facebook/react#11538) : ignorer l'opération sur un nœud
 * qui a changé de parent ; la page garde la traduction au lieu de planter.
 */
export const DOM_MUTATION_GUARD =
  "(function(){if(typeof Node!=='function'||!Node.prototype)return;" +
  'var p=Node.prototype,rm=p.removeChild,ib=p.insertBefore;' +
  'p.removeChild=function(c){if(c&&c.parentNode!==this)return c;return rm.apply(this,arguments)};' +
  'p.insertBefore=function(n,r){if(r&&r.parentNode!==this)return n;return ib.apply(this,arguments)}})()'
