import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

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
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
