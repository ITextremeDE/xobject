import {webBuildId} from '../../scripts/web-build-id.ts';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
const buildId=webBuildId();
export default defineConfig({ define:{__XOBJECT_BUILD__:JSON.stringify(buildId)}, build: { emptyOutDir: true }, plugins: [react(), tailwindcss(),{name:'xobject-build',transformIndexHtml(html){return html.replace('</head>',`<meta name="xobject-build" content="${buildId}" /></head>`);}}], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } });
