import React from 'react';
import { useNavigate } from 'react-router-dom';

const Sidebar = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    const handleNavigate = (path) => {
        navigate(path);
        onClose();
    };
    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        navigate('/login');
    };

    return (
        <div className={`fixed top-0 right-0 w-64 h-full bg-white shadow-lg transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out`}>
            <div className="p-6">
                <button className="absolute top-4 right-4 text-xl" onClick={onClose}>X</button>
                <div className="mt-8">
                    <button onClick={() => handleNavigate('/dashboard')} className="block w-full text-left py-2 px-4 hover:bg-gray-200">Home</button>
                    <button onClick={() => handleNavigate('/trade')} className="block w-full text-left py-2 px-4 hover:bg-gray-200">Trade</button>
                    <button onClick={() => handleNavigate('/trade-history')} className="block w-full text-left py-2 px-4 hover:bg-gray-200">View Trade History</button>
                    <button onClick={() => handleLogout()} className="block w-full text-left py-2 px-4 hover:bg-gray-200">Log Out</button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
