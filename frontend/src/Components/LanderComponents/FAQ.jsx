import React from 'react';

function FAQ() {
    return (
        <section id="faq" className="py-20 bg-gray-100">
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">What is a paper trading simulator?</h4>
            <p className="ml-4">A paper trading simulator allows you to practice trading without risking real money by simulating real market conditions.</p>
            </div>
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">How does the real-time data work?</h4>
            <p className="ml-4">The simulator uses websockets and financial data APIs to simulate trades as they happen in the real world.</p>
            </div>
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">Is the simulator free to use?</h4>
            <p className="ml-4">Yes, completely free!</p>
            </div>
        </div>
        </section>
    );
}

export default FAQ;
