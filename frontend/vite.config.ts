import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// App is served from the domain root. Change BASE if deployed under a sub-path (keep the trailing slash);
// manifest paths, navigation fallback, API exclusion and the service worker scope follow it.
const BASE = '/';

export default defineConfig({
  base: BASE,
  // react lives in frontend/node_modules while hoisted libraries (framer-motion) sit at the repo root. Resolving
  // react once from this project keeps them on the same copy; without it vite 8 swaps in an empty optional-peer stub.
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new service worker waits until the user accepts the update banner.
      registerType: 'prompt',
      injectRegister: false, // registered manually in src/pwa/PwaPrompts.tsx
      includeAssets: ['logo.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Naseej | نَسيج — Connected Healthcare Platform',
        short_name: 'نَسيج',
        description:
          'نسيج: سجلك الصحي منظَّم وزيارتك جاهزة. احفظ تاريخك الطبي وأعراضك ووثائقك، وجهّز ملخص زيارة، وشاركه مع طبيبك برابط مؤقت يمكنك إلغاؤه.',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f9f8',
        theme_color: '#f7f9f8',
        categories: ['medical', 'health', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the static app shell (hashed JS/CSS, HTML, icons).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true, // delete caches from previous precache versions
        clientsClaim: false, // do not take over open tabs mid-session; the update banner controls it
        skipWaiting: false, // new worker waits until the user accepts the update
        // SPA routing: every navigation falls back to the precached shell, except API and file downloads.
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Authenticated API traffic is never cached: no stale or cross-user clinical data.
          { urlPattern: new RegExp(`${BASE}api/`), handler: 'NetworkOnly' },
          // Google Fonts stylesheet: public, non-personal, safe to serve stale while revalidating.
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'naseej-fonts-css', expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          // Font files are immutable.
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'naseej-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Off under `vite dev`: the worker is rebuilt on every edit and kept per port, which shows the update prompt on each load.
      // Test install and offline with `npm --prefix frontend run build` then `npm --prefix frontend run preview`.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
