function Faq() {
    return (
        <section id="faq" className="py-20 bg-gray-100">
        <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
        </div>
        <div className="space-y-8 max-w-4xl mx-auto">
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">What is a paper trading simulator?</h4>
            <p className="ml-4">A paper trading simulator lets you practice placing trades and managing a virtual portfolio without risking real money.</p>
            </div>
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">How do market quotes work?</h4>
            <p className="ml-4">Market quotes depend on data provider availability and may be delayed. Trades use virtual funds and do not place real market orders.</p>
            </div>
            <div className="faq-item">
            <h4 className="text-xl font-semibold mb-2">Is the simulator free to use?</h4>
            <p className="ml-4">Yes, completely free!</p>
            </div>
        </div>
        </section>
    );
}

export default Faq;
