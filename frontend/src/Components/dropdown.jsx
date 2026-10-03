import PropTypes from 'prop-types';

function DropdownMenu({ onOptionSelect }) {
    return (
        <div>
            <label htmlFor="instrument" className="block font-medium mb-2">Instrument</label>
            <select id="instrument" defaultValue="BTC/USD" onChange={(event) => onOptionSelect(event.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500">
                {['AAPL', 'INFY', 'QQQ', 'IXIC', 'TRP', 'EUR/USD', 'USD/JPY', 'BTC/USD'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </div>
    );
}

DropdownMenu.propTypes = { onOptionSelect: PropTypes.func.isRequired };
export default DropdownMenu;
