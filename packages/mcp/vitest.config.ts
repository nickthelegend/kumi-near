import { defineConfig } from 'vitest/config';
// @near-js ESM builds use extensionless imports; let Vite resolve them instead of Node.
// Live tests hit public NEAR RPC, which rate-limits bursts (HTTP 429): retry a failed test twice.
export default defineConfig({ test: { retry: 2, server: { deps: { inline: [/@near-js/, /near-api-js/] } } } });
