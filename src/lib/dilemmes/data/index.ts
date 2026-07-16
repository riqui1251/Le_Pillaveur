import type { DilCard } from '../engine'

/**
 * DILEMMES — contenu FRANÇAIS UNIQUEMENT (même charte de ton que Sans
 * Filtre, voir src/lib/sans-filtre/data/cards.fr.ts). Trois paquets :
 * « Tu préfères » (A/B), « Je n'ai jamais » (fait/jamais), « Qui de la
 * table » (vote joueur). tone 'soft' = jouable en mode Soft.
 */

export type DilTone = 'soft' | 'apero'
export type DilContentCard = DilCard & { tone: DilTone }

export const DIL_CARDS_FR: DilContentCard[] = [
  // ── Tu préfères ── (A/B)
  { kind: 'prefer', a: 'Ne plus jamais manger de fromage', b: 'Ne plus jamais manger de pain', tone: 'soft' },
  { kind: 'prefer', a: 'Savoir parler aux animaux', b: 'Parler toutes les langues du monde', tone: 'soft' },
  { kind: 'prefer', a: 'Toujours arriver 2 h en avance', b: 'Toujours arriver 20 min en retard', tone: 'soft' },
  { kind: 'prefer', a: 'Vivre sans musique', b: 'Vivre sans séries ni films', tone: 'soft' },
  { kind: 'prefer', a: 'Avoir toujours trop chaud', b: 'Avoir toujours trop froid', tone: 'soft' },
  { kind: 'prefer', a: 'Redevenir enfant une semaine', b: 'Voir ta vie à 80 ans pendant une heure', tone: 'soft' },
  { kind: 'prefer', a: 'Un rire de dauphin incontrôlable', b: 'Des applaudissements après chacune de tes phrases', tone: 'soft' },
  { kind: 'prefer', a: 'Ne plus jamais faire la vaisselle', b: 'Ne plus jamais étendre de linge', tone: 'soft' },
  { kind: 'prefer', a: 'Connaître la date de ta mort', b: 'Connaître la cause de ta mort', tone: 'soft' },
  { kind: 'prefer', a: 'Être riche et inconnu', b: 'Être célèbre et fauché', tone: 'soft' },
  { kind: 'prefer', a: 'Dormir 4 h par nuit sans fatigue', b: 'Dormir 12 h par nuit obligatoires', tone: 'soft' },
  { kind: 'prefer', a: 'Reprendre tous tes exposés du collège', b: 'Repasser ton permis chaque année', tone: 'soft' },
  { kind: 'prefer', a: 'Vivre dans un manoir hanté', b: 'Vivre dans un studio parfait de 12 m²', tone: 'soft' },
  { kind: 'prefer', a: 'Que ton historique de recherche soit public', b: 'Que tes notes vocales soient publiques', tone: 'soft' },
  { kind: 'prefer', a: 'Éternuer à chaque poignée de main', b: 'Avoir le hoquet à chaque rendez-vous important', tone: 'soft' },
  { kind: 'prefer', a: 'Toujours dire ce que tu penses', b: 'Ne plus jamais pouvoir mentir du tout', tone: 'soft' },
  { kind: 'prefer', a: 'Gagner 500 € aujourd’hui', b: 'Gagner 5 000 € dans cinq ans', tone: 'soft' },
  { kind: 'prefer', a: 'Un talent inutile mais spectaculaire', b: 'Un talent utile mais invisible', tone: 'soft' },
  { kind: 'prefer', a: 'Refaire les soldes avec ta grand-mère', b: 'Un road trip avec ton patron', tone: 'soft' },
  { kind: 'prefer', a: 'Chanter tout ce que tu dis pendant un an', b: 'Danser à chaque fois que tu marches pendant un mois', tone: 'soft' },
  { kind: 'prefer', a: 'Ne boire que de la bière tiède', b: 'Ne boire que du vin bouchonné', tone: 'apero' },
  { kind: 'prefer', a: 'Un open bar avec tes ex', b: 'Un dîner sobre avec ta belle-famille', tone: 'apero' },
  { kind: 'prefer', a: 'Perdre ton téléphone en soirée', b: 'Perdre tes clés ET ta dignité en soirée', tone: 'apero' },
  { kind: 'prefer', a: 'Être le seul sobre au mariage', b: 'Être le plus ivre au baptême', tone: 'apero' },
  { kind: 'prefer', a: 'Ne plus jamais faire d’apéro', b: 'Ne plus jamais partir en vacances', tone: 'apero' },
  { kind: 'prefer', a: 'Que ta mère lise tes messages de ce soir', b: 'Que ton boss voie tes photos de ce soir', tone: 'apero' },
  { kind: 'prefer', a: 'Un karaoké obligatoire chaque vendredi', b: 'Un discours improvisé chaque lundi', tone: 'soft' },
  { kind: 'prefer', a: 'Avoir un sosie qui fait n’importe quoi', b: 'Être le sosie de quelqu’un de détesté', tone: 'soft' },
  { kind: 'prefer', a: 'Te souvenir de tous tes rêves', b: 'Que les autres oublient toutes tes hontes', tone: 'soft' },
  { kind: 'prefer', a: 'Wifi illimité mais lent partout', b: 'Wifi ultrarapide une heure par jour', tone: 'soft' },

  // ── Je n'ai jamais ── (A = je l'ai fait, B = jamais)
  { kind: 'never', text: 'fait semblant de connaître quelqu’un qui me disait bonjour', tone: 'soft' },
  { kind: 'never', text: 'dormi au travail ou en cours', tone: 'soft' },
  { kind: 'never', text: 'raconté le même mensonge tellement de fois que j’y crois', tone: 'soft' },
  { kind: 'never', text: 'stalké un ex jusqu’aux photos de 2014', tone: 'soft' },
  { kind: 'never', text: 'mangé un truc tombé par terre en regardant autour', tone: 'soft' },
  { kind: 'never', text: 'pleuré devant une pub', tone: 'soft' },
  { kind: 'never', text: 'envoyé un message au mauvais destinataire', tone: 'soft' },
  { kind: 'never', text: 'fait semblant d’être malade pour annuler un plan', tone: 'soft' },
  { kind: 'never', text: 'googlé mon propre nom', tone: 'soft' },
  { kind: 'never', text: 'applaudi à un atterrissage', tone: 'soft' },
  { kind: 'never', text: 'menti sur mon âge', tone: 'soft' },
  { kind: 'never', text: 'gardé un cadeau moche « au cas où » la personne revienne', tone: 'soft' },
  { kind: 'never', text: 'chanté à fond une chanson dont j’invente les paroles', tone: 'soft' },
  { kind: 'never', text: 'fait un vocal de plus de cinq minutes', tone: 'soft' },
  { kind: 'never', text: 'répondu « oui oui » sans avoir écouté', tone: 'soft' },
  { kind: 'never', text: 'oublié le prénom de quelqu’un pendant les présentations', tone: 'soft' },
  { kind: 'never', text: 'raté une station de métro parce que je regardais mon téléphone', tone: 'soft' },
  { kind: 'never', text: 'mis un vêtement sale parce que « ça va encore »', tone: 'soft' },
  { kind: 'never', text: 'terminé la soirée avec le kebab le plus cher de ma vie', tone: 'apero' },
  { kind: 'never', text: 'juré « plus jamais d’alcool » un dimanche matin', tone: 'apero' },
  { kind: 'never', text: 'dansé sur une table (ou essayé)', tone: 'apero' },
  { kind: 'never', text: 'perdu mon téléphone en soirée et appelé avec celui d’un inconnu', tone: 'apero' },
  { kind: 'never', text: 'envoyé un message que j’ai regretté avant même la réponse', tone: 'apero' },
  { kind: 'never', text: 'confondu la porte des toilettes avec une autre porte en soirée', tone: 'apero' },
  { kind: 'never', text: 'dormi tout habillé avec les chaussures', tone: 'apero' },
  { kind: 'never', text: 'fait un discours non sollicité à un mariage', tone: 'apero' },
  { kind: 'never', text: 'inventé un jeu à boire aux règles incompréhensibles', tone: 'apero' },
  { kind: 'never', text: 'promis une tournée générale et disparu', tone: 'apero' },

  // ── Qui de la table ── (vote joueur)
  { kind: 'who', text: 'finirait en garde à vue pour une histoire absurde ?', tone: 'soft' },
  { kind: 'who', text: 'survivrait le plus longtemps à une apocalypse zombie ?', tone: 'soft' },
  { kind: 'who', text: 'pleurerait en premier devant un film triste ?', tone: 'soft' },
  { kind: 'who', text: 'oublierait son propre anniversaire ?', tone: 'soft' },
  { kind: 'who', text: 'deviendrait célèbre pour une raison ridicule ?', tone: 'soft' },
  { kind: 'who', text: 'enverrait un message à son ex ce soir ?', tone: 'apero' },
  { kind: 'who', text: 'se perdrait dans sa propre ville ?', tone: 'soft' },
  { kind: 'who', text: 'mangerait le dernier morceau sans demander ?', tone: 'soft' },
  { kind: 'who', text: 'ferait fortune avec une idée débile ?', tone: 'soft' },
  { kind: 'who', text: 'raterait son avion pour une sieste ?', tone: 'soft' },
  { kind: 'who', text: 'adopterait un animal sur un coup de tête ?', tone: 'soft' },
  { kind: 'who', text: 'connaît le plus de potins sur tout le monde ici ?', tone: 'soft' },
  { kind: 'who', text: 'lancerait le karaoké sans y être invité ?', tone: 'apero' },
  { kind: 'who', text: 'finirait la soirée à parler philosophie dans la cuisine ?', tone: 'apero' },
  { kind: 'who', text: 'commanderait encore une pizza à 3 h du matin ?', tone: 'apero' },
  { kind: 'who', text: 'perdrait ses clés ce soir ?', tone: 'apero' },
  { kind: 'who', text: 'se ferait draguer sans s’en rendre compte ?', tone: 'soft' },
  { kind: 'who', text: 'écrirait un livre sur sa propre vie (et le lirait) ?', tone: 'soft' },
  { kind: 'who', text: 'gagnerait une téléréalité haut la main ?', tone: 'soft' },
  { kind: 'who', text: 'ferait un malaise en voyant son temps d’écran ?', tone: 'soft' },
  { kind: 'who', text: 'défendrait sa théorie du complot préférée jusqu’au bout ?', tone: 'soft' },
  { kind: 'who', text: 'se resservirait trois fois « pour ne pas gâcher » ?', tone: 'apero' },
]

/** Pool selon l'ambiance de la table (Soft = cartes sages uniquement). */
export function dilContentFor(ambiance: 'soft' | 'alcool'): DilCard[] {
  return DIL_CARDS_FR.filter((c) => ambiance === 'alcool' || c.tone === 'soft').map(
    ({ tone: _tone, ...card }) => {
      void _tone
      return card as DilCard
    }
  )
}
