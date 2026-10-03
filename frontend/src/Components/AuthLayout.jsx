import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Brand from './LanderComponents/Brand';
import './Lander.css';
import './public-ui.css';

function AuthLayout({ children, registering = false }) {
    return (
        <div className="auth-page">
            <div className="auth-main">
                <header className="auth-header"><Brand /><Link className="auth-back-link" to="/"><span aria-hidden="true">←</span> Back to home</Link></header>
                <main className="auth-form-region">
                    <div className="auth-form-card">
                        <p className="public-eyebrow">YOUR PRACTICE STARTS HERE</p>
                        {children}
                    </div>
                </main>
                <footer className="auth-footer">Virtual funds. Real room to learn.</footer>
            </div>
            <aside className="auth-story" aria-label="About paper trading">
                <span className="auth-story-kicker"><span className="public-status-dot" /> THE SIMTRADE WAY</span>
                <div className="auth-story-copy"><h2>{registering ? 'Your ideas deserve a little room to grow.' : 'Great instincts start with a little practice.'}</h2><p>A thoughtful space to explore the markets, learn from your decisions, and find your own approach.</p></div>
                <div className="auth-funds-card"><span>YOUR STARTING VIRTUAL FUNDS</span><strong>$100,000<span>.00</span></strong><p>Every new account. No deposit needed.</p><div className="auth-funds-divider" /><div className="auth-funds-benefit"><span aria-hidden="true">✓</span> Explore supported instruments</div><div className="auth-funds-benefit"><span aria-hidden="true">✓</span> Build and review your portfolio</div><div className="auth-funds-benefit"><span aria-hidden="true">✓</span> Practice at your own pace</div></div>
                <p className="auth-story-disclaimer">All trades are simulated. No real money is at risk.</p>
            </aside>
        </div>
    );
}

AuthLayout.propTypes = { children: PropTypes.node.isRequired, registering: PropTypes.bool };

export default AuthLayout;
