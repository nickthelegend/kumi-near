// Token and protocol logos, bundled from @web3icons/core (MIT, https://github.com/0xa3k5/web3icons).
// Rendered as <img> data URIs so each SVG's internal gradient ids stay scoped.
// Sputnik DAO and NEAR Intents have no licensed mark in the package, so they get neutral Kumi glyphs with labels.
import NEAR from '@web3icons/core/svgs/tokens/branded/NEAR.svg.js';
import SOL from '@web3icons/core/svgs/tokens/branded/SOL.svg.js';
import BTC from '@web3icons/core/svgs/tokens/branded/BTC.svg.js';
import ETH from '@web3icons/core/svgs/tokens/branded/ETH.svg.js';
import USDC from '@web3icons/core/svgs/tokens/branded/USDC.svg.js';
import ZEC from '@web3icons/core/svgs/tokens/branded/ZEC.svg.js';
import nearNet from '@web3icons/core/svgs/networks/branded/near-protocol.svg.js';
import solanaNet from '@web3icons/core/svgs/networks/branded/solana.svg.js';
import bitcoinNet from '@web3icons/core/svgs/networks/branded/bitcoin.svg.js';
import ethereumNet from '@web3icons/core/svgs/networks/branded/ethereum.svg.js';
import baseNet from '@web3icons/core/svgs/networks/branded/base.svg.js';
import arbitrumNet from '@web3icons/core/svgs/networks/branded/arbitrum-one.svg.js';

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const TOKENS: Record<string, string> = { NEAR: uri(NEAR), WNEAR: uri(NEAR), SOL: uri(SOL), BTC: uri(BTC), ETH: uri(ETH), USDC: uri(USDC), ZEC: uri(ZEC) };
const CHAINS: Record<string, string> = { near: uri(nearNet), sol: uri(solanaNet), btc: uri(bitcoinNet), eth: uri(ethereumNet), base: uri(baseNet), arb: uri(arbitrumNet) };

/** A token logo in a round white chip. `test` adds a small badge: a testnet pool token, not the mainnet asset. */
export function TokenLogo({ sym, size = 28, test, title }: { sym: string; size?: number; test?: boolean; title?: string }) {
  const s = sym.replace(/^t(?=[A-Z])/, '').toUpperCase();
  const src = TOKENS[s];
  const label = title ?? `${test ? 'Test ' : ''}${s}${test ? ' (testnet pool token)' : ''}`;
  return <span className={`tlogo ${test ? 'tlogo-test' : ''} ${size < 22 ? 'tlogo-sm' : ''}`} style={{ width: size, height: size }} title={label} role="img" aria-label={label}>
    {src ? <img src={src} alt="" /> : <b style={{ fontSize: size * 0.32 }}>{s.slice(0, 4)}</b>}
    {test && <i>test</i>}
  </span>;
}

export function ChainLogo({ chain, size = 20 }: { chain: string; size?: number }) {
  const src = CHAINS[chain];
  return src ? <img className="clogo" src={src} alt={chain} width={size} height={size} /> : null;
}

/** NEAR protocol mark (network logo from @web3icons/core). */
export const NearMark = ({ size = 18 }: { size?: number }) => <img className="clogo" src={CHAINS.near} alt="NEAR" width={size} height={size} />;

/** Neutral glyphs, labelled where they appear: no official Sputnik DAO or NEAR Intents mark is used. */
export const DaoGlyph = ({ size = 18 }: { size?: number }) => <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18" /></svg>;
export const IntentsGlyph = ({ size = 18 }: { size?: number }) => <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h11l-3-3M20 17H9l3 3M15 7l5 0M4 17h5" /></svg>;
