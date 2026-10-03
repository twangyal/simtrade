import { useState } from "react";
import Info from "./Info";
import DropdownMenu from "./dropdown";
import TradeControls from "./TradeControls";
import Sidebar from "./Sidebar";
import MarketStatus from "./MarketStatus";

function Trade() {
    const [selectedOption, setSelectedOption] = useState("BTC/USD");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    const handleOptionSelect = (option) => {
        setSelectedOption(option);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6 relative">
            {/* Sidebar */}
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Sidebar Toggle Button */}
            <button aria-label="Open navigation" aria-expanded={sidebarOpen}
                className={`fixed top-4 right-4 text-2xl text-gray-600 transition-transform duration-300 ease-in-out ${sidebarOpen ? 'invisible' : 'opacity-100'}`}
                onClick={toggleSidebar}
            >
                &#9776;
            </button>
        <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl bg-white shadow-lg rounded-lg p-6">
                <MarketStatus selectedSymbol={selectedOption} />
                {/* Dropdown Menu Section */}
                <div className="mb-6">
                    <DropdownMenu onOptionSelect={handleOptionSelect} />
                </div>

                {/* Info Section */}
                <div className="mb-6">
                    <Info instrumentSelect={selectedOption} />
                </div>

                {/* Trade Controls Section */}
                <div className="flex flex-col items-center lg:flex-row lg:justify-between lg:items-start">
                    <TradeControls selectedOption={selectedOption} />
                </div>
            </div>
        </div>
        </div>
    );
}

export default Trade;
