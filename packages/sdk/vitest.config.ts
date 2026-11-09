import { defineConfig } from 'vitest/config';
// @near-js ESM builds use extensionless imports; let Vite resolve them instead of Node.
export default defineConfig({ test: { server: { deps: { inline: [/@near-js/, /near-api-js/] } } } });
