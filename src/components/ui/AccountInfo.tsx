/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Trash2, User, BarChart3, Gamepad2, Calendar, LogOut, Users, Mail, Cloud, Shield, Copy, Check, Hash, Pencil, TextCursorInput, AlertTriangle, X, Globe, ChevronDown, ChevronRight, FileText, Trophy } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { usePlayers } from '@/hooks/usePlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import { FriendsManager } from '@/components/friends/FriendsManager'
import { MyOnlineStats } from '@/components/online/MyOnlineStats'
import { canAccessSupervision } from '@/lib/roles'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerCustomizer } from '@/components/ui/PlayerCustomizer'
import { OnlineCollection } from '@/components/online/OnlineCollection'
import { OnlinePlayerIcon, OnlinePlayerName, RankCrest } from '@/components/online/OnlinePlayerTag'
import { Player, getPlayerNameValidationError } from '@/lib/players'
import type { OnlinePreferences } from '@/lib/online-preferences'
import { nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import { getSafeStorage } from '@/lib/storage'
import { useLocalizedGames } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'

/* Ligne de compte uniforme (Direction B) : icône + libellé + chevron,
   ≥48px de haut — la même qu'elle déplie une section ou qu'elle navigue. */
const ACCOUNT_ROW_CLASS =
  'flex w-full min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.06]'

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-gold/10 bg-felt-deep/60 p-4 text-center">
      <span className={cn('font-display text-3xl font-bold tabular-nums', color)}>{value}</span>
      <span className="mt-1 text-xs text-white/50">{label}</span>
    </div>
  )
}

