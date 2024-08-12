// DropdownMenu.jsx

import React, { useState } from 'react';
import '../styles.css';

function DropdownMenu() {
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

        let url = '';
        switch (option) {
            case 'AAPL':
                url = "http://127.0.0.1:8000/change_instrument/0";
                break;
            case 'INFY':
                url = "http://127.0.0.1:8000/change_instrument/1";
                break;
            case 'QQQ':
                url = "http://127.0.0.1:8000/change_instrument/2";
                break;
            case 'IXIC':
                url = "http://127.0.0.1:8000/change_instrument/3";
                break;
            case 'TRP':
                url = "http://127.0.0.1:8000/change_instrument/4";
                break;
            case 'EUR/USD':
                url = "http://127.0.0.1:8000/change_instrument/5";
                break;
            case 'USD/JPY':
                url = "http://localhost:8000/change_instrument/6";
                break;
            case 'ETH/BTC':
                url = "http://127.0.0.1:8000/change_instrument/7";
                break;
            case 'BTC/USD':
                url = "http://127.0.0.1:8000/change_instrument/8";
                break;
            default:
                console.error('Invalid option:', option);
                return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            console.log(`Data for ${option}:`, data);
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    return (
        <div className="dropdown">
            <button className="dropbtn" onClick={toggleMenu}>
                Dropdown
            </button>
            {showMenu && (
                <div className="dropdown-content">
                    <a href="#option1" onClick={() => handleOptionClick("AAPL")}>AAPL</a>
                    <a href="#option2" onClick={() => handleOptionClick("INFY")}>INFY</a>
                    <a href="#option3" onClick={() => handleOptionClick("QQQ")}>QQQ</a>
                    <a href="#option4" onClick={() => handleOptionClick("IXIC")}>IXIC</a>
                    <a href="#option5" onClick={() => handleOptionClick("TRP")}>TRP</a>
                    <a href="#option6" onClick={() => handleOptionClick("EUR/USD")}>EUR/USD</a>
                    <a href="#option7" onClick={() => handleOptionClick("USD/JPY")}>USD/JPY</a>
                    <a href="#option8" onClick={() => handleOptionClick("ETH/BTC")}>ETH/BTC</a>
                    <a href="#option9" onClick={() => handleOptionClick("BTC/USD")}>BTC/USD</a>
                </div>
            )}
        </div>
    );
}

export default DropdownMenu;
