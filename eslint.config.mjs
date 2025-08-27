import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      // Build output
      'html/**',
      '.next/**',
      'out/**',
      
      // Dependencies
      'node_modules/**',
      
      // Backups and temporary files
      '**/*.bak',
      '**/*.temp',
      '**/*.tmp',
      
      // Compiled output
      '**/*.min.js',
      '**/*.bundle.js',
      
      // Specific files that peuvent causer des problèmes spécifiques
      'src/app/games/petit-buveur/components/game.tsx.bak',
      'src/app/games/petit-buveur/components/game.tsx.temp'
    ]
  },
  // Activer le parser et le plugin TypeScript pour que les règles @typescript-eslint
  // référencées dans les fichiers (via /* eslint-disable */) soient reconnues
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
  },
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Évite les faux positifs de react-hooks dans l'App Router (API routes, server files)
      'react-hooks/rules-of-hooks': 'off',
    },
    files: [
      'src/app/api/**/*.{ts,tsx}',
      'src/app/**/route.ts',
      'src/app/**/middleware.ts',
      'src/app/**/layout.tsx',
      'src/app/**/page.tsx',
    ],
  },
];

export default eslintConfig;