export function AccountInfo() {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const tNameValidation = useTranslations('common.nameValidation')
  const locale = useLocale()
  const games = useLocalizedGames()
  const gameNames = useMemo(
    () => Object.fromEntries(games.map((g) => [g.id, g.title])),
    [games]
  )
  const { user, logout, refresh } = useAuth()
  const { progression, refresh: refreshProgression } = useOnlineProgression()
  const { players, loading, removePlayer, updatePlayer, updatePlayerPreferences } = usePlayers()
  const tFriends = useTranslations('account.friends')
  const tNav = useTranslations('nav')
  const [totalGames, setTotalGames] = useState(0)
  const [totalDrinks, setTotalDrinks] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [renamingPlayerId, setRenamingPlayerId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [customizingPlayer, setCustomizingPlayer] = useState<Player | null>(null)
  const [nameModerationWarning, setNameModerationWarning] = useState(false)
  const [onlineName, setOnlineName] = useState('')
  const [onlineNameError, setOnlineNameError] = useState<string | null>(null)
  const [onlineNameSaved, setOnlineNameSaved] = useState(false)
  const [customizingOnline, setCustomizingOnline] = useState(false)
  // Liste des joueurs locaux repliée par défaut (elle peut être très longue).
  const [showLocalPlayers, setShowLocalPlayers] = useState(false)
  const [showOnlineSection, setShowOnlineSection] = useState(false)
  const [showFriends, setShowFriends] = useState(false)

  const onlineDisplayName = user?.onlineDisplayName ?? user?.displayName ?? 'Joueur'
  const onlineMemberCosmetics = useMemo(
    () => ({
      preferences: { color: 'bg-amber-500' as const, ...user?.onlinePreferences },
      level: progression?.level ?? 1,
      role: user?.role ?? 'user',
    }),
    [user?.onlinePreferences, user?.role, progression?.level]
  )

  const saveOnlinePreferences = async (preferences: Partial<OnlinePreferences>) => {
    await fetch('/api/auth/online-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(preferences),
    })
    await Promise.all([refresh(), refreshProgression()])
  }

  useEffect(() => {
    if (!user) {
      setNameModerationWarning(false)
      return
    }
    let cancelled = false
    fetch('/api/name-moderation/status', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.showWarning) {
          setNameModerationWarning(true)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    setOnlineName(user?.onlineDisplayName ?? user?.displayName ?? '')
  }, [user?.id, user?.onlineDisplayName, user?.displayName])

  const startRename = (player: Player) => {
    setConfirmDelete(null)
    setRenamingPlayerId(player.id)
    setRenameValue(player.name)
  }

  const cancelRename = () => {
    setRenamingPlayerId(null)
    setRenameValue('')
    setRenameError(null)
  }

  const saveRename = (playerId: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) return

    const validationError = getPlayerNameValidationError(trimmed)
    if (validationError) {
      void reportProfanityIfNeeded(trimmed, validationError, 'local_player_rename').then(
        (result) => {
          if (result?.showWarning) setNameModerationWarning(true)
        }
      )
      const key = nameValidationI18nKey(validationError)
      const messageKey =
        validationError === 'invalid_characters' ? 'invalidCharactersPlayer' : key
      setRenameError(tNameValidation(messageKey))
      return
    }

    updatePlayer(playerId, { name: trimmed })
    cancelRename()
  }

  const dismissModerationWarning = async () => {
    setNameModerationWarning(false)
    await fetch('/api/name-moderation/dismiss-warning', { method: 'POST', credentials: 'include' })
  }

  const copyAccountCode = async () => {
    if (!user?.accountCode) return
    try {
      await navigator.clipboard.writeText(user.accountCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const saveOnlineName = async () => {
    const value = onlineName.trim()
    if (!value) return
    setOnlineNameError(null)
    setOnlineNameSaved(false)
    const response = await fetch('/api/auth/online-display-name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ onlineDisplayName: value }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setOnlineNameError(data.error ?? 'Impossible d’enregistrer le pseudo online')
      return
    }
    setOnlineName(value)
    await refresh()
    setOnlineNameSaved(true)
    window.setTimeout(() => setOnlineNameSaved(false), 1500)
  }

  useEffect(() => {
    const storage = getSafeStorage()
    const storedGames = storage?.getItem('games') ?? null
    const gamesData = storedGames ? JSON.parse(storedGames) : []

    if (gamesData.length === 0 && players.length > 0) {
      setTotalGames(players.reduce((total, p) => total + (p.stats.gamesPlayed || 0), 0))
    } else {
      setTotalGames(gamesData.length)
    }
    setTotalDrinks(players.reduce((total, p) => total + (p.stats.totalDrinks || 0), 0))
  }, [players])

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        </div>
        <PlayerCustomizer
          player={customizingPlayer}
          open={customizingPlayer !== null}
          onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
          onSave={updatePlayerPreferences}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        {/* Le profil est une carte à jouer — pseudo en Playfair, encre sur crème. */}
        <PlayingCard suit="spade" rank="A" className="min-w-0 flex-1">
          <div className="px-7 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6B6455]">
              {t('brand')}
            </p>
            <h1 className="mt-0.5 truncate font-display text-2xl font-bold text-[#24201A] sm:text-3xl">
              {user?.displayName ?? t('title')}
            </h1>
            {user?.accountCode && (
              <button
                type="button"
                onClick={copyAccountCode}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#24201A]/15 bg-[#24201A]/5 px-2.5 py-1 font-mono text-xs text-[#4A443A] transition-colors hover:bg-[#24201A]/10"
                title={t('copyAccountCode')}
              >
                <Hash className="h-3 w-3" />
                {user.accountCode}
                {codeCopied ? (
                  <Check className="h-3 w-3 text-emerald-700" />
                ) : (
                  <Copy className="h-3 w-3 opacity-60" />
                )}
              </button>
            )}
            {user?.email && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6B6455]">
                <Mail className="h-3 w-3" />
                {user.email}
              </p>
            )}
          </div>
        </PlayingCard>
        <div className="flex shrink-0 items-center gap-2">
          {user && canAccessSupervision(user.role) && (
            <Link
              href="/supervision"
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">{t('supervision')}</span>
            </Link>
          )}
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('logout')}</span>
          </button>
        </div>
      </div>

      {nameModerationWarning && (
        <div
          role="alert"
          className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="flex-1">{t('nameModerationWarning')}</p>
          <button
            type="button"
            onClick={() => { void dismissModerationWarning() }}
            aria-label={tCommon('close')}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-amber-300/70 transition-colors hover:bg-amber-500/20 hover:text-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── COMPTE EN LIGNE — accordéon avec résumé (niveau + pseudo) ───── */}
      <section>
        <button
          type="button"
          onClick={() => setShowOnlineSection((v) => !v)}
          aria-expanded={showOnlineSection}
          className={ACCOUNT_ROW_CLASS}
        >
          <Globe className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="shrink-0">{t('onlineSection.title')}</span>
          <span className="min-w-0 flex-1 truncate text-left text-xs font-normal text-white/40">
            {progression && `· ${t('progression.level', { level: progression.level })}`} · {onlineDisplayName}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform', showOnlineSection && 'rotate-180')}
          />
        </button>

        <div className={cn('mt-3 space-y-4', !showOnlineSection && 'hidden')}>
          {progression && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/15 text-base font-extrabold text-amber-300">
                  {progression.level}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {t('progression.level', { level: progression.level })}
                  </p>
                  <p className="text-xs text-white/45">
                    {t('progression.xpToNext', {
                      current: progression.current,
                      required: progression.required,
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-white/40">
                  {t('progression.totalXp', { xp: progression.xp })}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((progression.current / Math.max(1, progression.required)) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/40">{t('progression.hint')}</p>
            </div>
          )}

          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/70">
              <Cloud className="h-4 w-4 text-cyan-300" />
              Pseudo online (compte)
            </div>
            <p className="mb-2 text-xs text-cyan-100/80">
              Ce pseudo est utilisé automatiquement pour les parties online (1 joueur compte). Les mêmes restrictions de pseudo s’appliquent.
            </p>

            {/* Aperçu de l'identité en ligne (écusson de rang + icône encadrée + effet) */}
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <RankCrest role={user?.role} />
              <OnlinePlayerIcon cosmetics={onlineMemberCosmetics} className="h-10 w-10 text-xl" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                <OnlinePlayerName name={onlineDisplayName} cosmetics={onlineMemberCosmetics} />
              </p>
              <button
                type="button"
                onClick={() => setCustomizingOnline(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/25 px-2.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/35"
                title={t('playersList.customize')}
                aria-label={t('playersList.customize')}
              >
                <Pencil className="h-3.5 w-3.5" />
                {/* Icône seule en mobile : le pseudo garde la place (il se
                    tronquait à 3 caractères à 375px). */}
                <span className="hidden sm:inline">{t('playersList.customize')}</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={onlineName}
                onChange={(e) => {
                  setOnlineName(e.target.value)
                  if (onlineNameError) setOnlineNameError(null)
                }}
                maxLength={30}
                placeholder="Ton pseudo online"
                className="h-9 border-cyan-300/25 bg-black/20 text-sm text-white placeholder:text-white/35"
              />
              <button
                type="button"
                onClick={() => { void saveOnlineName() }}
                className="rounded-lg bg-cyan-500/25 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/35"
              >
                Enregistrer
              </button>
            </div>
            {onlineNameError && <p className="mt-2 text-xs text-orange-300">{onlineNameError}</p>}
            {onlineNameSaved && <p className="mt-2 text-xs text-emerald-300">Pseudo online enregistré.</p>}
          </div>

          <MyOnlineStats />
        </div>
      </section>

      {/* ── JEUX LOCAUX (cet appareil) ──────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
          <BarChart3 className="h-4 w-4 text-amber-300" />
          {t('localSection.title')}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={t('stats.players')} value={players.length} color="text-amber-300" />
          <StatCard label={t('stats.games')} value={totalGames} color="text-sky-300" />
          {/* Rouge « enseigne » éclairci : le suit-red pur manque de contraste sur feutre. */}
          <StatCard label={t('stats.sips')} value={totalDrinks} color="text-red-300" />
        </div>
      </section>

      <section>
        {/* Liste repliable : elle peut compter des dizaines de joueurs. */}
        <button
          type="button"
          onClick={() => setShowLocalPlayers((v) => !v)}
          aria-expanded={showLocalPlayers}
          className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.06]"
        >
          <Users className="h-4 w-4 text-amber-300" />
          {t('playersList.title')}
          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] tabular-nums text-white/60">
            {players.length}
          </span>
          <ChevronDown
            className={cn(
              'ml-auto h-4 w-4 text-white/40 transition-transform',
              showLocalPlayers && 'rotate-180'
            )}
          />
        </button>

        {showLocalPlayers && (players.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-10 text-center">
            <User className="mb-2 h-7 w-7 text-white/20" />
            <p className="text-sm text-white/40">{t('playersList.empty')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((player) => {
              const isConfirming = confirmDelete === player.id
              const isRenaming = renamingPlayerId === player.id
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all"
                >
                  <PlayerIcon player={player} size="md" className="h-10 w-10 text-xl" />

                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          type="text"
                          value={renameValue}
                          onChange={(e) => {
                            setRenameValue(e.target.value)
                            if (renameError) setRenameError(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(player.id)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          placeholder={t('playersList.renamePlaceholder')}
                          className="h-9 border-white/15 bg-white/[0.06] text-sm text-white placeholder:text-white/35"
                          autoFocus
                          maxLength={40}
                          aria-invalid={renameError ? true : undefined}
                        />
                        {renameError && (
                          <p className="text-xs text-orange-400 sm:col-span-2" role="alert">
                            {renameError}
                          </p>
                        )}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => saveRename(player.id)}
                            disabled={!renameValue.trim()}
                            className="rounded-lg bg-amber-500/20 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
                          >
                            {tCommon('save')}
                          </button>
                          <button
                            type="button"
                            onClick={cancelRename}
                            className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
                          >
                            {tCommon('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-sm font-semibold">
                          <PlayerName player={player} />
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
                          <span>{t('playersList.gamesPlayed', { count: player.stats.gamesPlayed })}</span>
                          <span>·</span>
                          <span>{t('playersList.wins', { count: player.stats.wins })}</span>
                          {player.stats.favoriteGame && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Gamepad2 className="h-2.5 w-2.5" />
                                {gameNames[player.stats.favoriteGame] ?? player.stats.favoriteGame}
                              </span>
                            </>
                          )}
                          {player.stats.lastPlayed ? (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(player.stats.lastPlayed).toLocaleDateString(locale)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  {isRenaming ? null : isConfirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => { removePlayer(player.id); setConfirmDelete(null) }}
                        className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30"
                      >
                        {t('playersList.confirmDelete')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
                      >
                        {tCommon('cancel')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => startRename(player)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-amber-500/15 hover:text-amber-300"
                        title={t('playersList.rename')}
                      >
                        <TextCursorInput className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setCustomizingPlayer(player)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-amber-500/15 hover:text-amber-300"
                        title={t('playersList.customize')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(player.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ))}
      </section>

      <PlayerCustomizer
        player={customizingPlayer}
        open={customizingPlayer !== null}
        onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
        onSave={updatePlayerPreferences}
      />

      <OnlineCollection
        open={customizingOnline}
        onOpenChange={setCustomizingOnline}
        displayName={onlineDisplayName}
        role={user?.role ?? 'user'}
        preferences={onlineMemberCosmetics.preferences}
        progression={progression}
        onSave={(preferences) => { void saveOnlinePreferences(preferences) }}
      />

      <section>
        <button
          type="button"
          onClick={() => setShowFriends((v) => !v)}
          aria-expanded={showFriends}
          className={ACCOUNT_ROW_CLASS}
        >
          <Users className="h-4 w-4 shrink-0 text-amber-300" />
          {tFriends('title')}
          <ChevronDown
            className={cn('ml-auto h-4 w-4 shrink-0 text-white/40 transition-transform', showFriends && 'rotate-180')}
          />
        </button>
        <div className={cn('mt-3 rounded-2xl border border-gold/20 bg-gold/10 p-4', !showFriends && 'hidden')}>
          <FriendsManager />
        </div>
      </section>

      {/* Lignes de navigation : mêmes gabarits que les accordéons — la
          flèche › dit « ça ouvre un autre écran ». */}
      <section className="space-y-2">
        <Link href="/achievements" className={ACCOUNT_ROW_CLASS}>
          <Trophy className="h-4 w-4 shrink-0 text-amber-300" />
          {tNav('pages.achievements.title')}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
        </Link>
        <Link href="/legal/cgu" className={ACCOUNT_ROW_CLASS}>
          <FileText className="h-4 w-4 shrink-0 text-amber-300" />
          {tNav('legal.cgu')} &amp; {tNav('legal.confidentialite')}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
        </Link>
      </section>

      <section>
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/80">
          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <p>{t('sync')}</p>
        </div>
      </section>
    </div>
  )
}
