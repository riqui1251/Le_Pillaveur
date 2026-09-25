"use client"

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { usePlayers } from '../hooks/usePlayers';
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { X, Trophy, Pencil } from 'lucide-react';
import { PlayerIcon } from '@/components/ui/PlayerIcon';
import { PlayerCustomizer } from '@/components/ui/PlayerCustomizer';
import { Player, getPlayerNameValidationError } from '@/lib/players';
import { nameValidationI18nKey, type NameModerationReason } from '@/lib/name-moderation';
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client';
import { useAuth } from '@/hooks/useAuth';

interface PlayerManagerProps {
  onPlayersSelected: (selectedPlayers: string[]) => void;
  onStartOnline?: () => void;
  minPlayers?: number;
  hideRemoveButtons?: boolean;
  variant?: 'default' | 'hub';
  /**
   * Libellé du bouton de démarrage quand l'appelant sait déjà où il mène
   * (« Jouer à Purple ») ; à défaut, le « Commencer la partie » générique.
   */
  startLabel?: string;
}

const HUB_CARD = 'bg-felt-deep/60 border-gold/15 backdrop-blur-md shadow-lg';

/**
 * Séparateurs acceptés entre plusieurs prénoms saisis d'un coup : virgule,
 * point-virgule, retour à la ligne. Pas l'espace — « Jean Pierre » est un
 * seul convive. Le retour à la ligne n'arrive jamais tel quel : un `<input>`
 * mono-ligne l'efface au collage (« Léa⏎Tom » devenait « Léa Tom », UN
 * convive) — il est converti en virgule à la volée dans `handlePaste`.
 */
const NAME_SEPARATORS = /[,;\n]/;

