import { defineConfig } from "astro/config";
export default defineConfig({ site: "https://xobject.org", output: "static", vite: { build: { assetsInlineLimit: 0 } } });
