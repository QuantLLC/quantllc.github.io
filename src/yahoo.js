// Live market quotes from Yahoo Finance for the top ticker (and dashboard sync).
// Yahoo's endpoints block browser CORS, so we try a short list of public CORS
// proxies after a direct attempt. Results are cached briefly to avoid hammering.

export const TICKER_SYMBOLS = [
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD', 'SPY', 'BTC-USD',
];

const CACHE_KEY = 'quant.yahoo.quotes';
const CACHE_MS = 60_000;

function yahooQuoteUrl(symbols) {
  const list = symbols.join(',');
  return `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list)}&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketChange`;
}

function yahooChartUrl(symbol) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
}

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function fetchViaProxies(targetUrl) {
  const proxies = [
    (u) => u, // direct first (works in some environments / extensions)
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
  ];
  let lastErr;
  for (const build of proxies) {
    try {
      const text = await fetchText(build(targetUrl));
      if (text && text.length > 10) return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All quote fetches failed');
}

function parseQuotePayload(text) {
  const json = JSON.parse(text);
  const results = (json.quoteResponse && json.quoteResponse.result) || [];
  const map = {};
  results.forEach((q) => {
    if (!q || !q.symbol) return;
    const sym = q.symbol === 'BTC-USD' ? 'BTC' : q.symbol;
    map[sym] = {
      symbol: sym,
      name: q.shortName || q.longName || sym,
      price: Number(q.regularMarketPrice),
      changePct: Number(q.regularMarketChangePercent),
      change: Number(q.regularMarketChange),
    };
  });
  return map;
}

async function fetchOneChart(symbol) {
  const text = await fetchViaProxies(yahooChartUrl(symbol));
  const json = JSON.parse(text);
  const meta = json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error('No chart meta for ' + symbol);
  const price = Number(meta.regularMarketPrice);
  const prev = Number(meta.chartPreviousClose || meta.previousClose || price);
  const changePct = prev ? ((price - prev) / prev) * 100 : 0;
  const sym = symbol === 'BTC-USD' ? 'BTC' : symbol;
  return {
    symbol: sym,
    name: meta.shortName || sym,
    price,
    changePct,
    change: price - prev,
  };
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!raw || !raw.at || Date.now() - raw.at > CACHE_MS) return null;
    return raw.quotes || null;
  } catch {
    return null;
  }
}

function writeCache(quotes) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), quotes }));
  } catch { /* ignore */ }
}

/**
 * Fetch live quotes for the ticker symbols.
 * @returns {Promise<Record<string, {symbol,name,price,changePct,change}>>}
 */
export async function fetchYahooQuotes(symbols = TICKER_SYMBOLS) {
  const cached = readCache();
  if (cached) return cached;

  // Prefer batch quote endpoint
  try {
    const text = await fetchViaProxies(yahooQuoteUrl(symbols));
    const map = parseQuotePayload(text);
    if (Object.keys(map).length) {
      writeCache(map);
      return map;
    }
  } catch {
    // fall through to per-symbol charts
  }

  const map = {};
  // Limit concurrency a bit
  for (const sym of symbols) {
    try {
      const q = await fetchOneChart(sym);
      map[q.symbol] = q;
    } catch {
      /* skip symbol */
    }
  }
  if (Object.keys(map).length) writeCache(map);
  return map;
}

/** Convert quotes map → ticker cells [[sym, changePct, price], ...] */
export function quotesToTicker(quotes) {
  return TICKER_SYMBOLS.map((raw) => {
    const sym = raw === 'BTC-USD' ? 'BTC' : raw;
    const q = quotes[sym];
    if (!q || Number.isNaN(q.changePct)) return [sym, 0, null];
    const price = Number.isFinite(q.price) ? q.price : null;
    return [sym, +Number(q.changePct).toFixed(2), price];
  });
}

/** Symbols used by dashboard holdings + watchlist (Yahoo format). */
export function portfolioYahooSymbols(holdings = [], watchlist = []) {
  const set = new Set(TICKER_SYMBOLS);
  [...holdings, ...watchlist].forEach((row) => {
    if (!row || !row.sym) return;
    set.add(row.sym === 'BTC' ? 'BTC-USD' : row.sym);
  });
  return Array.from(set);
}
