import React from 'react';

function Header() {
    return (
        <header className="flex justify-between items-center p-6 bg-gray-800 text-white">
        <div className="text-xl font-bold">PaperTradeSim</div>
        <nav className="space-x-6">
            <a href="#features" className="hover:underline">Features</a>
            <a href="#faq" className="hover:underline">FAQs</a>
            <a href="#contact" className="hover:underline">Contact</a>
        </nav>
        </header>
    );
}

export default Header;
