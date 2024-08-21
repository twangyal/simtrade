import React, { useState } from "react";
import Info from "./Info";
import DropdownMenu from "./Dropdown";  
import TradeControls from "./TradeControls";

function Trade() {
    const [selectedOption, setSelectedOption] = useState("BTC/USD");

    const handleOptionSelect = (option) => {
        setSelectedOption(option);
        console.log('Selected option:', option);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
            <div className="w-full max-w-4xl bg-white shadow-lg rounded-lg p-6">
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
    );
}

export default Trade;
