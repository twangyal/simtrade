import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer className="bg-gray-800 text-white py-8">
        <div className="footer-content flex flex-wrap justify-around text-center">
            <div className="mb-6 md:mb-0">
            <h4 className="text-lg font-semibold">PaperTradeSim</h4>
            <p>Practice trading with virtual funds.</p>
            </div>
            <div>
            <h4 className="text-lg font-semibold">Start Practicing</h4>
            <nav aria-label="Account" className="mt-4 space-x-6">
                <Link to="/register" className="hover:underline">Create an Account</Link>
                <Link to="/login" className="hover:underline">Log In</Link>
            </nav>
            </div>
        </div>
        <div className="footer-bottom text-center mt-6 pt-4 border-t border-gray-600">
            &copy; {new Date().getFullYear()} PaperTradeSim. All Rights Reserved.
        </div>
        </footer>
    );
}

export default Footer;
