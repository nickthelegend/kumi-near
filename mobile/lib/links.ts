/** Kumi invite links (QR or pasted). Pure, so the unit tests cover them. */
const ACCOUNT = /([a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*\.testnet)/;
/**
 * Accepts kumi://crew/<id> (opens a crew), kumi://invite/<crew>/<account.testnet> (a join code: opens the crew with
 * `/invite <account>` drafted for a member to send), a bare crew id like c-0, or a pasted testnet account id.
 */
export function routeFor(code: string): { path: string; params?: Record<string, string> } | null {
  const t = code.trim();
  let m = /^kumi:\/\/crew\/(\d+)$/.exec(t);
  if (m) return { path: `/chat/c-${m[1]}` };
  m = new RegExp(`^kumi://invite/(\\d+)/${ACCOUNT.source}$`).exec(t);
  if (m) return { path: `/chat/c-${m[1]}`, params: { draft: `/invite ${m[2]}` } };
  m = /^c-(\d+)$/.exec(t);
  if (m) return { path: `/chat/c-${m[1]}` };
  m = new RegExp(`^${ACCOUNT.source}$`).exec(t);
  if (m) return { path: '/chat/c-0', params: { draft: `/invite ${m[1]}` } };
  return null;
}
