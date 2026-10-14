import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  // tsconfig garde `jsx: preserve` pour Next ; sans ce réglage, esbuild
  // compilerait un composant importé par un test en React.createElement sans
  // import de React (runtime classique). Next utilise le runtime automatique.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
