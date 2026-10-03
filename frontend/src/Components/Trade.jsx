import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Info from './Info';
import DropdownMenu from './dropdown';
import TradeControls from './TradeControls';
import AppShell from './AppShell';
import Icon from './Icon';
import MarketStatus from './MarketStatus';
import { INSTRUMENTS, instrumentDetails } from '../instruments';

export default function Trade() {
    const [quote, setQuote] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedSymbol = searchParams.get('symbol');
    const selectedOption = INSTRUMENTS.some((item) => item.symbol === requestedSymbol) ? requestedSymbol : 'BTC/USD';
    const instrument = instrumentDetails(selectedOption);

    return <AppShell section="Trade">
        <div className="page-heading"><div><p className="eyebrow">TURN CURIOSITY INTO EXPERIENCE</p><h1>Make your next move.</h1><p className="page-description">Follow the quotes. Explore an idea. Find your rhythm.</p></div><span className="subtle-label"><Icon name="shield" size={16} />Simulated execution</span></div>
        <MarketStatus selectedSymbol={selectedOption} />
        <div className="instrument-toolbar"><div className="selected-instrument"><span className={`asset-badge asset-${instrument.category.toLowerCase()}`} aria-hidden="true">{instrument.badge}</span><div><h2>{instrument.name}</h2><span>{instrument.symbol}<span aria-hidden="true"> · </span>{instrument.category}</span></div></div><DropdownMenu selectedOption={selectedOption} onOptionSelect={(symbol) => setSearchParams({ symbol }, { replace: true })} /></div>
        <a className="mobile-order-link" href="#order-ticket">Jump to order ticket <span aria-hidden="true">↓</span></a>
        <div className="trading-grid"><Info instrumentSelect={selectedOption} onQuote={setQuote} /><div className="order-column" id="order-ticket" tabIndex={-1}><TradeControls selectedOption={selectedOption} quote={quote?.symbol === selectedOption ? quote : null} /><div className="trade-guidance"><Icon name="shield" size={19} /><div><strong>A place to practice</strong><p>Buys use the ask and sells use the bid when available. Final execution can differ from the last quote shown.</p><p>Selling more than you own opens a short position. Short positions can lose value as prices rise.</p></div></div></div></div>
    </AppShell>;
}
