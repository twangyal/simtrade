function Features() {
    return (
        <section id="features" className="py-20 bg-gray-100">
        <div className="flex flex-wrap justify-around">
            <div className="w-full md:w-1/3 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Market Quotes</h3>
            <p>Look up supported symbols and review available market prices before placing a simulated trade.</p>
            </div>
            <div className="w-full md:w-1/3 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Portfolio and Trade History</h3>
            <p>Review your virtual holdings, available funds, and completed trades.</p>
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
