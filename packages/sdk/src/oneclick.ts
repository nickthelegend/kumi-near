// NEAR Intents 1Click (mainnet only: Intents has no testnet). Kumi requests `dry: true` quotes,
// which move no funds. A live swap needs a funded NEAR_MAINNET_ACCOUNT; without it the caller
// shows "Setup required". Confidential quotes ("basic"/"advanced") need an ONECLICK_JWT.
export const ONECLICK_API = 'https://1click.chaindefuser.com/v0';
/** Placeholder recipient for dry quotes when no mainnet account is configured; dry quotes never deliver. */
export const DRY_QUOTE_RECIPIENT = 'kumi-dry-quote.near';

export type IntentsToken = { assetId: string; symbol: string; decimals: number; blockchain: string; price?: number; priceUpdatedAt?: string };
export type DryQuote = {
  quote: { amountIn: string; amountInFormatted: string; amountInUsd?: string; amountOut: string; amountOutFormatted: string; amountOutUsd?: string; minAmountOut: string; timeEstimate?: number };
  quoteRequest: Record<string, unknown>;
  signature?: string;
  timestamp?: string;
  dry: true;
  recipient_configured: boolean;
};

async function body(response: Response): Promise<unknown> {
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* text body */ }
  if (!response.ok) {
    const msg = (parsed as { message?: string })?.message ?? text.slice(0, 200);
    throw new Error(`1Click HTTP ${response.status}: ${msg}`);
  }
  return parsed;
}

let tokenCache: { at: number; tokens: IntentsToken[] } | null = null;
export async function getTokens(): Promise<IntentsToken[]> {
  if (tokenCache && Date.now() - tokenCache.at < 60_000) return tokenCache.tokens;
  const tokens = await body(await fetch(`${ONECLICK_API}/tokens`));
  if (!Array.isArray(tokens)) throw new Error('Unexpected 1Click token response');
  tokenCache = { at: Date.now(), tokens: tokens as IntentsToken[] };
  return tokenCache.tokens;
}

const NATIVE_CHAIN: Record<string, string> = { SOL: 'sol', BTC: 'btc', ETH: 'eth', NEAR: 'near', ZEC: 'zec', DOGE: 'doge', XRP: 'xrp' };
/** The 1Click asset for a symbol on its native chain (SOL on Solana, BTC on Bitcoin, ...). */
export async function intentsAssetFor(symbol: string): Promise<string> {
  const tokens = await getTokens();
  const chain = NATIVE_CHAIN[symbol.toUpperCase()];
  const t = tokens.find(x => x.symbol.toUpperCase() === symbol.toUpperCase() && (!chain || x.blockchain === chain))
    ?? tokens.find(x => x.symbol.toUpperCase() === symbol.toUpperCase());
  if (!t) throw new Error(`1Click lists no ${symbol}`);
  return t.assetId;
}

export type DryQuoteRequest = {
  originAsset: string; destinationAsset: string; amount: string;
  recipient?: string; recipientType?: 'INTENTS' | 'DESTINATION_CHAIN';
  confidentiality?: 'public' | 'basic' | 'advanced';
};

export async function dryQuote(request: DryQuoteRequest, jwt?: string): Promise<DryQuote> {
  if (!/^\d+$/.test(request.amount) || BigInt(request.amount) <= 0n) throw new Error('Amount must be a positive integer in minor units');
  if (request.confidentiality && request.confidentiality !== 'public' && !jwt) {
    throw new Error('Setup required: ONECLICK_JWT (1Click only quotes confidential intents for an authenticated partner)');
  }
  const recipient = request.recipient || DRY_QUOTE_RECIPIENT;
  const response = await fetch(`${ONECLICK_API}/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify({
      dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100,
      originAsset: request.originAsset, destinationAsset: request.destinationAsset, amount: request.amount,
      depositType: 'INTENTS', refundTo: recipient, refundType: 'INTENTS',
      recipient, recipientType: request.recipientType ?? 'INTENTS',
      confidentiality: request.confidentiality ?? 'public',
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    }),
  });
  const parsed = await body(response) as Omit<DryQuote, 'dry' | 'recipient_configured'>;
  if (!parsed?.quote?.amountOut) throw new Error('1Click returned no quote');
  return { ...parsed, dry: true, recipient_configured: Boolean(request.recipient) };
}

export const LIVE_SWAP_SETUP = 'Setup required: NEAR_MAINNET_ACCOUNT';
