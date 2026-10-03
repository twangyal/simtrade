import { Link } from 'react-router-dom';
import Brand from './Brand';

function Header() {
    return (
        <header className="public-header public-container">
            <Brand />
            <nav className="public-nav" aria-label="Main navigation">
                <a href="#features">Features</a>
                <a href="#how-it-works">How it works</a>
                <a href="#faq">FAQs</a>
            </nav>
            <div className="public-header-actions">
                <Link className="public-login-link" to="/login">Log in</Link>
                <Link className="public-button public-button-small" to="/register">Get started <span aria-hidden="true">↗</span></Link>
            </div>
        </header>
    );
}

export default Header;
