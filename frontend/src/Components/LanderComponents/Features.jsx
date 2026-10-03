function Features() {
    return (
        <section id="features" className="public-section public-features">
            <div className="public-container">
                <div className="public-section-heading">
                    <div><p className="public-eyebrow">A CLEARER VIEW</p><h2>Everything you need<br />to find your footing.</h2></div>
                    <p>Less noise, more understanding. Keep your markets, decisions, and portfolio in one thoughtful workspace.</p>
                </div>
                <div className="public-feature-grid">
                    <article className="public-feature-card"><span className="public-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19H20M8 14L12 10L15 12L20 6" /></svg></span><h3>Follow the market</h3><p>Watch incoming quotes for supported instruments. The workspace makes demo, live, and unavailable data easy to distinguish.</p><span className="public-feature-tag">Quotes in context</span></article>
                    <article className="public-feature-card"><span className="public-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="14" rx="3" /><path d="M8 6V4H16V6M4 12H20M10 12V15H14V12" /></svg></span><h3>Know where you stand</h3><p>See your available cash, open positions, and unrealized gains and losses. Understand how each decision shapes your portfolio.</p><span className="public-feature-tag">Your portfolio, clearly</span></article>
                    <article className="public-feature-card"><span className="public-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7H18L15 4M20 17H6L9 20M18 7L15 10M6 17L9 14" /></svg></span><h3>Learn by doing</h3><p>Place simulated buy and sell orders, including fractional quantities. Revisit your completed trades and refine your approach.</p><span className="public-feature-tag">Practice with purpose</span></article>
                </div>
            </div>
        </section>
    );
}

export default Features;
