import { Link } from 'react-router-dom';

function Hero() {
    return (
        <section className="relative text-center py-40 bg-cover bg-center" style={{ backgroundImage: `url('/StockImage.jpg')` }}>
            <div className="absolute inset-0 bg-black opacity-60"></div> {/* Semi-transparent overlay */}
            <div className="relative z-10">
                <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">Practice Trading Without Risking Real Money</h1>
                <p className="text-lg md:text-2xl text-white mb-8">Build a virtual portfolio, place simulated trades, and review your trading activity.</p>
                <div className="space-x-4">
                    <Link className="inline-block bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700" to="/register">Start Trading for Free</Link>
                    <a className="inline-block bg-transparent border border-white text-white py-3 px-6 rounded-md hover:text-blue-900" href="#how-it-works">Learn More</a>
                </div>
            </div>
        </section>
    );
    
}

export default Hero;
