import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

// Temporary: same app, API proxied to the verification mock on 5100. Deleted after verification.
export default mergeConfig(base, defineConfig({ server: { port: 3100, strictPort: true, proxy: { '/api': { target: 'http://localhost:5100', changeOrigin: true } } } }));
