import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { clearSession } from '../session';

const Sidebar = ({ isOpen, onClose }) => {
    const navigate = useNavigate();

    if (!isOpen) return null;

    const handleNavigate = (path) => {
        navigate(path);
        onClose();
    };
    const handleLogout = () => {
        clearSession();
        onClose();
        navigate('/login', { replace: true });
    };

    return (
        <div className="fixed top-0 right-0 w-64 h-full bg-white shadow-lg">
            <div className="p-6">
                <button aria-label="Close navigation" className="absolute top-4 right-4 text-xl" onClick={onClose}>X</button>
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

Sidebar.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
};

export default Sidebar;
