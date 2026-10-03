import { Link } from 'react-router-dom';
import Brand from './Brand';

function Footer() {
    return (
        <footer className="public-footer">
            <div className="public-container public-footer-top"><div><Brand /><p>A little practice goes a long way.</p></div><nav aria-label="Account"><Link to="/register">Create an account</Link><Link to="/login">Log in</Link><a href="#faq">FAQs</a></nav></div>
            <div className="public-container public-footer-bottom"><span>© {new Date().getFullYear()} SimTrade</span><span>Paper trading only. No real money. No financial advice.</span></div>
        </footer>
    );
}

export default Footer;
