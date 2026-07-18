// Sample portfolio data for the full dashboard. There is no live trading
// backend yet, so these are representative placeholder figures. The headline
// total is kept consistent with the landing-page panel (~£10,425).

export const PORTFOLIO = {
  cash: 935.2,
  deposited: 9200,
  lastDeposit: 218,
  todayPct: 4.2,
  todayAbs: 420.1,
  holdings: [
    { sym: 'NVDA', name: 'NVIDIA', shares: 21, price: 132.4, dayPct: 3.1 },
    { sym: 'AAPL', name: 'Apple', shares: 19, price: 221.1, dayPct: 0.7 },
    { sym: 'MSFT', name: 'Microsoft', shares: 3, price: 432.0, dayPct: 1.1 },
    { sym: 'TSLA', name: 'Tesla', shares: 5, price: 242.5, dayPct: -2.3 },
  ],
};

export const WATCHLIST = [
  { sym: 'AMD', name: 'AMD', price: 168.2, dayPct: 2.5 },
  { sym: 'GOOGL', name: 'Alphabet', price: 178.6, dayPct: 0.9 },
  { sym: 'META', name: 'Meta', price: 512.4, dayPct: -0.6 },
  { sym: 'SPY', name: 'S&P 500 ETF', price: 548.1, dayPct: 0.3 },
];

export const HOLDING_COLORS = ['#22d37a', '#5b8cff', '#f2c94c', '#c774f2', '#ff8a5b', '#4dd0e1'];

export function holdingsValue() {
  return PORTFOLIO.holdings.reduce((a, h) => a + h.shares * h.price, 0);
}
export function totalValue() {
  return holdingsValue() + PORTFOLIO.cash;
}
export function totalReturnAbs() {
  return totalValue() - PORTFOLIO.deposited;
}
export function totalReturnPct() {
  return (totalReturnAbs() / PORTFOLIO.deposited) * 100;
}

function series(points, start, end) {
  const arr = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const base = start + (end - start) * t;
    const noise = Math.sin(i * 1.7) * (end - start) * 0.05;
    arr.push(Math.max(0, base + noise));
  }
  arr[arr.length - 1] = end;
  return arr;
}

export function rebuildPerformance() {
  const end = totalValue();
  return {
    '1W': series(7, end * 0.96, end),
    '1M': series(30, end * 0.93, end),
    '1Y': series(52, end * 0.7, end),
    ALL: series(60, end * 0.58, end),
  };
}

export let PERFORMANCE = rebuildPerformance();

export const ACTIVITY = [
  { type: 'BUY', sym: 'NVDA', qty: 5, amount: 650.5, when: '2h ago' },
  { type: 'SELL', sym: 'TSLA', qty: 3, amount: 727.5, when: '5h ago' },
  { type: 'BUY', sym: 'MSFT', qty: 2, amount: 860.0, when: 'Yesterday' },
  { type: 'DIVIDEND', sym: 'AAPL', qty: 0, amount: 12.4, when: '2d ago' },
  { type: 'DEPOSIT', sym: '', qty: 0, amount: 218.0, when: '3d ago' },
];

// Gentle random-walk tick so the UI feels alive when Yahoo is unreachable.
export function tickMarket() {
  const nudge = (obj) => {
    const delta = (Math.random() - 0.48) * obj.price * 0.0015;
    obj.price = Math.max(0.01, +(obj.price + delta).toFixed(2));
    obj.dayPct = +((obj.dayPct || 0) + (Math.random() - 0.5) * 0.04).toFixed(2);
  };
  PORTFOLIO.holdings.forEach(nudge);
  WATCHLIST.forEach(nudge);
  recomputeToday();
  PERFORMANCE = rebuildPerformance();
  return { total: totalValue(), holdings: PORTFOLIO.holdings, watchlist: WATCHLIST };
}

/** Overlay live Yahoo Finance quotes onto sample holdings / watchlist. */
export function applyYahooQuotes(quotes) {
  if (!quotes || typeof quotes !== 'object') return false;
  let hit = 0;
  const apply = (obj) => {
    const q = quotes[obj.sym];
    if (!q || !Number.isFinite(q.price)) return;
    obj.price = +Number(q.price).toFixed(2);
    if (Number.isFinite(q.changePct)) obj.dayPct = +Number(q.changePct).toFixed(2);
    hit += 1;
  };
  PORTFOLIO.holdings.forEach(apply);
  WATCHLIST.forEach(apply);
  if (!hit) return false;
  recomputeToday();
  PERFORMANCE = rebuildPerformance();
  return true;
}

function recomputeToday() {
  const dayMove = PORTFOLIO.holdings.reduce((a, h) => a + h.shares * h.price * (h.dayPct / 100), 0);
  PORTFOLIO.todayAbs = +dayMove.toFixed(2);
  const base = totalValue() - dayMove;
  PORTFOLIO.todayPct = base ? +((dayMove / base) * 100).toFixed(2) : 0;
}

export const TICKER_STOCKS = [
  ['NVDA', +1.8], ['AAPL', +0.7], ['MSFT', +1.1], ['TSLA', -2.3], ['AMZN', +0.4],
  ['GOOGL', +0.9], ['META', -0.6], ['AMD', +2.5], ['SPY', +0.3], ['BTC', -1.2],
];
