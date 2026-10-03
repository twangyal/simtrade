import { Link } from 'react-router-dom';

function Hero() {
    return (
        <section className="public-hero public-container" aria-labelledby="public-hero-title">
            <div className="public-hero-copy">
                <p className="public-eyebrow"><span className="public-status-dot" /> A little practice. A lot of perspective.</p>
                <h1 id="public-hero-title">Your next move,<br /><span>without the risk.</span></h1>
                <p className="public-hero-description">Build your market instincts with $100,000 in virtual funds. Explore instruments, practice a strategy, and make every trade a learning experience.</p>
                <div className="public-hero-actions">
                    <Link className="public-button" to="/register">Start practicing <span aria-hidden="true">↗</span></Link>
                    <a className="public-text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
                </div>
                <p className="public-reassurance"><span aria-hidden="true">✓</span> Virtual money. Real room to learn.</p>
            </div>
            <div className="public-hero-art" aria-label="Every new paper trading account starts with 100,000 virtual dollars">
                <div className="public-orbit public-orbit-one" aria-hidden="true" />
                <div className="public-orbit public-orbit-two" aria-hidden="true" />
                <div className="public-start-card">
                    <div className="public-start-card-top"><span className="public-card-label">YOUR STARTING POINT</span><span className="public-virtual-badge">PAPER ACCOUNT</span></div>
                    <p className="public-start-amount">$100,000<span>.00</span></p>
                    <p className="public-start-caption">Virtual funds. Yours to explore.</p>
                    <div className="public-practice-path" aria-hidden="true">
                        <span className="public-path-dot public-path-dot-one" />
                        <span className="public-path-dot public-path-dot-two" />
                        <span className="public-path-dot public-path-dot-three" />
                        <svg viewBox="0 0 340 95" fill="none"><path d="M8 75H67Q81 75 81 61V40Q81 26 95 26H157Q171 26 171 40V48Q171 62 185 62H234Q248 62 248 48V23Q248 9 262 9H333" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" /></svg>
                    </div>
                    <div className="public-card-bottom"><span>Your ideas. Your pace.</span><span className="public-card-arrow" aria-hidden="true">↗</span></div>
                </div>
                <div className="public-learning-note"><span className="public-note-icon" aria-hidden="true">✦</span><div><strong>A space to experiment</strong><span>No real money at stake</span></div></div>
                <span className="public-art-caption">A fresh start for every new account.</span>
            </div>
        </section>
    );
}

export default Hero;
