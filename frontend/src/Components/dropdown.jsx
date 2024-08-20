// DropdownMenu.jsx

import React, { useState } from 'react';
import '../styles.css';

function DropdownMenu({onOptionSelect}) {
    const [showMenu, setShowMenu] = useState(false);

    const toggleMenu = () => {
        setShowMenu(!showMenu);
    };

    const handleClickOutside = (event) => {
        if (!event.target.closest('.dropdown')) {
            setShowMenu(false);
        }
    };

    React.useEffect(() => {
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    const handleOptionClick = async (option) => {
        setShowMenu(false); // Close the menu after selecting an option
        onOptionSelect(option);
    }

    return (
        <div className="dropdown">
            <button className="dropbtn" onClick={toggleMenu}>
                Dropdown
            </button>
            {showMenu && (
                <div className="dropdown-content">
                    <a href="#AAPL" onClick={() => handleOptionClick("AAPL")}>AAPL</a>
                    <a href="#INFY" onClick={() => handleOptionClick("INFY")}>INFY</a>
                    <a href="#QQQ" onClick={() => handleOptionClick("QQQ")}>QQQ</a>
                    <a href="#IXIC" onClick={() => handleOptionClick("IXIC")}>IXIC</a>
                    <a href="#TRP" onClick={() => handleOptionClick("TRP")}>TRP</a>
                    <a href="#EUR/USD" onClick={() => handleOptionClick("EUR/USD")}>EUR/USD</a>
                    <a href="#USD/JPY" onClick={() => handleOptionClick("USD/JPY")}>USD/JPY</a>
                    <a href="#BTC/USD" onClick={() => handleOptionClick("BTC/USD")}>BTC/USD</a>
                </div>
            )}
        </div>
    );
}

export default DropdownMenu;
