import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// "Get the app" on the landing: serves the standalone iOS Simulator build that mobile/scripts/build-ios-sim.sh writes,
// plus a small manifest (size, SHA-256 from its .sha256 file, build time). No build there means no manifest, and the
// landing says "Setup required" instead of offering a file that does not exist.
const ZIP = 'Kumi-NEAR-iOS-Simulator.zip';
const OUT = fileURLToPath(new URL('../../mobile/build-out', import.meta.url));

function manifest() {
  const zip = join(OUT, ZIP), sum = `${zip}.sha256`;
  if (!existsSync(zip) || !existsSync(sum)) return null;
  const st = statSync(zip);
  return { file: ZIP, bytes: st.size, sha256: readFileSync(sum, 'utf8').trim().split(/\s+/)[0], builtAt: st.mtime.toISOString(), bundleId: 'xyz.kumi.near', platform: 'iOS Simulator (Apple silicon, arm64)' };
}

export function appDownload(): Plugin {
  // A block body on purpose: a value returned from configureServer would be run by Vite as a post hook.
  const serve = (server: { middlewares: { use: (p: string, h: (req: any, res: any, next: () => void) => void) => unknown } }) => {
    server.middlewares.use('/download', (req, res, next) => {
      const m = manifest();
      if (req.url === '/app.json') {
        res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
        if (!m) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Setup required: run mobile/scripts/build-ios-sim.sh to build the iOS Simulator app.' })); return; }
        res.end(JSON.stringify(m)); return;
      }
      if (req.url === `/${ZIP}` && m) {
        res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Length', String(m.bytes));
        res.setHeader('Content-Disposition', `attachment; filename="${ZIP}"`);
        createReadStream(join(OUT, ZIP)).pipe(res); return;
      }
      next();
    });
  };
  let outDir = 'dist';
  return {
    name: 'kumi-app-download',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    configureServer: serve,
    configurePreviewServer: serve,
    closeBundle() {
      const m = manifest(); if (!m) return;
      mkdirSync(join(outDir, 'download'), { recursive: true });
      copyFileSync(join(OUT, ZIP), join(outDir, 'download', ZIP));
      writeFileSync(join(outDir, 'download', 'app.json'), JSON.stringify(m));
    },
  };
}
