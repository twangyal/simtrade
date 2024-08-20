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
        <div>
            <DropdownMenu onOptionSelect={handleOptionSelect}/>
            <Info instrumentSelect={selectedOption}/>
            <TradeControls selectedOption={selectedOption} />
        </div>
    );
}

export default Trade;