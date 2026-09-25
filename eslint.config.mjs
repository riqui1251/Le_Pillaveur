import { dirname } from "path";
import { fileURLToPath } from "url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next 15 n'est publié qu'au format .eslintrc : FlatCompat le
// traduit. C'est lui qui pose react/recommended, react-hooks/recommended
// (rules-of-hooks en erreur, exhaustive-deps en avertissement) et
// @next/next/core-web-vitals (no-img-element en avertissement) — ces règles ne
// sont donc PAS redéclarées plus bas.
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Fichiers TypeScript seuls : le parser et les règles @typescript-eslint n'ont
// rien à dire aux .js de configuration (next.config.js, tailwind.config.js,
// scripts/*.js), qui vivent en CommonJS et déclencheraient no-require-imports.
const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];

const eslintConfig = [
  {
    ignores: [
      // Sorties de build
      ".next/**",
      "out/**",

      // Dépendances
      "node_modules/**",

      // Coquille Capacitor : projet Android autonome, pas du code du site
      "mobile/**",

      // Sauvegardes et fichiers temporaires
      "**/*.bak",
      "**/*.temp",
      "**/*.tmp",

      // Sorties compilées
      "**/*.min.js",
      "**/*.bundle.js",
    ],
  },
  // Socle JavaScript (eslint:recommended) : erreurs de logique que TypeScript
  // ne voit pas (no-fallthrough, no-cond-assign, no-self-assign, use-isnan…).
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
  // Socle TypeScript : parser + règles recommandées, restreints aux .ts/.tsx.
  // `flat/eslint-recommended` y coupe les règles JS que le compilateur rend
  // redondantes (no-undef, no-redeclare, no-dupe-keys…).
  ...tseslint.configs["flat/recommended"].map((config) => ({
    ...config,
    files: TS_FILES,
  })),
  {
    // Règles de qualité reprises de l'ancien .eslintrc.json (ignoré par
    // ESLint 9, elles étaient inertes). En avertissement d'abord : le code
    // existant en produit des centaines, on les résorbe au fil des chantiers
    // sans bloquer le build (next build lance ce lint).
    rules: {
      // Le journal du conteneur ne doit recevoir que ce qu'un exploitant lit :
      // console.warn / console.error passent, console.log est un oubli.
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "no-duplicate-imports": "warn",
      // Les apostrophes du français dans le JSX (« l'hôte », « n'a pas ») :
      // l'ancien réglage les tolérait, on ne rouvre pas ce front.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: TS_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          // Le préfixe _ dit « volontairement inutilisé » (argument imposé par
          // une signature, variable de déstructuration écartée, erreur avalée).
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // rules-of-hooks ne s'applique qu'aux composants et aux hooks : dans les
    // routes API et le middleware, une fonction `useXxx` importée d'un module
    // serveur n'est pas un hook React, la règle y produirait de faux positifs.
    // Les page.tsx et layout.tsx SONT des composants React : la règle y reste.
    files: ["src/app/api/**/*.{ts,tsx}", "src/middleware.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // Plancher de lisibilité : on joue en soirée, souvent un verre à la main —
    // 8 et 9 px ne se lisent pas. Le texte qui porte une information est à
    // 12 px (text-xs), 11 px est toléré pour une métadonnée décorative. La
    // règle vise les classes littérales `text-[8px]` / `text-[9px]` (variantes
    // `sm:` comprises), en chaîne comme en gabarit. En AVERTISSEMENT : il en
    // reste dans des jeux locaux et la supervision, à résorber au fil des
    // chantiers. Si une ligne doit vraiment garder 8 ou 9 px (glyphe dans une
    // case de plateau), un eslint-disable-next-line qui dit pourquoi.
    files: TS_FILES,
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/text-\\[[89]px\\]/]",
          message:
            "Texte à 8 ou 9 px : illisible sur téléphone. 12 px (text-xs) pour une information, 11 px au plus bas pour une métadonnée décorative.",
        },
        {
          selector: "TemplateElement[value.raw=/text-\\[[89]px\\]/]",
          message:
            "Texte à 8 ou 9 px : illisible sur téléphone. 12 px (text-xs) pour une information, 11 px au plus bas pour une métadonnée décorative.",
        },
      ],
    },
  },
];

export default eslintConfig;
