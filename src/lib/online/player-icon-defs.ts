/**
 * Données des icônes joueur EN LIGNE — définitions SVG sur mesure, une par
 * id stable (remplace les emojis bruts d'ICON_SERIES). Module PARTAGÉ
 * client/serveur, aucune dépendance React : `ICON_SERIES` (cosmetics.ts)
 * dérive ses ids depuis ce fichier, `PlayerIconById`
 * (components/icons/PlayerIcons.tsx) dérive son rendu SVG.
 *
 * Chaque icône est un tracé complet (pas de `currentColor`) : palette fixe
 * dérivée du site, un avatar garde ses couleurs partout où il est affiché.
 */

export type PlayerIconDef = { id: string; label: string; svg: string }
export type PlayerIconSeriesDef = { id: string; unlockLevel: number; icons: PlayerIconDef[] }

export const PLAYER_ICON_SERIES: PlayerIconSeriesDef[] = [
  {
    "id": "apero",
    "unlockLevel": 1,
    "icons": [
      {
        "id": "chope",
        "label": "Chope",
        "svg": "<path d=\"M6 8.5h9.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8.5z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13 8.5h2.5V19a2 2 0 0 1-2 2h-1.6c.7-.5 1.1-1.2 1.1-2z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M15.5 11h1.7a2.3 2.3 0 0 1 0 4.6h-1.7\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.4 8.5c-.6-1.5.2-2.9 1.7-3 .2-1.5 1.5-2.6 3.2-2.4 1-.9 2.6-.9 3.6 0 1.5-.2 2.6.8 2.6 2.2 1 .6 1.2 1.9.5 3.2H5.4z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.3\" cy=\"12.4\" rx=\"1.4\" ry=\"3.2\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(0 8.3 12.4)\"/><circle cx=\"11\" cy=\"15\" r=\"0.8\" fill=\"#FFFFFF\" stroke=\"none\"/>"
      },
      {
        "id": "vin",
        "label": "Verre de vin",
        "svg": "<path d=\"M8 3h8c0 5-1.5 7.6-4 7.6S8 8 8 3z\" fill=\"#FFFFFF\" opacity=\".55\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.4 5.2h7.2c-.5 3.4-1.7 5.2-3.6 5.2s-3.1-1.8-3.6-5.2z\" fill=\"#B3382E\"/><path d=\"M8 3h8c0 5-1.5 7.6-4 7.6S8 8 8 3z\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 10.6V18M8.5 21h7M12 18c-1.8 0-2.8 1-3.5 3\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10\" cy=\"6.3\" rx=\"1\" ry=\"1.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-15 10 6.3)\"/>"
      },
      {
        "id": "flute",
        "label": "Flûte",
        "svg": "<path d=\"M10.4 3h3.2l-.5 8.2a1.1 1.1 0 0 1-2.2 0L10.4 3z\" fill=\"#E8C25A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 12.3V18M9.2 21h5.6M12 18c-1.4 0-2.2.9-2.8 3\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"11.3\" cy=\"5.5\" r=\"0.45\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"12.6\" cy=\"7.6\" r=\"0.45\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"11.7\" cy=\"9.4\" r=\"0.4\" fill=\"#FFFFFF\" stroke=\"none\"/>"
      },
      {
        "id": "cocktail",
        "label": "Cocktail",
        "svg": "<path d=\"M5 4h14l-7 8.2z\" fill=\"#D07A3A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 12.2 19 4h-3.5l-4.4 7z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M12 12.2V19M8 21h8M12 19c-1.6 0-2.5.7-3.2 2\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15.7\" cy=\"6\" r=\"1.5\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15.7 4.5 17.5 2\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.6\" cy=\"5.6\" rx=\"1.5\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 5.6)\"/>"
      },
      {
        "id": "whisky",
        "label": "Whisky",
        "svg": "<path d=\"M6.5 4h11l-.9 15a2 2 0 0 1-2 1.9H9.4a2 2 0 0 1-2-1.9L6.5 4z\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7 11.5h10l-.4 7.5a2 2 0 0 1-2 1.9H9.4a2 2 0 0 1-2-1.9L7 11.5z\" fill=\"#D9A441\"/><path d=\"M6.5 4h11l-.9 15a2 2 0 0 1-2 1.9H9.4a2 2 0 0 1-2-1.9L6.5 4z\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"10\" y=\"12.6\" width=\"4.6\" height=\"4.6\" rx=\"1\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"11.2\" cy=\"13.8\" rx=\"1\" ry=\"0.5\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-35 11.2 13.8)\"/>"
      },
      {
        "id": "bouteille",
        "label": "Bouteille",
        "svg": "<path d=\"M10.4 3h3.2v4l2 3.4V19a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-2-2v-8.6l2-3.4V3z\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.6 3v4l2 3.4V19a2 2 0 0 1-2 2h-1.4c.8-.5 1.2-1.2 1.2-2v-8.9L11.7 7V3z\" fill=\"#24201A\" opacity=\".14\"/><rect x=\"8.9\" y=\"12.5\" width=\"6.2\" height=\"4.6\" rx=\".8\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.4 3.2h3.2\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10.1\" cy=\"9.2\" rx=\"0.8\" ry=\"2.2\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(0 10.1 9.2)\"/>"
      },
      {
        "id": "trinque",
        "label": "Santé !",
        "svg": "<g transform=\"rotate(-16 7.5 14)\"><path d=\"M4.8 9.5h5.4V19a1.6 1.6 0 0 1-1.6 1.6H6.4A1.6 1.6 0 0 1 4.8 19V9.5z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.6 9.5c-.5-1.2.1-2.3 1.3-2.4.3-1.2 1.4-1.9 2.6-1.6.9-.6 2-.4 2.6.4 1 .1 1.5 1 1.2 2.1-.1.8-.6 1.5-1.3 1.5H4.6z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></g><g transform=\"rotate(16 16.5 14)\"><path d=\"M13.8 9.5h5.4V19a1.6 1.6 0 0 1-1.6 1.6h-2.2a1.6 1.6 0 0 1-1.6-1.6V9.5z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.6 9.5c-.5-1.2.1-2.3 1.3-2.4.3-1.2 1.4-1.9 2.6-1.6.9-.6 2-.4 2.6.4 1 .1 1.5 1 1.2 2.1-.1.8-.6 1.5-1.3 1.5h-6.4z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></g><path d=\"M12 2.2v2M9.6 3.2l1.1 1.5M14.4 3.2l-1.1 1.5\" stroke=\"#B8862F\" stroke-width=\"1.3\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "shaker",
        "label": "Shaker",
        "svg": "<path d=\"M9 7.5h6l1 11a2 2 0 0 1-2 2.1h-4a2 2 0 0 1-2-2.1l1-11z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.6 7.5H15l1 11a2 2 0 0 1-2 2.1h-1.5c.8-.5 1.2-1.3 1.1-2.1z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M10 3.8h4a1 1 0 0 1 1 1v2.7H9V4.8a1 1 0 0 1 1-1z\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10.6\" cy=\"11\" rx=\"1\" ry=\"3\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(4 10.6 11)\"/>"
      },
      {
        "id": "citron",
        "label": "Citron",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"7.5\" fill=\"#E8C25A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"5.6\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 6.8v10.4M6.8 12h10.4M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2\" stroke=\"#D9A441\" stroke-width=\"1.1\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"#E8C25A\" stroke=\"none\"/><ellipse cx=\"9\" cy=\"8.2\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 8.2)\"/>"
      },
      {
        "id": "olive",
        "label": "Olives",
        "svg": "<path d=\"M4.5 20.5 17 5\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"13.6\" cy=\"9.2\" rx=\"3\" ry=\"3.6\" transform=\"rotate(-38 13.6 9.2)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15.5\" cy=\"6.9\" r=\"1.1\" fill=\"#B3382E\" stroke=\"none\"/><ellipse cx=\"9\" cy=\"14.8\" rx=\"3\" ry=\"3.6\" transform=\"rotate(-38 9 14.8)\" fill=\"#2A6A45\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"10.9\" cy=\"12.5\" r=\"1.1\" fill=\"#B3382E\" stroke=\"none\"/><path d=\"M17 5c.6-.9 1.5-1.4 2.7-1.5\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12.4\" cy=\"8.4\" rx=\"1\" ry=\"0.55\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-38 12.4 8.4)\"/><ellipse cx=\"7.8\" cy=\"14\" rx=\"1\" ry=\"0.55\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-38 7.8 14)\"/>"
      },
      {
        "id": "tonneau",
        "label": "Tonneau",
        "svg": "<path d=\"M7 4.6c3-1.2 7-1.2 10 0v14.8c-3 1.2-7 1.2-10 0V4.6z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14 3.9c1.1.15 2.1.4 3 .7v14.8c-.9.3-1.9.55-3 .7z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.6 9.2c3.3 1 7.5 1 10.8 0M6.6 14.8c3.3 1 7.5 1 10.8 0\" stroke=\"#D9A441\" stroke-width=\"1.4\"/><ellipse cx=\"9.2\" cy=\"7\" rx=\"0.9\" ry=\"2.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(6 9.2 7)\"/>"
      },
      {
        "id": "glacon",
        "label": "Glaçon",
        "svg": "<rect x=\"5.5\" y=\"5.5\" width=\"13\" height=\"13\" rx=\"3\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14 5.5h1.5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H14c1.7-.9 2.5-2.2 2.5-4V9.5c0-1.8-.8-3.1-2.5-4z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4\" stroke=\"#FFFFFF\" stroke-width=\"1.2\" opacity=\".8\"/><ellipse cx=\"8.6\" cy=\"8\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 8)\"/>"
      }
    ]
  },
  {
    "id": "trognes",
    "unlockLevel": 2,
    "icons": [
      {
        "id": "content",
        "label": "Content",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M17.4 5.5A8.5 8.5 0 0 1 12 20.5c-1.6 0-3.1-.45-4.4-1.2 5.5-.4 9.4-4.1 9.8-13.8z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9\" cy=\"10.4\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"10.4\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M8.5 14c1 1.4 2.2 2.1 3.5 2.1s2.5-.7 3.5-2.1\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7\" cy=\"12.8\" r=\"1.1\" fill=\"#E89A8A\" stroke=\"none\"/><circle cx=\"17\" cy=\"12.8\" r=\"1.1\" fill=\"#E89A8A\" stroke=\"none\"/><ellipse cx=\"8.4\" cy=\"7.4\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 7.4)\"/>"
      },
      {
        "id": "mdr",
        "label": "Mort de rire",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7.3 9.6 10 10.6M16.7 9.6 14 10.6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8 13.2h8c-.5 2.7-2 4.3-4 4.3s-3.5-1.6-4-4.3z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.9 15.9c1.9 1.1 4.3 1.1 6.2 0-.8 1-1.9 1.6-3.1 1.6s-2.3-.6-3.1-1.6z\" fill=\"#B3382E\"/><path d=\"M4.6 12.8c-.9 1-1 2-.3 3M19.4 12.8c.9 1 1 2 .3 3\" stroke=\"#3D6BB3\" stroke-width=\"1.3\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"8.4\" cy=\"6.8\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 6.8)\"/>"
      },
      {
        "id": "clin",
        "label": "Clin d’œil",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"10.4\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M13.4 10.2h3.2\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 14.4c1.1 1.2 2.2 1.8 3.6 1.8\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16.6\" cy=\"13\" r=\"1.1\" fill=\"#E89A8A\" stroke=\"none\"/><ellipse cx=\"8.4\" cy=\"7.4\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 7.4)\"/>"
      },
      {
        "id": "choque",
        "label": "Choqué",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"9.6\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"9.6\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M7.2 7.4l3-.8M16.8 7.4l-3-.8\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"14.8\" rx=\"1.8\" ry=\"2.4\" fill=\"#24201A\"/><ellipse cx=\"8.4\" cy=\"6.6\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 6.6)\"/>"
      },
      {
        "id": "dodo",
        "label": "Endormi",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7.4 10.8c.9.9 2 .9 2.9 0M13.7 10.8c.9.9 2 .9 2.9 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"11.6\" cy=\"15.4\" rx=\"1.1\" ry=\"1.4\" fill=\"#24201A\" opacity=\".75\"/><path d=\"M15.6 3.6h2.6l-2.6 2.8h2.6\" stroke=\"#B8862F\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M19.6 1.6h1.8l-1.8 2h1.8\" stroke=\"#D9A441\" stroke-width=\"1.2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"8.4\" cy=\"7.4\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 7.4)\"/>"
      },
      {
        "id": "malin",
        "label": "Malicieux",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.9 8.6 10 9.9M17.1 8.6 14 9.9\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.4\" cy=\"11.2\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.6\" cy=\"11.2\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M8.3 14.2c2.1 1.9 5.3 1.9 7.4 0l-1 2.2c-1.7 1-3.7 1-5.4 0z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.4\" cy=\"6.8\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 6.8)\"/>"
      },
      {
        "id": "robot",
        "label": "Robot",
        "svg": "<rect x=\"5\" y=\"7\" width=\"14\" height=\"12\" rx=\"3\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15 7h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1.8c1.2-.8 1.8-1.8 1.8-3.2z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M12 7V4\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"3.2\" r=\"1.2\" fill=\"#D9A441\" stroke=\"none\"/><rect x=\"7.8\" y=\"10.4\" width=\"2.8\" height=\"2.8\" rx=\".6\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"13.4\" y=\"10.4\" width=\"2.8\" height=\"2.8\" rx=\".6\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 16.2h6\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"7.6\" cy=\"8.8\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 7.6 8.8)\"/>"
      },
      {
        "id": "cool",
        "label": "Cool",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.2 9.6h5v2.1a2.5 2.5 0 0 1-5 0V9.6zM12.8 9.6h5v2.1a2.5 2.5 0 0 1-5 0V9.6z\" fill=\"#24201A\"/><path d=\"M11.2 10.1h1.6M4.2 9.9l2-.3M19.8 9.9l-2-.3\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.4 15.4c.9.8 1.7 1.2 2.6 1.2.9 0 1.7-.4 2.6-1.2\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7.9\" cy=\"10.5\" r=\"0.7\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"14.5\" cy=\"10.5\" r=\"0.7\" fill=\"#FFFFFF\" stroke=\"none\"/>"
      },
      {
        "id": "furieux",
        "label": "Furieux",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#D96A55\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M17.4 5.5A8.5 8.5 0 0 1 12 20.5c-1.6 0-3.1-.45-4.4-1.2 5.5-.4 9.4-4.1 9.8-13.8z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.9 8.2 10 9.8M17.1 8.2 14 9.8\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.4\" cy=\"11.4\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.6\" cy=\"11.4\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M8.8 16.4c1-1.1 2.1-1.6 3.2-1.6s2.2.5 3.2 1.6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.2 4.6 6 6.2M6.4 3.2l1 2.1\" stroke=\"#8F2C24\" stroke-width=\"1.2\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "nausee",
        "label": "Patraque",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#B9C98A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M17.4 5.5A8.5 8.5 0 0 1 12 20.5c-1.6 0-3.1-.45-4.4-1.2 5.5-.4 9.4-4.1 9.8-13.8z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M7.4 10c.8-.9 2-.9 2.8 0M13.8 10c.8-.9 2-.9 2.8 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.8 16.2c1.4-1.3 4.6-1.1 6.2.7\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M17.6 13.6c0 1 .8 1.5.8 2.5a1 1 0 0 1-2 0c0-1 .8-1.5 1.2-2.5z\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "ange",
        "label": "Angelot",
        "svg": "<ellipse cx=\"12\" cy=\"3.6\" rx=\"4.6\" ry=\"1.5\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\"1.5\"/><circle cx=\"12\" cy=\"13\" r=\"7.6\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.6\" cy=\"12\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.4\" cy=\"12\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M9.6 15.4c.8.8 1.6 1.2 2.4 1.2s1.6-.4 2.4-1.2\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7.6\" cy=\"14\" r=\"1\" fill=\"#E89A8A\" stroke=\"none\"/><circle cx=\"16.4\" cy=\"14\" r=\"1\" fill=\"#E89A8A\" stroke=\"none\"/><ellipse cx=\"8.8\" cy=\"9.4\" rx=\"1.5\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 9.4)\"/>"
      },
      {
        "id": "diablotin",
        "label": "Diablotin",
        "svg": "<path d=\"M5.6 7.8C4.2 6.8 3.6 5.4 3.8 3.6c1.7.5 2.8 1.5 3.3 3z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M18.4 7.8c1.4-1 2-2.4 1.8-4.2-1.7.5-2.8 1.5-3.3 3z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"13\" r=\"7.6\" fill=\"#D96A55\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.8 7.1a7.6 7.6 0 0 1-4.8 13.5c-1.4 0-2.7-.4-3.9-1 4.9-.4 8.4-3.7 8.7-12.5z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M7.6 11.4l2.6 1M16.4 11.4l-2.6 1\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 16.2c2 1.4 4 1.4 6 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "poker",
        "label": "Poker face",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"10.6\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"10.6\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M9 15.4h6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.6 7.2C6.4 4.8 9 3.5 12 3.5s5.6 1.3 7.4 3.7l-2.2.5-1.8-.9-1.6.9-1.8-.9-1.8.9-1.6-.9-1.8.9z\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.4\" cy=\"9.2\" rx=\"1.5\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 9.2)\"/>"
      },
      {
        "id": "moustache",
        "label": "Moustachu",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"10\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"10\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 13.2c-1 1.6-2.8 1.9-4.2 1 .9 2 2.8 2.5 4.2 1.3 1.4 1.2 3.3.7 4.2-1.3-1.4.9-3.2.6-4.2-1z\" fill=\"#66421F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.6 17.6h2.8\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.4\" cy=\"7.4\" rx=\"1.7\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 7.4)\"/>"
      },
      {
        "id": "barbu",
        "label": "Barbu",
        "svg": "<circle cx=\"12\" cy=\"11\" r=\"7.6\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.9 9.8c-.4 6 2.3 11 7.1 11s7.5-5 7.1-11l-1.8 1.6c.3 1.2-.1 2.2-1 2.9.2 1.1-.3 2-1.3 2.4 0 1.1-.7 1.8-1.7 1.9-.4.6-.8.9-1.3.9s-.9-.3-1.3-.9c-1-.1-1.7-.8-1.7-1.9-1-.4-1.5-1.3-1.3-2.4-.9-.7-1.3-1.7-1-2.9z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.5\" cy=\"9.6\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.5\" cy=\"9.6\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 12.6c-.9 1.2-2.3 1.5-3.4.9.7 1.5 2.2 1.9 3.4 1 1.2.9 2.7.5 3.4-1-1.1.6-2.5.3-3.4-.9z\" fill=\"#66421F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"15.4\" rx=\"1.1\" ry=\".7\" fill=\"#B3382E\" opacity=\".8\"/><ellipse cx=\"8.8\" cy=\"7.2\" rx=\"1.5\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 7.2)\"/>"
      },
      {
        "id": "nerd",
        "label": "Stratège",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"#EFC9A0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"11\" r=\"2.5\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15\" cy=\"11\" r=\"2.5\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11.5 11h1M3.8 10.4l2.7.2M20.2 10.4l-2.7.2\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"11\" r=\"0.7\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"11\" r=\"0.7\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M9.8 15.8h4.4\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.2\" cy=\"6.8\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.2 6.8)\"/>"
      }
    ]
  },
  {
    "id": "fetard",
    "unlockLevel": 4,
    "icons": [
      {
        "id": "disco",
        "label": "Boule disco",
        "svg": "<path d=\"M12 1.6v2.6\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"7.6\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.8 6.1a7.6 7.6 0 0 1-9.6 11.8A7.6 7.6 0 0 0 16.8 6z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M12 4.4v15.2M4.4 12h15.2M6.4 7.2c3.4 1.5 7.8 1.5 11.2 0M6.4 16.8c3.4-1.5 7.8-1.5 11.2 0\" stroke=\"#FFFFFF\" stroke-width=\"1\" opacity=\".75\"/><circle cx=\"8.6\" cy=\"9.4\" r=\"0.7\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"14.8\" cy=\"14\" r=\"0.7\" fill=\"#D9A441\" stroke=\"none\"/><ellipse cx=\"8.8\" cy=\"7.6\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 7.6)\"/>"
      },
      {
        "id": "popper",
        "label": "Cotillons",
        "svg": "<path d=\"M4 20 8.6 8.8l6.6 6.6L4 20z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11.9 12.1l3.3 3.3L4 20z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.6 13.6l3.8 3.8\" stroke=\"#D9A441\" stroke-width=\"1.2\"/><circle cx=\"15.6\" cy=\"5\" r=\"1\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"19.6\" cy=\"8.6\" r=\"1\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"13.6\" cy=\"9.8\" r=\"0.9\" fill=\"#3E8E5F\" stroke=\"none\"/><path d=\"M17.4 12.4l2.2-.7M12.2 6.6l.7-2.4M18 3l1.6 1.2\" stroke=\"#7A5A9E\" stroke-width=\"1.2\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "masque",
        "label": "Masque",
        "svg": "<path d=\"M4 8.4c2.3-1.3 5-2 8-2s5.7.7 8 2c0 5.9-3.2 9.6-8 9.6S4 14.3 4 8.4z\" fill=\"#7A5A9E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.8 6.7c1.9.25 3.7.85 5.2 1.7 0 5.9-3.2 9.6-8 9.6-.7 0-1.4-.1-2-.25 4.1-1 6.4-4.6 4.8-11.05z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M7.8 11c.8-.8 2-.8 2.8 0M13.4 11c.8-.8 2-.8 2.8 0\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.4 8.2C6.6 7 9.2 6.4 12 6.4s5.4.6 7.6 1.8\" stroke=\"#D9A441\" stroke-width=\"1.2\" fill=\"none\"/><ellipse cx=\"7.6\" cy=\"9\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 7.6 9)\"/>"
      },
      {
        "id": "joker",
        "label": "Joker",
        "svg": "<rect x=\"6\" y=\"3\" width=\"12\" height=\"18\" rx=\"2\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 7.6 13.1 10.4l3 .3-2.3 2 .7 3-2.5-1.5-2.5 1.5.7-3-2.3-2 3-.3z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7.4 4.6l1.4 1.2M16.6 19.4l-1.4-1.2\" stroke=\"#3D6BB3\" stroke-width=\"1.1\" stroke-linecap=\"round\"/><path d=\"M16 3h.4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H16c.8-.6 1.2-1.3 1.2-2.2V5.2c0-.9-.4-1.6-1.2-2.2z\" fill=\"#24201A\" opacity=\".14\"/>"
      },
      {
        "id": "de",
        "label": "Dé",
        "svg": "<rect x=\"4.5\" y=\"4.5\" width=\"15\" height=\"15\" rx=\"3\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16 4.5h.5a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H16c1.2-.8 1.8-1.9 1.8-3.3V7.8c0-1.4-.6-2.5-1.8-3.3z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9\" cy=\"9\" r=\"1.2\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"15\" cy=\"9\" r=\"1.2\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"9\" cy=\"15\" r=\"1.2\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"15\" cy=\"15\" r=\"1.2\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\" fill=\"#B3382E\" stroke=\"none\"/><ellipse cx=\"7.4\" cy=\"6.6\" rx=\"1.5\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 7.4 6.6)\"/>"
      },
      {
        "id": "cible",
        "label": "Cible",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"5.3\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 12 18.5 5.5M18.5 5.5l.4-2.2M18.5 5.5l2.2-.4\" stroke=\"#B8862F\" stroke-width=\"1.3\" stroke-linecap=\"round\"/><ellipse cx=\"8.6\" cy=\"8.2\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 8.2)\"/>"
      },
      {
        "id": "micro",
        "label": "Micro",
        "svg": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"10\" rx=\"3\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.4 5.4h5.2M9.4 7.6h5.2M9.4 9.8h5.2\" stroke=\"#9AA3AD\" stroke-width=\".9\"/><path d=\"M6 11a6 6 0 0 0 12 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 17v3.4M9 20.4h6\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10.4\" cy=\"4.6\" rx=\"1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 10.4 4.6)\"/>"
      },
      {
        "id": "note",
        "label": "Note",
        "svg": "<path d=\"M9.5 17.5V5.4l9-1.9v12\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.5 8.4l9-1.9\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"7.2\" cy=\"17.8\" rx=\"2.4\" ry=\"1.9\" transform=\"rotate(-18 7.2 17.8)\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"16.2\" cy=\"15.8\" rx=\"2.4\" ry=\"1.9\" transform=\"rotate(-18 16.2 15.8)\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"6.4\" cy=\"17.2\" rx=\"0.9\" ry=\"0.5\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-18 6.4 17.2)\"/><ellipse cx=\"15.4\" cy=\"15.2\" rx=\"0.9\" ry=\"0.5\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-18 15.4 15.2)\"/>"
      },
      {
        "id": "artifice",
        "label": "Feu d’artifice",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"1.7\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M12 3.2v4M12 16.8v4M3.2 12h4M16.8 12h4\" stroke=\"#B3382E\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><path d=\"M5.8 5.8l2.8 2.8M15.4 15.4l2.8 2.8M18.2 5.8l-2.8 2.8M8.6 15.4l-2.8 2.8\" stroke=\"#D9A441\" stroke-width=\"1.5\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"5.6\" r=\"0.7\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"12\" cy=\"18.4\" r=\"0.7\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"5.6\" cy=\"12\" r=\"0.7\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"18.4\" cy=\"12\" r=\"0.7\" fill=\"#3D6BB3\" stroke=\"none\"/>"
      },
      {
        "id": "vinyle",
        "label": "Platine",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8\" fill=\"#3A342C\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 6.2a5.8 5.8 0 0 1 5.8 5.8M12 8.6a3.4 3.4 0 0 1 3.4 3.4\" stroke=\"#9AA3AD\" stroke-width=\".8\" fill=\"none\" opacity=\".7\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"0.7\" fill=\"#F3EAD3\" stroke=\"none\"/><ellipse cx=\"8.2\" cy=\"7.8\" rx=\"2\" ry=\"1\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.2 7.8)\"/>"
      },
      {
        "id": "chapeau",
        "label": "Chapeau pointu",
        "svg": "<path d=\"M12 3.2 18 19H6L12 3.2z\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.4 7 18 19h-3.4z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M8.8 11.6c2 1.2 4.4 1.2 6.4 0M7.3 15.6c3 1.5 6.4 1.5 9.4 0\" stroke=\"#D9A441\" stroke-width=\"1.3\" fill=\"none\"/><circle cx=\"12\" cy=\"3\" r=\"1.4\" fill=\"#D9A441\" stroke=\"none\"/><ellipse cx=\"10.4\" cy=\"8\" rx=\"1\" ry=\"2\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(14 10.4 8)\"/>"
      },
      {
        "id": "lunettes",
        "label": "Lunettes",
        "svg": "<circle cx=\"7.5\" cy=\"13\" r=\"3.6\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16.5\" cy=\"13\" r=\"3.6\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11.1 12.4c.6-.5 1.2-.5 1.8 0M3.9 12 2.2 10.4M20.1 12l1.7-1.6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.8 11.4l3.2 3.2M7.6 10.8l2.2 2.2\" stroke=\"#FFFFFF\" stroke-width=\"1\" opacity=\".7\"/><ellipse cx=\"15.2\" cy=\"11.6\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 15.2 11.6)\"/>"
      }
    ]
  },
  {
    "id": "bestiaire",
    "unlockLevel": 8,
    "icons": [
      {
        "id": "renard",
        "label": "Renard",
        "svg": "<path d=\"M4.6 4 8.4 7.6h7.2L19.4 4l.7 6.4c.3 2.7-.9 5.2-3.2 6.9L12 20l-4.9-2.7c-2.3-1.7-3.5-4.2-3.2-6.9z\" fill=\"#D07A3A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.9 5.3 8.4 7.6l-1.9.9z\" fill=\"#66421F\"/><path d=\"M18.1 5.3 15.6 7.6l1.9.9z\" fill=\"#66421F\"/><path d=\"M12 19.6c1.7-1 3-2.3 3.9-4l-3.9 1-3.9-1c.9 1.7 2.2 3 3.9 4z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.4\" cy=\"10.8\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.6\" cy=\"10.8\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"12\" cy=\"15\" r=\"1\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M19.4 4l.7 6.4c.3 2.7-.9 5.2-3.2 6.9L14.6 18c1.9-2 2.9-4.5 2.9-7.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.6\" cy=\"8.8\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 8.8)\"/>"
      },
      {
        "id": "loup",
        "label": "Loup",
        "svg": "<path d=\"M5.2 3.6 8.8 7.4h6.4l3.6-3.8.8 6.6c.3 2.7-.8 5.2-3 6.9L12 20.4l-4.6-3.3c-2.2-1.7-3.3-4.2-3-6.9z\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.4 5 8.8 7.4l-1.9.8z\" fill=\"#24201A\" opacity=\".55\"/><path d=\"M17.6 5 15.2 7.4l1.9.8z\" fill=\"#24201A\" opacity=\".55\"/><path d=\"M12 20c1.5-1 2.7-2.2 3.4-3.8L12 17.4l-3.4-1.2c.7 1.6 1.9 2.8 3.4 3.8z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7.6 10.4l2.6 1M16.4 10.4l-2.6 1\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"15.2\" r=\"1.05\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M18.8 3.6l.8 6.6c.3 2.7-.8 5.2-3 6.9l-1.9 1.4c1.8-2 2.8-4.5 2.8-7.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.8\" cy=\"8.6\" rx=\"1.3\" ry=\"0.75\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 8.6)\"/>"
      },
      {
        "id": "hibou",
        "label": "Hibou",
        "svg": "<path d=\"M6.2 4.6 8.6 7M17.8 4.6 15.4 7\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"13\" r=\"7.6\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.9 7.3a7.6 7.6 0 0 1-9.8 11.4A7.6 7.6 0 0 0 16.9 7.3z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9\" cy=\"11.4\" r=\"2.9\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15\" cy=\"11.4\" r=\"2.9\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9\" cy=\"11.4\" r=\"1\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15\" cy=\"11.4\" r=\"1\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 13.4l-1.2 1.9h2.4z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 17.4c.9.9 1.9 1.3 3 1.3s2.1-.4 3-1.3\" stroke=\"#66421F\" stroke-width=\"1\" fill=\"none\"/>"
      },
      {
        "id": "requin",
        "label": "Requin",
        "svg": "<path d=\"M18.2 11.2 21.5 7.5c.7 1.7.6 3.2-.4 4.5 1.5.5 2.4 1.5 2.6 3-2 .3-3.6-.3-4.8-1.7z\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.4 7.7 11.5 3.1c1.9.9 2.8 2.6 2.6 4.9z\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M2.4 11.9C4.6 8.5 8.3 6.7 12.7 6.7c3.1 0 5.6 1 7.3 2.9l-1 2.3 1 2.3c-1.7 1.9-4.2 2.9-7.3 2.9-4.4 0-8.1-1.8-10.3-5.2z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M3.6 13.3c2.5 1.9 5.5 2.9 9.1 2.9 2.2 0 4.1-.5 5.7-1.4l-.5-1.1c-1.5.8-3.2 1.2-5.2 1.2-3.4 0-6.4-.9-9.1-2.6z\" fill=\"#FFFFFF\" opacity=\".9\"/><path d=\"M3.8 12.9c1 1 2.3 1.7 3.9 2.1\" stroke=\"#24201A\" stroke-width=\"1\" fill=\"none\"/><path d=\"M4.5 13.4l.6.9.6-.7.7.9.6-.7.7.8\" stroke=\"#FFFFFF\" stroke-width=\"1\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"5.9\" cy=\"10.3\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M13.9 8.9c.5 1 .5 2.1 0 3.1M15.8 9.2c.4.8.4 1.7 0 2.5\" stroke=\"#5F6B76\" stroke-width=\"1\" fill=\"none\"/><path d=\"M10.4 14.9 9 17.8c1.6.3 2.9-.2 3.8-1.5z\" fill=\"#5F6B76\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12.7 6.7c3.1 0 5.6 1 7.3 2.9l-1 2.3 1 2.3c-1.7 1.9-4.2 2.9-7.3 2.9 3.4-1.6 5.1-3.3 5.1-5.2s-1.7-3.7-5.1-5.2z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"7.6\" cy=\"8.9\" rx=\"1.8\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 7.6 8.9)\"/>"
      },
      {
        "id": "lion",
        "label": "Lion",
        "svg": "<path d=\"M12 2.8l1.5 2.3 2.5-1.1.3 2.7 2.7-.3-1.1 2.5 2.3 1.5-2.3 1.5 1.1 2.5-2.7-.3-.3 2.7-2.5-1.1L12 18l-1.5-2.3-2.5 1.1-.3-2.7-2.7.3 1.1-2.5-2.3-1.5 2.3-1.5-1.1-2.5 2.7.3.3-2.7 2.5 1.1z\" fill=\"#B8862F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"10.4\" r=\"4.9\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"10.2\" cy=\"9.2\" r=\"0.75\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13.8\" cy=\"9.2\" r=\"0.75\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 11.2l-.9 1.1h1.8z\" fill=\"#66421F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 12.3v1.1M12 13.4c-.5.6-1.1.9-1.8.8M12 13.4c.5.6 1.1.9 1.8.8\" stroke=\"#24201A\" stroke-width=\".9\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M9.5 18.2c.7 1.2 1.5 1.9 2.5 2 1 -.1 1.8-.8 2.5-2\" stroke=\"#B8862F\" stroke-width=\"1.2\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"9.8\" cy=\"7.6\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9.8 7.6)\"/>"
      },
      {
        "id": "poulpe",
        "label": "Poulpe",
        "svg": "<path d=\"M5.8 11a6.2 6.2 0 0 1 12.4 0v2.2H5.8V11z\" fill=\"#7A5A9E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.2 5.3A6.2 6.2 0 0 1 18.2 11v2.2h-2.6V11c0-2.4-.5-4.3-1.4-5.7z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.4 13.2c-.4 2.4-1.4 3.5-3 4.2M10 13.6c0 2.5-.7 4.4-2 5.9M14 13.6c0 2.5.7 4.4 2 5.9M17.6 13.2c.4 2.4 1.4 3.5 3 4.2\" stroke=\"#7A5A9E\" stroke-width=\"2.6\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M6.4 13.2c-.4 2.4-1.4 3.5-3 4.2M10 13.6c0 2.5-.7 4.4-2 5.9M14 13.6c0 2.5.7 4.4 2 5.9M17.6 13.2c.4 2.4 1.4 3.5 3 4.2\" stroke=\"#24201A\" stroke-width=\".8\" fill=\"none\" stroke-linecap=\"round\" opacity=\".5\"/><circle cx=\"9.8\" cy=\"9.6\" r=\"1.3\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"14.2\" cy=\"9.6\" r=\"1.3\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.8\" cy=\"9.6\" r=\"0.6\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.2\" cy=\"9.6\" r=\"0.6\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"9\" cy=\"6.6\" rx=\"1.5\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 6.6)\"/>"
      },
      {
        "id": "corbeau",
        "label": "Corbeau",
        "svg": "<path d=\"M14.6 4.4c3.8 0 6.4 2.7 6.4 6.4 0 4.7-3.3 7.9-8.2 7.9H6.6l2.3-3.3c-1.5-1.3-2.3-3-2.3-5C6.6 6.9 10 4.4 14.6 4.4z\" fill=\"#33393F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.2 8.2 2.4 9.9l5.9 1.6z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"13\" cy=\"8.8\" r=\"1.4\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"13\" cy=\"8.8\" r=\"0.65\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M15.8 14.8c1.6-.6 2.7-1.7 3.3-3.3\" stroke=\"#3D6BB3\" stroke-width=\"1\" fill=\"none\" opacity=\".7\"/><path d=\"M18 6.2c1.9 1.2 3 3.2 3 5.6 0 4.1-3.3 6.9-8.2 6.9h-1.4c4.8-.6 7.6-3.3 7.6-7.4 0-1.9-.35-3.6-1-5.1z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"11.4\" cy=\"6.6\" rx=\"1.4\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 11.4 6.6)\"/>"
      },
      {
        "id": "cerf",
        "label": "Cerf",
        "svg": "<path d=\"M8.6 8.2C7 6.6 6.4 4.6 6.6 2.2M7.5 5.2 5 4.4M8.1 7 5.9 6.8M15.4 8.2c1.6-1.6 2.2-3.6 2-6M16.5 5.2l2.5-.8M15.9 7l2.2-.2\" stroke=\"#66421F\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M6.9 9.9C5.6 9.5 4.9 8.7 4.7 7.5c1.4 0 2.4.5 3 1.5zM17.1 9.9c1.3-.4 2-1.2 2.2-2.4-1.4 0-2.4.5-3 1.5z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 7.8c2.7 0 4.4 2.4 4.4 5.3 0 3.5-1.9 6.3-4.4 6.3s-4.4-2.8-4.4-6.3c0-2.9 1.7-5.3 4.4-5.3z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 15.4c1 0 1.8.6 1.8 1.6 0 1.2-.8 2-1.8 2s-1.8-.8-1.8-2c0-1 .8-1.6 1.8-1.6z\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"10.2\" cy=\"12\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13.8\" cy=\"12\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"12\" cy=\"16.6\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"10.2\" cy=\"9.6\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 10.2 9.6)\"/>"
      },
      {
        "id": "chat",
        "label": "Chat",
        "svg": "<path d=\"M5.4 4.6 8.2 7.8h7.6l2.8-3.2v6c0 4.6-2.9 7.8-6.6 7.8S5.4 15.2 5.4 10.6v-6z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.6 6 8.2 7.8 6.6 8.6z\" fill=\"#E8A5B2\"/><path d=\"M17.4 6 15.8 7.8l1.6.8z\" fill=\"#E8A5B2\"/><circle cx=\"9.6\" cy=\"11.2\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.4\" cy=\"11.2\" r=\"0.8\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 13.2l-.8 1h1.6z\" fill=\"#E8A5B2\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M2.6 12.2h3.2M3 14.6l2.9-.9M21.4 12.2h-3.2M21 14.6l-2.9-.9\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linecap=\"round\" opacity=\".7\"/><path d=\"M18.6 4.6v6c0 4.6-2.9 7.8-6.6 7.8-.5 0-1-.06-1.5-.18 3.2-.8 5.4-3.7 5.4-7.9V6.6z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"9\" cy=\"9\" rx=\"1.3\" ry=\"0.75\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 9)\"/>"
      },
      {
        "id": "ours",
        "label": "Ours",
        "svg": "<circle cx=\"7\" cy=\"6.4\" r=\"2.3\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"17\" cy=\"6.4\" r=\"2.3\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7\" cy=\"6.4\" r=\"1\" fill=\"#C89A6B\" stroke=\"none\"/><circle cx=\"17\" cy=\"6.4\" r=\"1\" fill=\"#C89A6B\" stroke=\"none\"/><circle cx=\"12\" cy=\"13\" r=\"7.2\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.6 7.5a7.2 7.2 0 0 1-9.2 11A7.2 7.2 0 0 0 16.6 7.5z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9.6\" cy=\"11.2\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.4\" cy=\"11.2\" r=\"0.85\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"12\" cy=\"15\" rx=\"2.6\" ry=\"2\" fill=\"#C89A6B\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"14.3\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 15.2v1M11 16.6c.7.4 1.3.4 2 0\" stroke=\"#24201A\" stroke-width=\".9\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"9\" cy=\"9.2\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 9.2)\"/>"
      },
      {
        "id": "taureau",
        "label": "Taureau",
        "svg": "<path d=\"M4.2 4.6c-.2 2.9 1.2 4.7 4 5.2M19.8 4.6c.2 2.9-1.2 4.7-4 5.2\" stroke=\"#F3EAD3\" stroke-width=\"2.8\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M4.2 4.6c-.2 2.9 1.2 4.7 4 5.2M19.8 4.6c.2 2.9-1.2 4.7-4 5.2\" stroke=\"#24201A\" stroke-width=\".8\" fill=\"none\" stroke-linecap=\"round\" opacity=\".5\"/><path d=\"M8 8.8h8l1.2 4.6L12 19.8l-5.2-6.4z\" fill=\"#5C4530\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16 8.8l1.2 4.6-5.2 6.4-1.2-1.5 4.2-5.2z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"10.2\" cy=\"11.6\" r=\"0.85\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"13.8\" cy=\"11.6\" r=\"0.85\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"10.2\" cy=\"11.6\" r=\"0.5\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13.8\" cy=\"11.6\" r=\"0.5\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"12\" cy=\"16.2\" r=\"1.3\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\"1.2\"/><circle cx=\"10.9\" cy=\"14.6\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13.1\" cy=\"14.6\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"9.6\" cy=\"10\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9.6 10)\"/>"
      },
      {
        "id": "aigle",
        "label": "Aigle",
        "svg": "<path d=\"M12 3.6c4.5 0 7.6 3 7.6 7.2 0 3-1.5 5.4-4 6.6L12 20.6l-3.6-3.2c-2.5-1.2-4-3.6-4-6.6 0-4.2 3.1-7.2 7.6-7.2z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 3.6c4.5 0 7.6 3 7.6 7.2 0 3-1.5 5.4-4 6.6L12 20.6V3.6z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.4 8.5 10.3 7.5M17.6 8.5 13.7 7.5\" stroke=\"#24201A\" stroke-width=\"1.4\" stroke-linecap=\"round\"/><circle cx=\"8.9\" cy=\"10\" r=\"1.4\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15.1\" cy=\"10\" r=\"1.4\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"8.9\" cy=\"10\" r=\"0.6\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15.1\" cy=\"10\" r=\"0.6\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 9.6c1.7 0 2.9.9 3.2 2.3-.4 2.4-1.5 4.1-3.2 5.1-1.7-1-2.8-2.7-3.2-5.1.3-1.4 1.5-2.3 3.2-2.3z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 9.6c1.7 0 2.9.9 3.2 2.3-.4 2.4-1.5 4.1-3.2 5.1V9.6z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"11\" cy=\"11.4\" r=\"0.4\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13\" cy=\"11.4\" r=\"0.4\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"8.6\" cy=\"6.4\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 6.4)\"/>"
      },
      {
        "id": "phalene",
        "label": "Phalène",
        "svg": "<path d=\"M12 6.6C10 3.4 6.6 2.4 3.6 3.8c0 3.9 2.4 6.4 5.4 6.4L12 8.8z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 6.6c2-3.2 5.4-4.2 8.4-2.8 0 3.9-2.4 6.4-5.4 6.4L12 8.8z\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7.4\" cy=\"6.4\" r=\"1.5\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16.6\" cy=\"6.4\" r=\"1.5\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 9.8c-1.6 0-4.2 1.3-4.2 4 2.1 0 3.5-.8 4.2-2.1.7 1.3 2.1 2.1 4.2 2.1 0-2.7-2.6-4-4.2-4z\" fill=\"#C89A6B\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"10.6\" rx=\"1\" ry=\"3.4\" fill=\"#66421F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11 4.6 9.4 2.4M13 4.6l1.6-2.2\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linecap=\"round\"/><circle cx=\"9.4\" cy=\"2.4\" r=\"0.5\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.6\" cy=\"2.4\" r=\"0.5\" fill=\"#24201A\" stroke=\"none\"/>"
      },
      {
        "id": "bouc",
        "label": "Bouc",
        "svg": "<path d=\"M9.2 6.7C6.6 6.5 4.7 5.1 3.8 2.5c2.9-.1 5 1.2 6.2 3.6z\" fill=\"#C9B08A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.8 6.7c2.6-.2 4.5-1.6 5.4-4.2-2.9-.1-5 1.2-6.2 3.6z\" fill=\"#C9B08A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.1 4.9c.9-.3 1.7-.4 2.5-.1M17.9 4.9c-.9-.3-1.7-.4-2.5-.1\" stroke=\"#66421F\" stroke-width=\".8\" fill=\"none\" opacity=\".7\"/><ellipse cx=\"6.3\" cy=\"9.9\" rx=\"2.3\" ry=\"1.2\" transform=\"rotate(-24 6.3 9.9)\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"17.7\" cy=\"9.9\" rx=\"2.3\" ry=\"1.2\" transform=\"rotate(24 17.7 9.9)\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 6.2c2.7 0 4.5 1.8 4.7 4.5l.2 2.6c.2 2.7-1.3 4.8-3.6 5.4l-1.3.3-1.3-.3c-2.3-.6-3.8-2.7-3.6-5.4l.2-2.6C7.5 8 9.3 6.2 12 6.2z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.7 10.7l.2 2.6c.2 2.7-1.3 4.8-3.6 5.4l-1.3.3v-1c2.4-.7 3.7-2.6 3.5-5.2l-.2-2.4c-.1-1.7-.9-3-2.1-3.8 2.1.4 3.4 2 3.5 4.1z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9.7\" cy=\"11\" r=\"1.5\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"14.3\" cy=\"11\" r=\"1.5\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"8.9\" y=\"10.6\" width=\"1.6\" height=\".9\" rx=\".3\" fill=\"#24201A\"/><rect x=\"13.5\" y=\"10.6\" width=\"1.6\" height=\".9\" rx=\".3\" fill=\"#24201A\"/><circle cx=\"10.9\" cy=\"15.4\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"13.1\" cy=\"15.4\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M11 17c.6.4 1.4.4 2 0\" stroke=\"#24201A\" stroke-width=\".9\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M10.5 18.6h3c-.2 2-.7 3.4-1.5 4.2-.8-.8-1.3-2.2-1.5-4.2z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"9.8\" cy=\"8.2\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9.8 8.2)\"/>"
      },
      {
        "id": "alien",
        "label": "Petit alien",
        "svg": "<path d=\"M9.4 4.8C8.7 3.7 8.8 2.6 9.6 1.8M14.6 4.8c.7-1.1.6-2.2-.2-3\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.4\" cy=\"1.7\" r=\".95\" fill=\"#5F86D9\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"14.6\" cy=\"1.7\" r=\".95\" fill=\"#5F86D9\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 4.4c4 0 6.7 2.9 6.7 7.1 0 4.6-2.6 8.3-6.7 8.3s-6.7-3.7-6.7-8.3c0-4.2 2.7-7.1 6.7-7.1z\" fill=\"#5F86D9\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14 4.8c2.7 1 4.5 3.5 4.5 6.7 0 4.6-2.6 8.3-6.7 8.3-.5 0-.9 0-1.4-.1 3.4-1 5.6-4.2 5.6-8 0-2.9-.7-5.2-2-6.9z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"12\" cy=\"16.9\" rx=\"2.6\" ry=\"1.8\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"9.6\" cy=\"9.6\" rx=\"1.35\" ry=\"1.75\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"14.4\" cy=\"9.6\" rx=\"1.35\" ry=\"1.75\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"9.2\" cy=\"9\" r=\".45\" fill=\"#FFFFFF\" stroke=\"none\"/><circle cx=\"14\" cy=\"9\" r=\".45\" fill=\"#FFFFFF\" stroke=\"none\"/><path d=\"M10.3 12.4c1.1.8 2.3.8 3.4 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linecap=\"round\"/><path d=\"M11.2 13h.8l-.4.9z\" fill=\"#FFFFFF\" stroke=\"none\"/><ellipse cx=\"8.7\" cy=\"7\" rx=\"1.5\" ry=\"0.85\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-32 8.7 7)\"/>"
      },
      {
        "id": "flamant",
        "label": "Flamant rose",
        "svg": "<path d=\"M6.6 9.6C5.2 9.4 4.2 8.6 3.6 7.2c1.6-.2 2.9.4 3.8 1.6z\" fill=\"#D96A92\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.2 15.9v5M8.6 20.9h3.4M12.9 15.6l1.2 2.1-1.4 1.9\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10.6\" cy=\"12.4\" rx=\"5\" ry=\"3.7\" fill=\"#F08CAD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.6 8.7a5 3.7 0 0 1 0 7.4z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M8 12.2c1.7-1 3.6-1 5.3 0\" fill=\"none\" stroke=\"#C2557E\" stroke-width=\"1.1\" stroke-linecap=\"round\"/><path d=\"M12.6 9.9c1.9-.6 2.9-1.9 2.7-4l1.9-.2c.3 2.8-1.2 4.7-4 5.6z\" fill=\"#F08CAD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16\" cy=\"4.7\" r=\"1.9\" fill=\"#F08CAD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M17.5 4.3c1.7 0 2.9.9 3.4 2.5.2.6-.1 1.1-.7 1.2-1.6.2-2.8-.4-3.4-1.8-.3-.8.1-1.8.7-1.9z\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M20.9 6.8c.2.6-.1 1.1-.7 1.2-.6.1-1.1 0-1.6-.2l.7-1.7z\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"15.6\" cy=\"4.2\" r=\".4\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"7.9\" cy=\"10.6\" rx=\"1.5\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-28 7.9 10.6)\"/>"
      }
    ]
  },
  {
    "id": "nuit",
    "unlockLevel": 14,
    "icons": [
      {
        "id": "lune",
        "label": "Lune",
        "svg": "<path d=\"M19 14.6A8 8 0 1 1 9.4 5 6.6 6.6 0 0 0 19 14.6z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M19 14.6A8 8 0 0 1 7 19.5c4.9-.4 8.4-3 10.4-7.6z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"9.4\" cy=\"10.4\" r=\"1\" fill=\"#B8862F\" stroke=\"none\"/><circle cx=\"12.4\" cy=\"14.4\" r=\"0.7\" fill=\"#B8862F\" stroke=\"none\"/><ellipse cx=\"8.4\" cy=\"7.6\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 7.6)\"/>"
      },
      {
        "id": "etoile",
        "label": "Étoile",
        "svg": "<path d=\"M12 2.8l2.1 6.3 6.6.3-5.2 4.1 1.9 6.4L12 16.1l-5.4 3.8 1.9-6.4-5.2-4.1 6.6-.3z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 2.8l2.1 6.3 6.6.3-5.2 4.1 1.9 6.4L12 16.1V2.8z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"9.6\" cy=\"7.8\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9.6 7.8)\"/>"
      },
      {
        "id": "comete",
        "label": "Comète",
        "svg": "<path d=\"M12.6 11.4 3.6 20M13.8 7.4 6.2 12.2M16.4 12.8 12.4 19\" stroke=\"#3D6BB3\" stroke-width=\"1.6\" fill=\"none\" stroke-linecap=\"round\" opacity=\".8\"/><circle cx=\"16.4\" cy=\"7.6\" r=\"3.7\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M18.8 4.8a3.7 3.7 0 0 1-5 5.4 3.7 3.7 0 0 0 5-5.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"15\" cy=\"6.2\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 15 6.2)\"/>"
      },
      {
        "id": "galaxie",
        "label": "Galaxie",
        "svg": "<ellipse cx=\"12\" cy=\"12\" rx=\"9.2\" ry=\"3.7\" transform=\"rotate(-18 12 12)\" fill=\"#5A3F7A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"12\" rx=\"6.4\" ry=\"2.4\" transform=\"rotate(-18 12 12)\" fill=\"#7A5A9E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"12\" rx=\"9.2\" ry=\"3.7\" transform=\"rotate(-18 12 12)\" fill=\"none\" stroke=\"#24201A\" stroke-width=\".7\" opacity=\".35\"/><circle cx=\"12\" cy=\"11.6\" r=\"2.2\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"11.2\" cy=\"10.9\" rx=\"0.8\" ry=\"0.45\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 11.2 10.9)\"/><circle cx=\"4.2\" cy=\"6.4\" r=\"0.55\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"19.8\" cy=\"17.2\" r=\"0.55\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"18.6\" cy=\"5.6\" r=\"0.4\" fill=\"#F3EAD3\" stroke=\"none\"/><circle cx=\"5.2\" cy=\"18.4\" r=\"0.4\" fill=\"#F3EAD3\" stroke=\"none\"/>"
      },
      {
        "id": "medaillon",
        "label": "Médaillon",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8.6\" fill=\"#1C2B4A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"6.6\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\".8\" opacity=\".8\"/><path d=\"M12 12c0-2.6 2-4.2 4.6-4.2-.6 3-2.3 4.2-4.6 4.2z\" fill=\"#7A5A9E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 12c0 2.6-2 4.2-4.6 4.2.6-3 2.3-4.2 4.6-4.2z\" fill=\"#7A5A9E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"8\" cy=\"8\" r=\"0.5\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"16.4\" cy=\"15.4\" r=\"0.5\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"15.6\" cy=\"8.6\" r=\"0.4\" fill=\"#F3EAD3\" stroke=\"none\"/><circle cx=\"8.6\" cy=\"15.6\" r=\"0.4\" fill=\"#F3EAD3\" stroke=\"none\"/><path d=\"M18.1 5.9a8.6 8.6 0 0 1-12.2 12.2A8.6 8.6 0 0 0 18.1 5.9z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.8\" cy=\"7.6\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 7.6)\"/>"
      },
      {
        "id": "cristal",
        "label": "Boule de cristal",
        "svg": "<circle cx=\"12\" cy=\"10.4\" r=\"6.6\" fill=\"#C9DCE8\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.4 6.6c1.4-1.5 3.4-2.1 5.4-1.6\" stroke=\"#FFFFFF\" stroke-width=\"1.2\" fill=\"none\" opacity=\".85\"/><path d=\"M13.4 13.8c1.6-.6 2.7-1.9 3.1-3.6\" stroke=\"#7A5A9E\" stroke-width=\"1.1\" fill=\"none\" opacity=\".7\"/><path d=\"M7.6 18.6h8.8l1.2 2.6H6.4z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 18.6h4.4l1.2 2.6H12z\" fill=\"#24201A\" opacity=\".14\"/><circle cx=\"10\" cy=\"9\" r=\"0.6\" fill=\"#FFFFFF\" stroke=\"none\"/>"
      },
      {
        "id": "oeil",
        "label": "Œil",
        "svg": "<path d=\"M2.6 12C5.1 7.6 8.6 5.4 12 5.4s6.9 2.2 9.4 6.6c-2.5 4.4-6 6.6-9.4 6.6S5.1 16.4 2.6 12z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"3.4\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"10.8\" cy=\"10.8\" r=\"0.6\" fill=\"#FFFFFF\" stroke=\"none\"/><path d=\"M5.4 8.6C4.4 9.5 3.5 10.6 2.6 12M18.6 8.6c1 .9 1.9 2 2.8 3.4\" stroke=\"#24201A\" stroke-width=\"1.1\" fill=\"none\"/><path d=\"M12 5.4c3.4 0 6.9 2.2 9.4 6.6-.6 1.1-1.3 2.1-2 2.9.7-3.9-2.2-8-7.4-9.4z\" fill=\"#24201A\" opacity=\".14\"/>"
      },
      {
        "id": "fantome",
        "label": "Fantôme",
        "svg": "<path d=\"M5.6 11a6.4 6.4 0 0 1 12.8 0v8.8l-2.2-1.7-2.1 1.7-2.1-1.7-2.1 1.7-2.2-1.7-2.1 1.7V11z\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15.4 5.6c1.8 1.2 3 3.2 3 5.4v8.8l-2.2-1.7-.9.7V11c0-2.1-.7-4-1.9-5.4z\" fill=\"#C9DCE8\" opacity=\".7\"/><circle cx=\"9.8\" cy=\"10.4\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.2\" cy=\"10.4\" r=\"0.9\" fill=\"#24201A\" stroke=\"none\"/><ellipse cx=\"12\" cy=\"13.2\" rx=\"1\" ry=\"1.3\" fill=\"#24201A\" opacity=\".6\"/><ellipse cx=\"9\" cy=\"7.4\" rx=\"1.5\" ry=\"0.85\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 7.4)\"/>"
      },
      {
        "id": "vampire",
        "label": "Vampire",
        "svg": "<path d=\"M4.8 8.2C6.2 5 8.8 3.2 12 3.2s5.8 1.8 7.2 5l-3.4-.9-1.9 1.3-1.9-1-1.9 1-1.9-1.3z\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"7.6\" fill=\"#EDE4F0\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M4.8 8.2C6.2 5 8.8 3.2 12 3.2s5.8 1.8 7.2 5l-3.4-.9-1.9 1.3-1.9-1-1.9 1-1.9-1.3z\" fill=\"#24201A\"/><path d=\"M7.6 9.4 10 10.6M16.4 9.4 14 10.6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.8 14h6.4\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.2 14l.8 2 .8-2M12.8 14l.8 2 .8-2\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.5\" cy=\"11.6\" r=\"0.6\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"14.5\" cy=\"11.6\" r=\"0.6\" fill=\"#B3382E\" stroke=\"none\"/>"
      },
      {
        "id": "chauvesouris",
        "label": "Chauve-souris",
        "svg": "<path d=\"M12 8.2c-1-2.2-3-3.4-5.6-3.4.4 1.8 0 3.1-1.1 3.9 2 .5 3.5 1.6 4.1 3.8L12 10.6l2.6 1.9c.6-2.2 2.1-3.3 4.1-3.8-1.1-.8-1.5-2.1-1.1-3.9-2.6 0-4.6 1.2-5.6 3.4z\" fill=\"#3A3F51\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.7 5.9 12 4.4l1.3 1.5\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 10.6v2.8\" stroke=\"#24201A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/><circle cx=\"10.9\" cy=\"7.6\" r=\"0.55\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"13.1\" cy=\"7.6\" r=\"0.55\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M12 8.2c1-2.2 3-3.4 5.6-3.4.4 1.8 0 3.1 1.1 3.9-2 .5-3.5 1.6-4.1 3.8L12 10.6z\" fill=\"#24201A\" opacity=\".14\"/>"
      },
      {
        "id": "bougie",
        "label": "Bougie",
        "svg": "<path d=\"M9 10.2h6V20a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-9.8z\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9 10.2c.6 1.4.4 2.4 1.4 2.4s.6-1.4 1.4-1.4.6 1.8 1.6 1.8.8-1.6 1.6-2.1V10.2z\" fill=\"#B3382E\" opacity=\".85\"/><path d=\"M12 8.4c1.5-1.1 1.5-2.8 0-4.8-1.5 2-1.5 3.7 0 4.8z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"7\" r=\"0.6\" fill=\"#B3382E\" stroke=\"none\"/><path d=\"M13.6 10.2H15V20a1 1 0 0 1-1 1h-1.4c.6-.3 1-.7 1-1.3z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"10.4\" cy=\"13.4\" rx=\"0.8\" ry=\"2.2\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(0 10.4 13.4)\"/>"
      },
      {
        "id": "cle",
        "label": "Vieille clé",
        "svg": "<circle cx=\"8\" cy=\"8\" r=\"4.4\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\"2.6\"/><circle cx=\"8\" cy=\"8\" r=\"4.4\" fill=\"none\" stroke=\"#24201A\" stroke-width=\".8\" opacity=\".5\"/><path d=\"M11.2 11.2 19.4 19.4M16.6 16.6 19 14.2M14.4 14.4 16.6 12.2\" stroke=\"#D9A441\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M11.2 11.2 19.4 19.4M16.6 16.6 19 14.2M14.4 14.4 16.6 12.2\" stroke=\"#24201A\" stroke-width=\".8\" fill=\"none\" stroke-linecap=\"round\" opacity=\".5\"/><ellipse cx=\"6.4\" cy=\"6\" rx=\"1.1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 6.4 6)\"/>"
      },
      {
        "id": "sablier",
        "label": "Sablier",
        "svg": "<path d=\"M7 3.4h10M7 20.6h10\" stroke=\"#66421F\" stroke-width=\"1.8\" stroke-linecap=\"round\"/><path d=\"M8.2 3.4c0 3.8 1.5 6.2 3.8 8.6-2.3 2.4-3.8 4.8-3.8 8.6M15.8 3.4c0 3.8-1.5 6.2-3.8 8.6 2.3 2.4 3.8 4.8 3.8 8.6\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.6 5.4c.4 2 1.2 3.4 2.4 4.8 1.2-1.4 2-2.8 2.4-4.8z\" fill=\"#D9A441\"/><path d=\"M12 15.4c-1.4 1.4-2.2 2.8-2.5 4.6h5c-.3-1.8-1.1-3.2-2.5-4.6z\" fill=\"#D9A441\"/><path d=\"M12 12.2v2.6\" stroke=\"#B8862F\" stroke-width=\"1\" stroke-dasharray=\"1 1.2\"/>"
      }
    ]
  },
  {
    "id": "casino",
    "unlockLevel": 18,
    "icons": [
      {
        "id": "jeton",
        "label": "Jeton",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 4v3.2M12 16.8V20M4 12h3.2M16.8 12H20M6.3 6.3l2.3 2.3M15.4 15.4l2.3 2.3M17.7 6.3l-2.3 2.3M8.6 15.4l-2.3 2.3\" stroke=\"#FFFFFF\" stroke-width=\"1.8\"/><circle cx=\"12\" cy=\"12\" r=\"4.6\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"none\" stroke=\"#B3382E\" stroke-width=\".9\"/><path d=\"M17.7 6.3A8 8 0 0 1 6.3 17.7 8 8 0 0 0 17.7 6.3z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.6\" cy=\"8\" rx=\"1.5\" ry=\"0.85\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 8)\"/>"
      },
      {
        "id": "pique",
        "label": "Pique",
        "svg": "<path d=\"M12 3C9 7 5.6 9.4 5.6 12.8a3.6 3.6 0 0 0 6 2.7c-.3 1.8-1 3.1-2.2 4h5.2c-1.2-.9-1.9-2.2-2.2-4a3.6 3.6 0 0 0 6-2.7C18.4 9.4 15 7 12 3z\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 5.2c-2.2 3-4.4 5-4.6 7.4\" stroke=\"#5F6B76\" stroke-width=\"1\" fill=\"none\" opacity=\".8\"/><ellipse cx=\"9.4\" cy=\"9\" rx=\"1.1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9.4 9)\"/>"
      },
      {
        "id": "coeur",
        "label": "Cœur",
        "svg": "<path d=\"M12 20c-5-3.8-8-6.8-8-10.2C4 7 5.8 5 8.2 5c1.6 0 3 .8 3.8 2.2C12.8 5.8 14.2 5 15.8 5 18.2 5 20 7 20 9.8c0 3.4-3 6.4-8 10.2z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15.8 5C18.2 5 20 7 20 9.8c0 3.4-3 6.4-8 10.2 3.6-4.2 5.4-7.6 5.4-10.4 0-1.9-.6-3.4-1.6-4.6z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.2\" cy=\"8\" rx=\"1.6\" ry=\"0.9\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.2 8)\"/>"
      },
      {
        "id": "carreau",
        "label": "Carreau",
        "svg": "<path d=\"M12 3l6.6 9-6.6 9-6.6-9z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 3l6.6 9-6.6 9V3z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"9.4\" cy=\"8.6\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-55 9.4 8.6)\"/>"
      },
      {
        "id": "trefle",
        "label": "Trèfle",
        "svg": "<circle cx=\"12\" cy=\"7.2\" r=\"3.5\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"7.8\" cy=\"13\" r=\"3.5\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16.2\" cy=\"13\" r=\"3.5\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 12.6c-.2 2.7-1 4.6-2.5 6h5c-1.5-1.4-2.3-3.3-2.5-6z\" fill=\"#24201A\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"10.6\" cy=\"5.8\" rx=\"1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 10.6 5.8)\"/><ellipse cx=\"6.6\" cy=\"11.8\" rx=\"0.9\" ry=\"0.55\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 6.6 11.8)\"/>"
      },
      {
        "id": "roulette",
        "label": "Roulette",
        "svg": "<circle cx=\"12\" cy=\"12\" r=\"8\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 4a8 8 0 0 1 6.9 4L12 12z\" fill=\"#24201A\"/><path d=\"M12 20a8 8 0 0 1-6.9-4L12 12z\" fill=\"#24201A\"/><path d=\"M4 12a8 8 0 0 1 1.1-4L12 12z\" fill=\"#24201A\" opacity=\"0\"/><circle cx=\"12\" cy=\"12\" r=\"8\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7\" stroke=\"#D9A441\" stroke-width=\".9\" opacity=\".9\"/><circle cx=\"12\" cy=\"12\" r=\"2.8\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"15.8\" cy=\"8.4\" r=\"0.8\" fill=\"#FFFFFF\" stroke=\"none\"/><ellipse cx=\"8.6\" cy=\"7.8\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.6 7.8)\"/>"
      },
      {
        "id": "desjumeaux",
        "label": "Dés jumeaux",
        "svg": "<rect x=\"3\" y=\"8.6\" width=\"9.6\" height=\"9.6\" rx=\"2\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"5.9\" cy=\"11.5\" r=\"0.95\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"9.7\" cy=\"11.5\" r=\"0.95\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"5.9\" cy=\"15.3\" r=\"0.95\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"9.7\" cy=\"15.3\" r=\"0.95\" fill=\"#B3382E\" stroke=\"none\"/><g transform=\"rotate(10 16.4 8.6)\"><rect x=\"12.4\" y=\"4.4\" width=\"8.2\" height=\"8.2\" rx=\"1.8\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16.5\" cy=\"8.5\" r=\"0.95\" fill=\"#274B8F\" stroke=\"none\"/></g><path d=\"M10.6 8.6h2v9.6a2 2 0 0 1-2 2z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"5\" cy=\"10\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 5 10)\"/>"
      },
      {
        "id": "eventail",
        "label": "Éventail de cartes",
        "svg": "<g transform=\"rotate(-24 12 20)\"><rect x=\"8.8\" y=\"4.2\" width=\"6.8\" height=\"10.2\" rx=\"1\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11 7.2l1.2 1.7L11 10.6 9.8 8.9z\" fill=\"#B3382E\"/></g><g transform=\"rotate(24 12 20)\"><rect x=\"8.8\" y=\"4.2\" width=\"6.8\" height=\"10.2\" rx=\"1\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"11.2\" cy=\"8\" r=\"1.3\" fill=\"#24201A\"/></g><rect x=\"8.6\" y=\"3\" width=\"6.8\" height=\"10.2\" rx=\"1\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 5.6c-1-1.3-2.6-.5-2.6.7 0 1 .9 1.9 2.6 3.1 1.7-1.2 2.6-2.1 2.6-3.1 0-1.2-1.6-2-2.6-.7z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.7\" cy=\"4.4\" r=\"0.45\" fill=\"#B3382E\" stroke=\"none\"/>"
      },
      {
        "id": "ferachev",
        "label": "Fer à cheval",
        "svg": "<path d=\"M6.4 3.8v6.6a5.6 5.6 0 0 0 11.2 0V3.8\" stroke=\"#24201A\" stroke-width=\"5.8\" fill=\"none\"/><path d=\"M6.4 3.8v6.6a5.6 5.6 0 0 0 11.2 0V3.8\" stroke=\"#D9A441\" stroke-width=\"3.6\" fill=\"none\"/><path d=\"M4.6 3h3.6v2H4.6zM15.8 3h3.6v2h-3.6z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"6.4\" cy=\"7.2\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"6.9\" cy=\"10.8\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"9.4\" cy=\"14.2\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"14.6\" cy=\"14.2\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"17.1\" cy=\"10.8\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><circle cx=\"17.6\" cy=\"7.2\" r=\"0.55\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M12 18.4v2.4M9.8 20.8h4.4\" stroke=\"#B8862F\" stroke-width=\"1.1\" stroke-linecap=\"round\" opacity=\"0\"/><ellipse cx=\"8.2\" cy=\"5.4\" rx=\"0.9\" ry=\"1.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(10 8.2 5.4)\"/>"
      },
      {
        "id": "cloche",
        "label": "Cloche",
        "svg": "<path d=\"M12 3.2c3.6 0 5.6 2.6 5.6 6.2v3.8l2 3.2H4.4l2-3.2V9.4c0-3.6 2-6.2 5.6-6.2z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M14.4 3.8c2 1 3.2 3 3.2 5.6v3.8l2 3.2h-4.4l-1.4-3.2V9.4c0-2.3-.5-4.2-1.4-5.6z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M10 16.4a2 2 0 0 0 4 0\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"2.6\" r=\"1\" fill=\"#B8862F\" stroke=\"none\"/><ellipse cx=\"9\" cy=\"7\" rx=\"1.2\" ry=\"2\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(18 9 7)\"/>"
      },
      {
        "id": "cerises",
        "label": "Cerises",
        "svg": "<path d=\"M8.9 12.4C10.2 8.2 12.2 5.6 15.2 4M16.1 12.9c-.2-3.6-.6-6.2-.9-8.9\" stroke=\"#2A6A45\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M15.2 4c1.8-.6 3.4-.3 5 .8-1.7.8-3.3.8-5-.8z\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"8\" cy=\"15.8\" r=\"3.6\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"16\" cy=\"16.2\" r=\"3.6\" fill=\"#8F2C24\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.2 13a3.6 3.6 0 0 1-4.4 5.6A3.6 3.6 0 0 0 10.2 13z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"6.8\" cy=\"14.4\" rx=\"1.1\" ry=\"0.65\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 6.8 14.4)\"/><ellipse cx=\"14.8\" cy=\"14.8\" rx=\"1.1\" ry=\"0.65\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 14.8 14.8)\"/>"
      },
      {
        "id": "billet",
        "label": "Billet",
        "svg": "<rect x=\"2.6\" y=\"7\" width=\"18.8\" height=\"10\" rx=\"2\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"4.4\" y=\"8.6\" width=\"15.2\" height=\"6.8\" rx=\"1.2\" fill=\"none\" stroke=\"#F3EAD3\" stroke-width=\".9\" opacity=\".8\"/><circle cx=\"12\" cy=\"12\" r=\"2.7\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 10.6v2.8M11 11.4h1.6a.9.9 0 0 1 0 1.2H11\" stroke=\"#2A6A45\" stroke-width=\".9\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M14 7h5.4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H14c1.9-1.4 2.9-3 2.9-5s-1-3.6-2.9-5z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"6\" cy=\"9.4\" rx=\"1.3\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 6 9.4)\"/>"
      },
      {
        "id": "pilejetons",
        "label": "Pile de jetons",
        "svg": "<path d=\"M5.6 14.6v3.2c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5v-3.2\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.6 10.8v3.8c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5v-3.8\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.6 7v3.8c0 1.4 2.9 2.5 6.4 2.5s6.4-1.1 6.4-2.5V7\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"6.4\" ry=\"2.4\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"12\" cy=\"6.8\" rx=\"3.6\" ry=\"1.3\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M5.6 8.6h.01M18.4 8.6h.01\" stroke=\"#FFFFFF\" stroke-width=\"1.6\" stroke-linecap=\"round\"/><ellipse cx=\"8\" cy=\"5.6\" rx=\"1.4\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-8 8 5.6)\"/>"
      },
      {
        "id": "dosdecarte",
        "label": "Dos de carte",
        "svg": "<rect x=\"6\" y=\"3\" width=\"12\" height=\"18\" rx=\"2\" fill=\"#274B8F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"7.6\" y=\"4.6\" width=\"8.8\" height=\"14.8\" rx=\"1\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\".9\"/><path d=\"M7.6 8.2 16.4 15.8M16.4 8.2 7.6 15.8M12 4.6v14.8\" stroke=\"#D9A441\" stroke-width=\".7\" opacity=\".7\"/><circle cx=\"12\" cy=\"12\" r=\"1.1\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M15 3h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1c.8-.6 1.2-1.4 1.2-2.3V5.3c0-.9-.4-1.7-1.2-2.3z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"9\" cy=\"5.8\" rx=\"1.1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 5.8)\"/>"
      },
      {
        "id": "noeudpap",
        "label": "Croupier",
        "svg": "<path d=\"M3.6 7.6 10 10.6v2.8L3.6 16.4c-.9-3-.9-5.8 0-8.8z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M20.4 7.6 14 10.6v2.8l6.4 3c.9-3 .9-5.8 0-8.8z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"9.8\" y=\"9.8\" width=\"4.4\" height=\"4.4\" rx=\"1.2\" fill=\"#8F2C24\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M20.4 7.6 14 10.6v2.8l3.4 1.6c1.2-2 2.2-4.4 3-7.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"6\" cy=\"9.4\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-18 6 9.4)\"/><ellipse cx=\"11\" cy=\"10.8\" rx=\"0.8\" ry=\"0.45\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 11 10.8)\"/>"
      },
      {
        "id": "machine",
        "label": "Machine à sous",
        "svg": "<rect x=\"4\" y=\"4.6\" width=\"13.6\" height=\"14.8\" rx=\"2\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"6\" y=\"8\" width=\"9.6\" height=\"5\" rx=\"1\" fill=\"#F3EAD3\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.2 8v5M12.4 8v5\" stroke=\"#24201A\" stroke-width=\".8\" opacity=\".5\"/><circle cx=\"7.6\" cy=\"10.5\" r=\"0.8\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"10.8\" cy=\"10.5\" r=\"0.8\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"14\" cy=\"10.5\" r=\"0.8\" fill=\"#3D6BB3\" stroke=\"none\"/><rect x=\"6.6\" y=\"15\" width=\"8.4\" height=\"2.2\" rx=\"1.1\" fill=\"#B8862F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M20.4 6.2v4.6\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"20.4\" cy=\"5\" r=\"1.4\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M14 4.6h1.6a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2H14c1.1-.9 1.7-2 1.7-3.4V8c0-1.4-.6-2.5-1.7-3.4z\" fill=\"#24201A\" opacity=\".14\"/>"
      }
    ]
  },
  {
    "id": "legende",
    "unlockLevel": 25,
    "icons": [
      {
        "id": "couronne",
        "label": "Couronne",
        "svg": "<path d=\"M4 7.6l4 3.6L12 4.6l4 6.6 4-3.6-1.6 10.6H5.6L4 7.6z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16 11.2l4-3.6-1.6 10.6h-4.2l1.4-9z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M6.4 15h11.2\" stroke=\"#B8862F\" stroke-width=\"1\" opacity=\".8\"/><circle cx=\"8.4\" cy=\"15.9\" r=\"0.85\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"12\" cy=\"15.9\" r=\"0.85\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"15.6\" cy=\"15.9\" r=\"0.85\" fill=\"#B3382E\" stroke=\"none\"/><ellipse cx=\"8\" cy=\"10\" rx=\"1.2\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8 10)\"/>"
      },
      {
        "id": "eclair",
        "label": "Éclair",
        "svg": "<path d=\"M13.2 2.4 5 13.6h5.4L9.8 21.6l8.6-11.8h-5.2z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.2 2.4l-1 6.4 1 1h5.2L9.8 21.6l3.2-8z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"10.4\" cy=\"7\" rx=\"1\" ry=\"1.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(20 10.4 7)\"/>"
      },
      {
        "id": "diamant",
        "label": "Diamant",
        "svg": "<path d=\"M7 4h10l4 5.6L12 21 3 9.6z\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M3 9.6h18M7 4l5 5.6L17 4M12 21 8.6 9.6M12 21l3.4-11.4\" stroke=\"#FFFFFF\" stroke-width=\".9\" fill=\"none\" opacity=\".75\"/><path d=\"M17 4l4 5.6L12 21l3.4-11.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8\" cy=\"6.6\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-25 8 6.6)\"/>"
      },
      {
        "id": "trophee",
        "label": "Trophée",
        "svg": "<path d=\"M7 4h10v6a5 5 0 0 1-10 0V4z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M7 5.8H4.4a3.6 3.6 0 0 0 3.1 4.1M17 5.8h2.6a3.6 3.6 0 0 1-3.1 4.1\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 15v3.2M8.4 21h7.2M9.8 18.2h4.4v2.8H9.8z\" fill=\"#B8862F\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.6 4H17v6a5 5 0 0 1-5 5c2.2-1.3 3.3-3 3.3-5.2z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M10 6.4l.9 1.9 2.1.2-1.6 1.4.5 2-1.9-1.1\" fill=\"#F3EAD3\" opacity=\".9\"/><ellipse cx=\"8.8\" cy=\"5.6\" rx=\"1.1\" ry=\"0.65\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 5.6)\"/>"
      },
      {
        "id": "epee",
        "label": "Épée",
        "svg": "<path d=\"M12 1.8l1.8 2.8-.5 10.6h-2.6l-.5-10.6z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 2.6v12.2\" stroke=\"#5F6B76\" stroke-width=\".8\" opacity=\".8\"/><path d=\"M12 1.8l1.8 2.8-.3 6.4c-.5-2.9-.6-6-.3-9.2z\" fill=\"#FFFFFF\" opacity=\".55\"/><rect x=\"7.2\" y=\"15.2\" width=\"9.6\" height=\"2\" rx=\".9\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"10.8\" y=\"17.2\" width=\"2.4\" height=\"3.2\" rx=\".7\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.8 18.2h2.4M10.8 19.3h2.4\" stroke=\"#66421F\" stroke-width=\".7\"/><circle cx=\"12\" cy=\"21.5\" r=\"1.2\" fill=\"#D9A441\" stroke=\"none\"/><circle cx=\"12\" cy=\"21.5\" r=\"0.5\" fill=\"#B8862F\" stroke=\"none\"/>"
      },
      {
        "id": "excalibur",
        "label": "Excalibur",
        "svg": "<path d=\"M4.2 21c0-2.7 2.1-4.5 4.8-4.9l5.8-.2c2.9.2 4.9 1.8 4.9 4.2v.9z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M6.6 17.4l2.2 1.8M14.6 16.4l2.6 1.6M10.4 19.4l3.2.4\" stroke=\"#5F6B76\" stroke-width=\".9\" opacity=\".8\"/><path d=\"M14.8 15.9c2.9.2 4.9 1.8 4.9 4.2v.9h-4.4c.6-1.9.4-3.6-.5-5.1z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M10.9 16.6 10.6 8.4h2.8l-.3 8.2z\" fill=\"#9AA3AD\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 8.8v7.4\" stroke=\"#5F6B76\" stroke-width=\".7\" opacity=\".8\"/><rect x=\"7.6\" y=\"6.4\" width=\"8.8\" height=\"1.9\" rx=\".9\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"10.9\" y=\"3.4\" width=\"2.2\" height=\"3\" rx=\".7\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"2.4\" r=\"1.15\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M9.2 16.6h5.6\" stroke=\"#24201A\" stroke-width=\"1\" stroke-linecap=\"round\"/><ellipse cx=\"6.8\" cy=\"18.4\" rx=\"1.4\" ry=\"0.7\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-10 6.8 18.4)\"/>"
      },
      {
        "id": "bouclier",
        "label": "Bouclier",
        "svg": "<path d=\"M12 2.8l7.6 2.9v5.5c0 4.8-3 8-7.6 9.9-4.6-1.9-7.6-5.1-7.6-9.9V5.7z\" fill=\"#3D6BB3\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 2.8l7.6 2.9v5.5c0 4.8-3 8-7.6 9.9z\" fill=\"#274B8F\"/><path d=\"M12 2.8l7.6 2.9v5.5c0 4.8-3 8-7.6 9.9-4.6-1.9-7.6-5.1-7.6-9.9V5.7z\" fill=\"none\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"10.6\" r=\"2.4\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 2.8v18.3\" stroke=\"#24201A\" stroke-width=\".7\" opacity=\".4\"/><ellipse cx=\"8.4\" cy=\"6.6\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.4 6.6)\"/>"
      },
      {
        "id": "flamme",
        "label": "Flamme",
        "svg": "<path d=\"M12 2.8c1.1 3-.4 4.7-2 6.3-1.9 1.9-3.1 3.6-3.1 5.9A5.4 5.4 0 0 0 12 20.4a5.4 5.4 0 0 0 5.1-5.4c0-2.2-1-3.9-2.2-5.6C13.7 7.7 13 5.4 12 2.8z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 20.4c-1.7-.9-2.4-2.2-2-4 .8.8 1.6 1.1 2.4 1-.4-1.5 0-2.7 1.1-3.8.8 2.8.3 5.2-1.5 6.8z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 2.8c1.1 3-.4 4.7-2 6.3l-.4.4c2.5-.4 4-2 4.4-4.6.4 1 .7 2 .9 2.9 1.2 1.7 2.2 3.4 2.2 5.6 0 2.2-1.3 4.1-3.2 5A5.4 5.4 0 0 0 17.1 15c0-2.2-1-3.9-2.2-5.6C13.7 7.7 13 5.4 12 2.8z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"9.6\" cy=\"10\" rx=\"1\" ry=\"1.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(15 9.6 10)\"/>"
      },
      {
        "id": "phenix",
        "label": "Phénix",
        "svg": "<path d=\"M10.9 11.9C10.1 9 8.3 6.7 5.5 5.1c.1 1.6.7 3 1.7 4.1-1.5-.2-2.9-.9-4-2 .2 3.6 2.8 5.9 7.7 6.6z\" fill=\"#D07A3A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.1 11.9c.8-2.9 2.6-5.2 5.4-6.8-.1 1.6-.7 3-1.7 4.1 1.5-.2 2.9-.9 4-2-.2 3.6-2.8 5.9-7.7 6.6z\" fill=\"#D07A3A\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M9.5 10.3C8.8 8.8 7.7 7.5 6.2 6.5M14.5 10.3c.7-1.5 1.8-2.8 3.3-3.8\" stroke=\"#B8862F\" stroke-width=\".9\" fill=\"none\" opacity=\".8\"/><path d=\"M12 6.4c2 2.6 3 4.9 3 6.9a3 3 0 0 1-3 3.3 3 3 0 0 1-3-3.3c0-2 1-4.3 3-6.9z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 9.8c.9 1.4 1.4 2.6 1.4 3.6 0 1-.6 1.7-1.4 1.7s-1.4-.7-1.4-1.7c0-1 .5-2.2 1.4-3.6z\" fill=\"#D9A441\"/><circle cx=\"12\" cy=\"4.8\" r=\"1.8\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M13.7 4.5l1.7.6-1.6.9z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M11.2 3.1 10.4 1.3M12 2.9l.1-1.7M12.8 3.1l.8-1.7\" stroke=\"#B8862F\" stroke-width=\"1\" stroke-linecap=\"round\" fill=\"none\"/><circle cx=\"11.4\" cy=\"4.6\" r=\"0.4\" fill=\"#24201A\" stroke=\"none\"/><path d=\"M10.3 16.5c-1.1 1.5-1.6 3.2-1.4 5.1 1.5-.8 2.4-2 2.8-3.7zM13.7 16.5c1.1 1.5 1.6 3.2 1.4 5.1-1.5-.8-2.4-2-2.8-3.7zM12 16.9c-.4 1.8-.3 3.4.3 4.8.8-1.2 1.1-2.8.8-4.6z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "laurier",
        "label": "Laurier",
        "svg": "<path d=\"M11 20.6C6.8 18.9 4.4 15 4.7 9.6M13 20.6c4.2-1.7 6.6-5.6 6.3-11\" stroke=\"#2A6A45\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"4.6\" cy=\"7.6\" rx=\"1.9\" ry=\".95\" transform=\"rotate(-70 4.6 7.6)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"4.9\" cy=\"11.6\" rx=\"1.9\" ry=\".95\" transform=\"rotate(-52 4.9 11.6)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"6.3\" cy=\"15.4\" rx=\"1.9\" ry=\".95\" transform=\"rotate(-30 6.3 15.4)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"8.9\" cy=\"18.4\" rx=\"1.9\" ry=\".95\" transform=\"rotate(-10 8.9 18.4)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"19.4\" cy=\"7.6\" rx=\"1.9\" ry=\".95\" transform=\"rotate(70 19.4 7.6)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"19.1\" cy=\"11.6\" rx=\"1.9\" ry=\".95\" transform=\"rotate(52 19.1 11.6)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"17.7\" cy=\"15.4\" rx=\"1.9\" ry=\".95\" transform=\"rotate(30 17.7 15.4)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"15.1\" cy=\"18.4\" rx=\"1.9\" ry=\".95\" transform=\"rotate(10 15.1 18.4)\" fill=\"#3E8E5F\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M10.6 19.6h2.8l-.5 2.4h-1.8z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/>"
      },
      {
        "id": "sceptre",
        "label": "Sceptre",
        "svg": "<path d=\"M12 9.6v11\" stroke=\"#D9A441\" stroke-width=\"2.4\"/><path d=\"M12 9.6v11\" stroke=\"#24201A\" stroke-width=\".7\" opacity=\".5\"/><circle cx=\"12\" cy=\"5.8\" r=\"3.2\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.8 5.8c0-2.3 1.4-3.8 3.2-3.8s3.2 1.5 3.2 3.8\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\"1.6\"/><circle cx=\"12\" cy=\"1.6\" r=\"1\" fill=\"#D9A441\" stroke=\"none\"/><path d=\"M9.6 20.6h4.8\" stroke=\"#B8862F\" stroke-width=\"1.6\" stroke-linecap=\"round\"/><ellipse cx=\"10.8\" cy=\"4.8\" rx=\"0.9\" ry=\"0.55\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 10.8 4.8)\"/>"
      },
      {
        "id": "meteore",
        "label": "Météore",
        "svg": "<path d=\"M12.4 12.4 3 3M15.4 10.4 8.2 4.2M13.6 15 6.2 9.8\" stroke=\"#D07A3A\" stroke-width=\"1.8\" fill=\"none\" stroke-linecap=\"round\" opacity=\".85\"/><circle cx=\"15.6\" cy=\"15.6\" r=\"4.6\" fill=\"#8A5A33\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"14.2\" cy=\"14.6\" r=\"0.9\" fill=\"#66421F\" stroke=\"none\"/><circle cx=\"17\" cy=\"16.8\" r=\"0.7\" fill=\"#66421F\" stroke=\"none\"/><path d=\"M18.8 12.8a4.6 4.6 0 0 1-6.4 6.4 4.6 4.6 0 0 0 6.4-6.4z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"14\" cy=\"13.6\" rx=\"1.1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 14 13.6)\"/>"
      }
    ]
  },
  {
    "id": "fondateur",
    "unlockLevel": 999,
    "icons": [
      {
        "id": "filante",
        "label": "Étoile filante",
        "svg": "<path d=\"M10.4 12.6 2.6 20.4M12.6 15.2 7.4 20.4M8.4 10.8 3 16.2\" stroke=\"#D9A441\" stroke-width=\"1.7\" fill=\"none\" stroke-linecap=\"round\" opacity=\".85\"/><path d=\"M15.6 3.6 17 7.2l3.8.3-2.9 2.4.9 3.7-3.2-2-3.2 2 .9-3.7-2.9-2.4 3.8-.3z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M15.6 3.6 17 7.2l3.8.3-2.9 2.4.9 3.7-3.2-2V3.6z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"13.8\" cy=\"6.4\" rx=\"1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 13.8 6.4)\"/>"
      },
      {
        "id": "sceau",
        "label": "Sceau de la maison",
        "svg": "<path d=\"M8.2 16.6 6.6 21.4l2.7-1.2 1.1 2.2 1.8-4.2zM15.8 16.6l1.6 4.8-2.7-1.2-1.1 2.2-1.8-4.2z\" fill=\"#8F2C24\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"10.6\" r=\"7.2\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"12\" cy=\"10.6\" r=\"5.2\" fill=\"none\" stroke=\"#D9A441\" stroke-width=\".9\" opacity=\".9\"/><path d=\"M12 6.8l1.2 2.4 2.6.3-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.3z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M16.6 5.5a7.2 7.2 0 0 1-9.2 11A7.2 7.2 0 0 0 16.6 5.5z\" fill=\"#24201A\" opacity=\".14\"/><ellipse cx=\"8.8\" cy=\"6.6\" rx=\"1.4\" ry=\"0.8\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 8.8 6.6)\"/>"
      },
      {
        "id": "as-couronne",
        "label": "As couronné",
        "svg": "<rect x=\"7\" y=\"6.4\" width=\"10\" height=\"14.6\" rx=\"1.8\" fill=\"#FFFFFF\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M12 10.4c-1.2-1.6-3.2-.6-3.2.9 0 1.2 1.1 2.3 3.2 3.8 2.1-1.5 3.2-2.6 3.2-3.8 0-1.5-2-2.5-3.2-.9z\" fill=\"#B3382E\" stroke=\"#24201A\" stroke-width=\".9\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M8.2 16.8c.8-1.1 2.2-.4 2.2.6 0 .8-.7 1.5-2.2 2.5V16.8z\" fill=\"#B3382E\" opacity=\".75\"/><path d=\"M15.4 6.4H17v14.6a1.8 1.8 0 0 1-1.8 1.8h-.6c.5-.5.8-1.1.8-1.8z\" fill=\"#24201A\" opacity=\".14\"/><path d=\"M7.6 4.9l2.4 1.8L12 3.6l2 3.1 2.4-1.8-.7 4H8.3z\" fill=\"#D9A441\" stroke=\"#24201A\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"9.6\" cy=\"7.6\" r=\"0.55\" fill=\"#B3382E\" stroke=\"none\"/><circle cx=\"12\" cy=\"7.6\" r=\"0.55\" fill=\"#3D6BB3\" stroke=\"none\"/><circle cx=\"14.4\" cy=\"7.6\" r=\"0.55\" fill=\"#B3382E\" stroke=\"none\"/><ellipse cx=\"9\" cy=\"11.6\" rx=\"1\" ry=\"0.6\" fill=\"#FFFFFF\" opacity=\".5\" transform=\"rotate(-30 9 11.6)\"/>"
      }
    ]
  }
]