export function PlayerManager({ onPlayersSelected, onStartOnline, minPlayers = 2, hideRemoveButtons = false, variant = 'default', startLabel }: PlayerManagerProps) {
  const t = useTranslations('players');
  const tCommon = useTranslations('common.nameValidation');
  const isHub = variant === 'hub';
  const cardClass = isHub ? HUB_CARD : 'shadow-md';
  const { user, refresh, setPlayMode } = useAuth();
  const { players, loading, addPlayers, removePlayer, updatePlayerPreferences } = usePlayers();

  const [newPlayerName, setNewPlayerName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  // La sélection SURVIT aux allers-retours (elle vit en localStorage, partagée
  // avec le hub) : elle repartait de zéro à chaque visite, obligeant le groupe
  // à re-cocher ses six convives plusieurs fois dans la soirée.
  const { selectedIds: selectedPlayerIds, select: selectPlayerIds } = useSelectedPlayers();
  const [customizingPlayer, setCustomizingPlayer] = useState<Player | null>(null);
  const [onlineName, setOnlineName] = useState('');
  const [onlineLoading, setOnlineLoading] = useState(false);
  // Le clavier se refermait entre deux prénoms : après un ajout, le champ est
  // vidé et le bouton « Ajouter » se désactive — le focus (donc le clavier)
  // partait avec lui. On le rend au champ dans le geste de l'utilisateur.
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Les trois champs lus par l'effet sont extraits d'abord : l'effet ne dépend
  // ainsi que de ce qu'il lit vraiment, pas de l'objet `user` entier (qui
  // change d'identité à chaque rafraîchissement de session).
  const userId = user?.id;
  const userOnlineDisplayName = user?.onlineDisplayName;
  const userDisplayName = user?.displayName;
  useEffect(() => {
    if (!userId) return;
    setOnlineName((prev) => prev || userOnlineDisplayName || userDisplayName || '');
  }, [userId, userOnlineDisplayName, userDisplayName]);

  // Contrepartie de la persistance : un joueur supprimé (ici ou sur un autre
  // appareil, la liste étant resynchronisée au retour) laisserait un id
  // fantôme dans la sélection — donc un compteur « 6 joueurs prêts » pour 5
  // cartes cochées. On élague dès que la liste est chargée. Un renommage ne
  // change pas l'id : la sélection y survit sans rien faire.
  useEffect(() => {
    if (loading) return;
    const alive = selectedPlayerIds.filter((id) => players.some((p) => p.id === id));
    if (alive.length !== selectedPlayerIds.length) selectPlayerIds(alive);
  }, [loading, players, selectedPlayerIds, selectPlayerIds]);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    // Plusieurs prénoms en une saisie (« Léa, Tom ; Max ») : la tablée se
    // dicte d'un trait au lieu de six allers-retours clavier. Doublons d'une
    // même saisie ignorés ; chaque prénom passe la validation habituelle.
    const names = Array.from(
      new Set(newPlayerName.split(NAME_SEPARATORS).map((name) => name.trim()).filter(Boolean))
    );
    if (names.length === 0) return;

    const rejected: { name: string; reason: NameModerationReason }[] = [];
    const accepted: string[] = [];
    for (const name of names) {
      const validationError = getPlayerNameValidationError(name);
      if (validationError) {
        void reportProfanityIfNeeded(name, validationError, 'local_player_add');
        rejected.push({ name, reason: validationError });
        continue;
      }
      accepted.push(name);
    }

    // Tout le lot en un geste (une écriture, une poussée cloud), et le hook
    // nous rend les joueurs créés. Fraîchement ajouté = à la table : personne
    // n'inscrit un prénom pour ne pas le faire jouer, et le décocher reste un
    // geste. Avant, chaque ajout réclamait un second toucher sur la carte —
    // six fois par soirée.
    if (accepted.length > 0) {
      const { created } = addPlayers(accepted);
      if (created.length > 0) {
        selectPlayerIds([...selectedPlayerIds, ...created.map((player) => player.id)]);
      }
    }

    if (rejected.length > 0) {
      const { reason } = rejected[0];
      const key = nameValidationI18nKey(reason);
      const messageKey = reason === 'invalid_characters' ? 'invalidCharactersPlayer' : key;
      const message = tCommon(messageKey);
      // Un seul prénom saisi : le message habituel. En lot : on nomme les
      // refusés, qui restent dans le champ prêts à corriger — les acceptés
      // en sortent.
      setNameError(
        names.length === 1
          ? message
          : t('rejectedNames', { names: rejected.map((r) => r.name).join(', '), reason: message })
      );
      setNewPlayerName(rejected.map((r) => r.name).join(', '));
    } else {
      setNameError(null);
      setNewPlayerName('');
    }
    nameInputRef.current?.focus();
  };

  // Liste collée depuis une conversation (un prénom par ligne) : le champ
  // mono-ligne aurait avalé les sauts de ligne — on les remplace par des
  // virgules et on insère nous-mêmes à l'endroit du curseur. Un collage sans
  // saut de ligne suit le chemin natif.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    const input = e.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const joined = text.replace(/[\r\n]+/g, ', ');
    setNewPlayerName(input.value.slice(0, start) + joined + input.value.slice(end));
    if (nameError) setNameError(null);
  };

  const togglePlayerSelection = (playerId: string) => {
    selectPlayerIds(
      selectedPlayerIds.includes(playerId)
        ? selectedPlayerIds.filter((id) => id !== playerId)
        : [...selectedPlayerIds, playerId]
    );
  };

  const handleStartGame = () => {
    if (selectedPlayerIds.length < minPlayers) return;
    onPlayersSelected(selectedPlayerIds);
  };

  const handleSaveOnlineName = async () => {
    const value = onlineName.trim();
    if (!value || !user) return false;
    setOnlineLoading(true);
    try {
      const response = await fetch('/api/auth/online-display-name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onlineDisplayName: value }),
      });
      if (!response.ok) return false;
      await refresh();
      return true;
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleStartOnline = async () => {
    if (!user || !onStartOnline) return;
    if (!user.onlineDisplayName) {
      const ok = await handleSaveOnlineName();
      if (!ok) return;
    }
    await setPlayMode('online');
    onStartOnline();
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center rounded-2xl border p-12 ${isHub ? HUB_CARD : ''}`}>
        <div className="flex flex-col items-center gap-3 text-white/70">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  const canStart = selectedPlayerIds.length >= minPlayers;

  return (
    <>
      <div className="space-y-6 pb-28">
        <Card className={`p-4 ${cardClass}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold md:text-xl">{t('addTitle')}</h2>
          </div>
          <form onSubmit={handleAddPlayer} className="space-y-3">
            {/* Une seule ligne même à 375px : champ + bouton côte à côte,
                le clavier reste ouvert entre deux ajouts (le focus est rendu
                au champ dans `handleAddPlayer`). */}
            <div className="flex items-center gap-2">
              <Input
                ref={nameInputRef}
                type="text"
                placeholder={t('namesPlaceholder')}
                value={newPlayerName}
                onChange={(e) => {
                  setNewPlayerName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                onPaste={handlePaste}
                autoComplete="off"
                enterKeyHint="done"
                className="min-w-0 flex-1"
                aria-invalid={nameError ? true : undefined}
              />
              <Button type="submit" disabled={!newPlayerName.trim()} className="shrink-0">
                {t('addButton')}
              </Button>
            </div>
            {nameError && (
              <p className="text-sm text-orange-400" role="alert">
                {nameError}
              </p>
            )}
          </form>
        </Card>

        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold md:text-xl">{t('selectTitle')}</h2>
          {/* Chaque convive est une carte crème qu'on abat pour le sélectionner
              (ring d'or) — encre pure sur crème, comme partout. 2 colonnes dès
              le mobile : avatar + actions en tête, nom en dessous. */}
          {/* Liste vide : une grille sans carte ne disait rien à un groupe qui
              arrive pour la première fois — ni combien de prénoms il faut, ni
              où ils vont. Le mot d'ordre tient en une ligne ; la grille
              (vide, donc sans hauteur) reprend dès le premier ajout. */}
          {players.length === 0 && (
            <p className="rounded-xl border border-dashed border-gold/25 bg-black/20 px-4 py-6 text-center text-sm text-white/70">
              {t('emptyHint', { min: minPlayers })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {players.map((player) => (
              <Card
                key={player.id}
                onClick={() => togglePlayerSelection(player.id)}
                className={`cursor-pointer border-[#D8CCAE] bg-cream p-2.5 text-[#24201A] transition-all duration-200 sm:p-3 ${
                  selectedPlayerIds.includes(player.id)
                    ? '-translate-y-0.5 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)] ring-2 ring-gold'
                    : 'opacity-75 shadow-[0_6px_14px_-8px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:opacity-100'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <PlayerIcon player={player} size="md" className="h-9 w-9 text-lg" />
                  {/* Crayon et croix : 36 px visibles, 44 px au doigt
                      (.touch-target). L'écart de 8 px n'est pas décoratif —
                      sans lui, la zone invisible de la croix mordrait sur le
                      bord du crayon, et un « personnaliser » raté retirerait
                      le joueur. */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="touch-target h-9 w-9 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomizingPlayer(player);
                      }}
                      title={t('customize')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!hideRemoveButtons && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="touch-target h-9 w-9 rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlayer(player.id);
                          selectPlayerIds(selectedPlayerIds.filter((id) => id !== player.id));
                        }}
                        aria-label={t('removePlayer', { name: player.name })}
                        title={t('removePlayer', { name: player.name })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 min-w-0">
                  {/* Encre pure sur crème : les couleurs cosmétiques des
                      pseudos (souvent claires) sont illisibles ici — elles
                      restent visibles sur les surfaces feutre. */}
                  <div className="truncate text-sm font-semibold text-[#24201A]">{player.name}</div>
                  <div className="flex items-center gap-1 text-xs opacity-70">
                    <Trophy className="h-3 w-3 shrink-0" /> {t('wins', { count: player.stats.wins })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {onStartOnline && (
          <div className="rounded-xl border border-gold/25 bg-gold/10 p-3">
            {!user ? (
              <p className="text-sm text-amber-100/90">{t('onlineNeedsAccount')}</p>
            ) : (
              <Button
                type="button"
                onClick={() => { void handleStartOnline(); }}
                className="bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:from-amber-300 hover:to-amber-400"
                disabled={onlineLoading}
              >
                {t('goOnline')}
              </Button>
            )}
          </div>
        )}
      </div>

      <PlayerCustomizer
        player={customizingPlayer}
        open={customizingPlayer !== null}
        onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
        onSave={updatePlayerPreferences}
      />

      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl ${
          isHub
            ? 'border-gold/15 bg-felt-deep/90'
            : 'border-border bg-background/95'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 sm:gap-4">
          <p className={`min-w-0 flex-1 text-sm ${canStart ? 'text-white/70' : 'text-orange-400'}`}>
            {canStart
              ? t('selectionStatus.ready', { count: selectedPlayerIds.length })
              : t('selectionStatus.needMore', { min: minPlayers, current: selectedPlayerIds.length })}
          </p>
          {/* « Jouer à Qui est l'Espion ? » sur 375 px : un bouton qui refuse
              de se replier (`whitespace-nowrap` du Button) écrasait le statut
              à gauche sur quatre lignes. C'est le libellé du CTA qui se replie,
              borné à 60 % de la barre — le statut garde le reste. */}
          <Button
            onClick={handleStartGame}
            disabled={!canStart}
            className="h-auto min-h-[44px] max-w-[60%] shrink-0 whitespace-normal bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-center font-medium leading-tight text-white hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
          >
            {startLabel ?? t('startGame')}
          </Button>
        </div>
      </div>
    </>
  );
}
