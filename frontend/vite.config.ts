import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // App is served from the domain root. Change `base` here if it is deployed under a sub-path;
  // manifest start_url/scope and the service worker scope follow it automatically.
  base: '/',
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new service worker waits until the user accepts the update banner.
      registerType: 'prompt',
      injectRegister: false, // registered manually in src/pwa/PwaPrompts.tsx
      includeAssets: ['logo.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Naseej | نَسيج — Connected Healthcare Platform',
        short_name: 'نَسيج',
        description:
          'منصة نسيج الصحية السحابية لربط الملفات الطبية وسجلات المرضى عبر المراكز والمستشفيات المتعددة بأعلى معايير الخصوصية والعزل التام.',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1a1411',
        theme_color: '#1a1411',
        categories: ['medical', 'health', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the static app shell (hashed JS/CSS, HTML, icons).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true, // delete caches from previous precache versions
        clientsClaim: false, // do not take over open tabs mid-session; the update banner controls it
        skipWaiting: false, // new worker waits until the user accepts the update
        // SPA routing: every navigation falls back to the precached shell, except API and file downloads.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Authenticated API traffic is never cached: no stale or cross-user clinical data.
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
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
      devOptions: { enabled: false }, // no service worker during `vite dev`
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
