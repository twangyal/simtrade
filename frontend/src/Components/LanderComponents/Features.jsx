import React from 'react';

function Features() {
    return (
        <section id="features" className="py-20 bg-gray-100">
        <div className="flex flex-wrap justify-around">
            <div className="w-full md:w-1/3 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Real-Time Data</h3>
            <p>Access real-time market data and simulate trades as if you're trading live.</p>
            </div>
            <div className="w-full md:w-1/3 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Comprehensive Analytics</h3>
            <p>Track your performance with detailed analytics and reports.</p>
            </div>
            <div className="w-full md:w-1/3 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Customizable Strategies</h3>
            <p>Experiment with different trading strategies to see what works best.</p>
            </div>
        </div>
        </section>
    );
}

export default Features;
