import React from 'react';
import { useNavigate } from 'react-router-dom';

function Hero() {
    const navigate = useNavigate();

    return (
        <section className="relative text-center py-40 bg-cover bg-center" style={{ backgroundImage: `url('/StockImage.jpg')` }}>
            <div className="absolute inset-0 bg-black opacity-60"></div> {/* Semi-transparent overlay */}
            <div className="relative z-10">
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">Master the Market with the Real-Time Paper Trading Simulator</h1>
                <p className="text-lg md:text-2xl text-white mb-8">Practice your trading strategies without risking real money. Simulate real-time market conditions and sharpen your skills.</p>
                <div className="space-x-4">
                    <button className="bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700" onClick={() => navigate('/login')}>Start Trading for Free</button>
                    <button className="bg-transparent border border-white text-white py-3 px-6 rounded-md hover:text-blue-900">Learn More</button>
                </div>
            </div>
        </section>
    );
    
}

export default Hero;
