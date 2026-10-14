// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from '../index'

/** it, lot 03 : paires 47 à 69 de data/it.ts (brief : node scripts/imposteur-clues-brief.mjs it 3). */
export const IMPOSTEUR_CLUES_IT_LOT_03: Record<string, ImposteurClueSet> = {
  'biliardo|freccette': {
    a: ['bar', 'mira', 'panno verde', 'gessetto', 'sponda', 'stecca', 'palla otto'],
    b: ['bar', 'mira', 'muro', 'tre lanci', 'punte', 'bersaglio', 'triplo venti'],
  },
  'poker|scopa': {
    a: ['carte', 'mazzo', 'fiches', 'casinò', 'bluff', 'all in', 'scala reale'],
    b: ['carte', 'mazzo', 'osteria', 'carte napoletane', 'denari', 'primiera', 'settebello'],
  },
  'scacchi|dama': {
    a: ['bianco e nero', 'strategia', 'cavallo', 'torre', 'alfiere', 're e regina', 'arrocco'],
    b: ['bianco e nero', 'strategia', 'pedine tonde', 'solo in diagonale', 'mangiare saltando', 'presa obbligatoria', 'soffiare'],
  },
  'yoga|pilates': {
    a: ['tappetino', 'respiro', 'flessibilità', 'meditazione', 'mantra', 'saluto al sole', 'namaste'],
    b: ['tappetino', 'respiro', 'addominali', 'core', 'cerchio', 'pavimento pelvico', 'reformer'],
  },
  'palestra|crossfit': {
    a: ['muscoli', 'sudore', 'abbonamento', 'spogliatoio', 'manubri', 'tapis roulant', 'personal trainer'],
    b: ['muscoli', 'sudore', 'in gruppo', 'kettlebell', 'copertoni', 'box', 'burpees'],
  },
  'corsa|trekking': {
    a: ['scarpe', 'aria aperta', 'parco', 'cuffiette', 'cronometro', 'passo al km', 'maratona'],
    b: ['scarpe', 'aria aperta', 'montagna', 'zaino', 'borraccia', 'bastoncini', 'sentiero segnato'],
  },
  'immersione|snorkeling': {
    a: ['mare', 'pesci', 'profondità', 'muta', 'bombole', 'brevetto', 'decompressione'],
    b: ['mare', 'pesci', 'a galla', 'pinne', 'maschera', 'pancia in giù', 'boccaglio'],
  },
  'pesca|caccia': {
    a: ['preda', 'alba', 'lago', 'canna', 'verme', 'galleggiante', 'mulinello'],
    b: ['preda', 'alba', 'bosco', 'mimetica', 'cinghiale', 'fucile', 'doppietta'],
  },
  'chitarra|pianoforte': {
    a: ['accordi', 'note', 'corde', 'falò', 'plettro', 'amplificatore', 'capotasto'],
    b: ['accordi', 'note', 'sgabello', 'pedali', 'tastiera', 'gran coda', 'ottantotto tasti'],
  },
  'batteria|DJ': {
    a: ['ritmo', 'palco', 'piatti', 'bacchette', 'pedale', 'rullante', 'grancassa'],
    b: ['ritmo', 'palco', 'discoteca', 'cuffie', 'vinili', 'mixer', 'scratch'],
  },
  'rap|rock': {
    a: ['concerto', 'microfono', 'rime', 'base', 'flow', 'freestyle', 'dissing'],
    b: ['concerto', 'microfono', 'giacca di pelle', 'capelli lunghi', 'chitarra elettrica', 'pogo', 'assolo'],
  },
  'techno|reggae': {
    a: ['ballare', 'festival', 'capannone', 'luci stroboscopiche', 'rave', 'drum machine', 'cassa dritta'],
    b: ['ballare', 'festival', 'spiaggia', 'rosso giallo verde', 'dreadlock', 'rasta', 'ritmo in levare'],
  },
  'gatto|cane': {
    a: ['pelo', 'ciotola', 'baffi', 'lettiera', 'tiragraffi', 'fusa', 'miao'],
    b: ['pelo', 'ciotola', 'passeggiata', 'cuccia', 'osso', 'guinzaglio', 'bau'],
  },
  'criceto|coniglio': {
    a: ['gabbia', 'bambini', 'segatura', 'semi di girasole', 'notturno', 'guance piene', 'ruota'],
    b: ['gabbia', 'bambini', 'fieno', 'salti', 'carota', 'orecchie lunghe', 'cilindro del mago'],
  },
  'pappagallo|canarino': {
    a: ['gabbia', 'piume', 'tropicale', 'becco ricurvo', 'sulla spalla', 'pirata', 'ripete le parole'],
    b: ['gabbia', 'piume', 'davanzale', 'cinguettio', 'canto', 'giallo', 'miniera di carbone'],
  },
  'squalo|delfino': {
    a: ['mare', 'pinna', 'predatore', 'pericolo', 'sangue', 'file di denti', 'pesce martello'],
    b: ['mare', 'pinna', 'intelligenza', 'salti', 'acquario', 'fischi', 'naso a bottiglia'],
  },
  'leone|tigre': {
    a: ['felino', 'zoo', 'ruggito', 'savana', 'branco', 'criniera', 're della foresta'],
    b: ['felino', 'zoo', 'giungla', 'solitaria', 'siberiana', 'arancione', 'strisce nere'],
  },
  'orso|lupo': {
    a: ['bosco', 'montagna', 'grotta', 'salmone', 'letargo', 'miele', 'marsicano'],
    b: ['bosco', 'montagna', 'branco', 'luna piena', 'tre porcellini', 'mannaro', 'ululato'],
  },
  'ape|vespa': {
    a: ['puntura', 'giallo e nero', 'fiori', 'polline', 'regina', 'alveare', 'miele'],
    b: ['puntura', 'giallo e nero', 'picnic', 'fastidio', 'punge più volte', 'vitino sottile', 'nido di carta'],
  },
  'farfalla|libellula': {
    a: ['ali', 'prato', 'fiori', 'colori', 'retino', 'bozzolo', 'bruco'],
    b: ['ali', 'prato', 'stagno', 'canneto', 'elicottero', 'occhi enormi', 'ali trasparenti'],
  },
  'medico|infermiere': {
    a: ['ospedale', 'camice', 'ambulatorio', 'stetoscopio', 'ricetta', 'diagnosi', 'giuramento di Ippocrate'],
    b: ['ospedale', 'camice', 'corsia', 'turni di notte', 'zoccoli', 'prelievo', 'flebo'],
  },
  'pompiere|poliziotto': {
    a: ['divisa', 'sirena', 'casco', 'scala', 'idrante', 'incendio', 'manichetta'],
    b: ['divisa', 'sirena', 'volante', 'pattuglia', 'distintivo', 'manette', 'arresto'],
  },
  'professore|istruttore': {
    a: ['insegnare', 'lezione', 'compiti', 'cattedra', 'registro', 'voti', 'interrogazione'],
    b: ['insegnare', 'lezione', 'tuta', 'fischietto', 'palestra', 'corso di nuoto', 'scuola guida'],
  },
}
