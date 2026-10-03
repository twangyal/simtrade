export const INSTRUMENTS = [
  { symbol: 'AAPL', name: 'Apple', category: 'Equity', badge: 'A' },
  { symbol: 'INFY', name: 'Infosys', category: 'Equity', badge: 'I' },
  { symbol: 'QQQ', name: 'Invesco QQQ', category: 'ETF', badge: 'Q' },
  { symbol: 'IXIC', name: 'Nasdaq Composite', category: 'Index', badge: 'N' },
  { symbol: 'TRP', name: 'TC Energy', category: 'Equity', badge: 'T' },
  { symbol: 'EUR/USD', name: 'Euro / US Dollar', category: 'Forex', badge: '€' },
  { symbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', category: 'Forex', badge: '¥' },
  { symbol: 'BTC/USD', name: 'Bitcoin / US Dollar', category: 'Crypto', badge: '₿' },
];

export function instrumentDetails(symbol) {
  return INSTRUMENTS.find((item) => item.symbol === symbol) ?? { symbol, name: symbol, category: 'Instrument', badge: symbol?.[0] ?? '?' };
}
