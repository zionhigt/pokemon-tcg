import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// BASE_PATH est fourni par la CI pour GitHub Pages (ex: /pokemon-tcg/)
const base = process.env.BASE_PATH ?? '/';

// Sous WSL, les fichiers sur un disque Windows (/mnt/c…) n'émettent pas d'événements :
// sans polling, le serveur de dev continue de servir l'ancien code après une modification.
const onWindowsDrive = process.platform === 'linux' && /^\/mnt\/[a-z]\//.test(process.cwd());

export default defineConfig({
  base,
  server: { watch: onWindowsDrive ? { usePolling: true, interval: 300 } : undefined },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pokémon TCG — Booster Shop',
        short_name: 'Booster Shop',
        description: "Achète, ouvre et collectionne des boosters Pokémon.",
        lang: 'fr',
        theme_color: '#1b1340',
        background_color: '#0f0b24',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // Le cache d'assets local (npm run assets) est trop lourd pour le précache : chargé à la demande.
        globIgnores: ['tcg-cache/**'],
        runtimeCaching: [
          {
            urlPattern: /\/tcg-cache\/manifest\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'local-manifest' },
          },
          {
            urlPattern: /\/tcg-cache\/(img|tcgdex|mascots|sets)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-assets',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.tcgdex\.net\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tcgdex-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/assets\.tcgdex\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tcgdex-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/api\.pokemontcg\.io\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pokemontcg-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/images\.pokemontcg\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokemontcg-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
