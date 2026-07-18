// Sample portfolio data for the full dashboard. There is no live trading
// backend yet, so these are representative placeholder figures. The headline
// total is kept consistent with the landing-page panel (~£10,425).

export const PORTFOLIO = {
  cash: 935.2,
  deposited: 9200, // total ever deposited
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

// Colours used for the allocation donut + holding dots (index-aligned).
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

// Deterministic upward-trending series (with gentle noise) for the chart.
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

const end = totalValue();
export const PERFORMANCE = {
  '1W': series(7, end * 0.96, end),
  '1M': series(30, end * 0.93, end),
  '1Y': series(52, end * 0.7, end),
  ALL: series(60, end * 0.58, end),
};

export const ACTIVITY = [
  { type: 'BUY', sym: 'NVDA', qty: 5, amount: 650.5, when: '2h ago' },
  { type: 'SELL', sym: 'TSLA', qty: 3, amount: 727.5, when: '5h ago' },
  { type: 'BUY', sym: 'MSFT', qty: 2, amount: 860.0, when: 'Yesterday' },
  { type: 'DIVIDEND', sym: 'AAPL', qty: 0, amount: 12.4, when: '2d ago' },
  { type: 'DEPOSIT', sym: '', qty: 0, amount: 218.0, when: '3d ago' },
];
