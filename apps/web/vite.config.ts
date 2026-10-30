import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
// Keep content-hashed assets for already open local clients; CI/explicit clean builds start fresh.
export default defineConfig({ build: { emptyOutDir: process.env.CI === 'true' || process.env.XOBJECT_CLEAN_BUILD === '1' }, plugins: [react(), tailwindcss()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } });
