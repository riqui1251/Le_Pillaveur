"use client"

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Pont entre le dock vocal (VoiceDock, chargé À LA DEMANDE par le layout des
 * jeux) et les boutons micro posés dans les en-têtes (VoiceDockButton :
 * lobby, bandeau de phase). Ce module ne tire ni WebRTC ni framer-motion :
 * un en-tête peut l'importer sans alourdir sa page.
 *
 * Le dock PUBLIE son état (disponible ici, ouvert, en vocal, micro coupé,
 * nombre en vocal) ; un bouton d'en-tête le LIT et demande l'ouverture. Tant
 * qu'un bouton d'en-tête est monté, la bulle flottante se range : elle
 * chevauchait le bas des écrans (zone pouce, barre d'action).
 */

export type VoiceDockStatus = {
  /** Le dock est monté ET a sa place sur cette page (page du jeu de la salle, ou vocal en cours). */
  available: boolean
  /** Feuille vocale ouverte. */
  open: boolean
  /** Le joueur est dans le vocal. */
  joined: boolean
  micMuted: boolean
  /** Joueurs en vocal, soi compris — 0 hors vocal. */
  inVoice: number
  /** Quelqu'un d'autre parle (et on l'entend). */
  speaking: boolean
}

const INITIAL: VoiceDockStatus = {
  available: false,
  open: false,
  joined: false,
  micMuted: false,
  inVoice: 0,
  speaking: false,
}

let status: VoiceDockStatus = INITIAL
let anchors = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getStatus = () => status
const getServerStatus = () => INITIAL
const getAnchors = () => anchors
const getServerAnchors = () => 0

/** Réservé au dock : publie son état (n'émet que si quelque chose change). */
export function publishVoiceDockStatus(patch: Partial<VoiceDockStatus>) {
  const next = { ...status, ...patch }
  const changed = (Object.keys(next) as (keyof VoiceDockStatus)[]).some((key) => next[key] !== status[key])
  if (!changed) return
  status = next
  notify()
}

/** Ouvre, ferme ou bascule la feuille vocale (sans effet si le dock n'est pas disponible). */
export function setVoiceDockOpen(open: boolean | ((current: boolean) => boolean)) {
  const value = typeof open === 'function' ? open(status.open) : open
  publishVoiceDockStatus({ open: value && status.available })
}

/** État du dock vocal, à jour à chaque publication. */
export function useVoiceDockStatus(): VoiceDockStatus {
  return useSyncExternalStore(subscribe, getStatus, getServerStatus)
}

/** Vrai tant qu'au moins un bouton micro d'en-tête est monté : la bulle flottante se range. */
export function useVoiceDockAnchored(): boolean {
  return useSyncExternalStore(subscribe, getAnchors, getServerAnchors) > 0
}

/** Déclare un bouton micro d'en-tête pour la durée de son montage. */
export function useVoiceDockAnchor() {
  useEffect(() => {
    anchors += 1
    notify()
    return () => {
      anchors -= 1
      notify()
    }
  }, [])
}
