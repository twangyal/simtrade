import React from 'react';

function HowItWorks() {
    return (
        <section id="how-it-works" className="py-20 bg-white">
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">How It Works</h2>
        </div>
        <div className="flex flex-wrap justify-around">
            <div className="w-full md:w-1/4 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Create an Account</h3>
            <p>Sign up in seconds and get started.</p>
            </div>
            <div className="w-full md:w-1/4 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Set Up Your Portfolio</h3>
            <p>Choose your starting capital and select the stocks or assets you want to trade.</p>
            </div>
            <div className="w-full md:w-1/4 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Simulate Trades</h3>
            <p>Make trades based on real-time data and see how your decisions play out.</p>
            </div>
            <div className="w-full md:w-1/4 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Review Performance</h3>
            <p>Analyze your trades and refine your strategies.</p>
            </div>
        </div>
        </section>
    );
}

export default HowItWorks;
