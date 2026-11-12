import { existsSync, mkdirSync, statSync, rmdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

export const ROOT = resolve(import.meta.dirname, '..');
const orchestration = resolve(ROOT, '../../orchestration');
export const SHOTS = process.env.KUMI_E2E_SHOTS ?? (existsSync(orchestration) ? join(orchestration, 'shots/kumi/r3') : join(tmpdir(), 'kumi-e2e'));
export const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function resources() {
  const disk = process.platform === 'darwin' ? '/System/Volumes/Data' : ROOT;
  const cells = execFileSync('df', ['-Pk', disk], { encoding: 'utf8' }).trim().split('\n').at(-1)!.trim().split(/\s+/);
  if (Number(cells[3]) * 1024 < 5 * 1024 ** 3) throw new Error('BLOCKED: less than 5 GB disk space is free');
  if (process.platform === 'darwin') {
    while (true) {
      const text = execFileSync('memory_pressure', [], { encoding: 'utf8' });
      const free = Number(text.match(/System-wide memory free percentage: (\d+)%/)?.[1] ?? 0);
      if (free >= 30) break;
      console.log(`Waiting for memory: ${free}% free (need 30%)`); await pause(15000);
    }
  }
}
export async function withChromeLock<T>(fn: () => Promise<T>): Promise<T> {
  await resources();
  const official = process.env.KUMI_CHROME_LOCK ?? join(orchestration, 'chrome-lock.mjs');
  if (existsSync(official)) {
    const shared = await import(pathToFileURL(official).href);
    // Avoid missing short gaps between other workers' sessions. The shared helper owns acquisition.
    while (existsSync(shared.LOCK) && Date.now() - statSync(shared.LOCK).mtimeMs < 15 * 60000) await pause(250);
    return shared.withChromeLock(fn);
  }
  const lock = join(tmpdir(), 'kumi-e2e-chrome-lock');
  while (true) { try { mkdirSync(lock); break; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; await pause(500); } }
  try { return await fn(); } finally { rmdirSync(lock); }
}
export async function freePort(port: number) {
  await new Promise<void>((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(port, '127.0.0.1', () => s.close(() => ok())); });
}
function stop(child: ChildProcess) {
  if (!child.pid) return;
  try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ }
}
export async function preview(backendPort: number, run: (base: string) => Promise<void>) {
  const port = Number(process.env.KUMI_E2E_PORT ?? 5356);
  if (port < 5300 || port > 5999) throw new Error('Preview port must be 5300–5999');
  await freePort(port);
  if (!existsSync(join(ROOT, 'packages/web/dist/index.html'))) {
    await resources();
    execFileSync('pnpm', ['--filter', '@kumi/web', 'build'], { cwd: ROOT, stdio: 'inherit' });
  }
  mkdirSync(SHOTS, { recursive: true });
  const child = spawn('pnpm', ['--filter', '@kumi/web', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT, env: { ...process.env, KUMI_SERVER_URL: `http://127.0.0.1:${backendPort}` }, detached: process.platform !== 'win32', stdio: 'ignore',
  });
  const cleanup = () => stop(child); process.once('exit', cleanup);
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(base)).ok) break; } catch { /* starting */ }
      if (i > 100 || child.exitCode !== null) throw new Error('Preview did not start');
      await pause(100);
    }
    await run(base);
  } finally { stop(child); process.off('exit', cleanup); }
}
