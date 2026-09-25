/**
 * Le lancement du Petit Buveur en ligne vit désormais dans online-room-launch.ts
 * (launchPetitBuveurWithBots : même moteur, avec les bots choisis par l'hôte).
 * Reste ce ré-export, importé par la route de la salle (rooms/[roomId]).
 */
export { resetRoomToWaitingLobby } from '@/lib/online-room-launch'
