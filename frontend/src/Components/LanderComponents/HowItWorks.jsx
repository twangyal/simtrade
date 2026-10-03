import { Link } from 'react-router-dom';

function HowItWorks() {
    return (
        <section id="how-it-works" className="public-section public-container">
            <div className="public-steps-panel">
                <div className="public-steps-intro"><p className="public-eyebrow">SMALL STEPS. NEW POSSIBILITIES.</p><h2>From curious<br />to hands-on.</h2><p>Give your ideas somewhere to grow.</p><Link className="public-button public-button-mint" to="/register">Create your account <span aria-hidden="true">↗</span></Link></div>
                <ol className="public-steps-list">
                    <li><span className="public-step-number">01</span><div><h3>Make it yours</h3><p>Create a personal account and start with $100,000 in virtual cash.</p></div></li>
                    <li><span className="public-step-number">02</span><div><h3>Explore, then take a position</h3><p>Choose a supported instrument, review its available quote, and place a simulated trade.</p></div></li>
                    <li><span className="public-step-number">03</span><div><h3>Reflect on every move</h3><p>Follow your holdings and review your trade history. Bring what you learn into your next decision.</p></div></li>
                </ol>
            </div>
        </section>
    );
}

export default HowItWorks;
