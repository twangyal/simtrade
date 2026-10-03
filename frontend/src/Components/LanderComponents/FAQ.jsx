function Faq() {
    return (
        <section id="faq" className="public-section public-container public-faq" aria-labelledby="public-faq-title">
            <div><p className="public-eyebrow">GOOD TO KNOW</p><h2 id="public-faq-title">A few things<br />before you begin.</h2><p>Practice with a clear understanding of how the simulator works.</p></div>
            <div className="public-faq-list">
                <details><summary>What is paper trading?<span aria-hidden="true">+</span></summary><p>Paper trading lets you practice placing trades and managing a virtual portfolio without risking real money. SimTrade orders are simulated and never sent to an exchange.</p></details>
                <details><summary>Are the prices real?<span aria-hidden="true">+</span></summary><p>The workspace labels its market data mode. Live mode uses provider quotes, which may be delayed. Demo mode uses invented prices for practice. When fresh quotes are unavailable, new trades cannot be placed.</p></details>
                <details><summary>Do I need to deposit money?<span aria-hidden="true">+</span></summary><p>No deposit is needed. Every new account starts with $100,000 in virtual funds. The balance is for practice and cannot be withdrawn.</p></details>
                <details><summary>What can I learn from my portfolio?<span aria-hidden="true">+</span></summary><p>You can review cash, open positions, unrealized gains and losses, and completed trades. Simulated results help you explore a strategy, but do not predict results in real markets.</p></details>
            </div>
        </section>
    );
}

export default Faq;
