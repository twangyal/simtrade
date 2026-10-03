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
            <p>Start with virtual funds and choose the supported stocks you want to trade.</p>
            </div>
            <div className="w-full md:w-1/4 p-6 text-center">
            <h3 className="text-xl font-semibold mb-4">Simulate Trades</h3>
            <p>Place simulated buy and sell orders using available market quotes.</p>
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
