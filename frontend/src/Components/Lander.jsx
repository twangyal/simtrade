import Header from './LanderComponents/Header';
import Hero from './LanderComponents/Hero';
import Features from './LanderComponents/Features';
import HowItWorks from './LanderComponents/HowItWorks';
import FAQ from './LanderComponents/FAQ';
import Footer from './LanderComponents/Footer';
import './Lander.css';

function Lander() {
    return (
        <div className="public-site">
            <a className="public-skip-link" href="#public-main">Skip to content</a>
            <Header />
            <main id="public-main">
                <Hero />
                <Features />
                <HowItWorks />
                <FAQ />
            </main>
            <Footer />
        </div>
    );
}

export default Lander;
