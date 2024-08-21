import React from 'react';
import Header from './LanderComponents/Header';
import Hero from './LanderComponents/Hero';
import Features from './LanderComponents/Features';
import HowItWorks from './LanderComponents/HowItWorks';
import FAQ from './LanderComponents/FAQ';
import Footer from './LanderComponents/Footer';
import './Lander.css';

function Lander() {
    return (
        <div className="Lander">
        <Header />
        <Hero />
        <Features />
        <HowItWorks />
        <FAQ />
        <Footer />
        </div>
    );
}

export default Lander;
