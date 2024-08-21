import React, { useState, useEffect, useRef } from 'react';

function DropdownMenu({ onOptionSelect }) {
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);

    const toggleMenu = () => {
        setShowMenu(!showMenu);
    };

    const handleClickOutside = (event) => {
        if (
            menuRef.current &&
            !menuRef.current.contains(event.target) &&
            buttonRef.current &&
            !buttonRef.current.contains(event.target)
        ) {
            setShowMenu(false);
        }
    };

    useEffect(() => {
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    const handleOptionClick = (option) => {
        setShowMenu(false); // Close the menu after selecting an option
        onOptionSelect(option);
    };

    return (
        <div className="relative inline-block text-left">
            <button
                ref={buttonRef}
                className="inline-flex items-center px-4 py-2 text-white bg-blue-500 hover:bg-blue-600 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={toggleMenu}
            >
                Dropdown
                <svg className="ml-2 w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {showMenu && (
                <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                    <div className="py-1">
                        {['AAPL', 'INFY', 'QQQ', 'IXIC', 'TRP', 'EUR/USD', 'USD/JPY', 'BTC/USD'].map((option) => (
                            <a
                                key={option}
                                href={`#${option}`}
                                onClick={() => {
                                    handleOptionClick(option);
                                }}
                                className="block px-4 py-2 text-gray-700 hover:bg-gray-100 hover:text-blue-600"
                            >
                                {option}
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default DropdownMenu;
