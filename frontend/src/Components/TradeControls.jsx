import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import api, { authHeaders, errorMessage } from '../api';

function TradeControls({ selectedOption }) {
    const [shares, setShares] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pending, setPending] = useState(null);
    const submitting = useRef(false);

    const submitOrder = async (side) => {
        if (submitting.current) return;
        setError('');
        setSuccess('');
        const quantity = Number(shares);
        if (!shares.trim() || !Number.isFinite(quantity) || quantity <= 0) {
            setError('Enter a finite quantity greater than zero.');
            return;
        }
        try {
            const headers = authHeaders();
            submitting.current = true;
            setPending(side);
            await api.post(`/${side}`, { symbol: selectedOption, quantity }, { headers });
            setSuccess(`${side === 'BUY' ? 'Buy' : 'Sell'} order for ${quantity} ${selectedOption} completed.`);
            setShares('');
        } catch (error) {
            setError(errorMessage(error, 'Could not confirm the order. Check trade history before trying again.'));
        } finally {
            submitting.current = false;
            setPending(null);
        }
    };

    return (
        <div className="p-4 bg-white shadow-md rounded-lg w-full max-w-md mx-auto" aria-busy={Boolean(pending)}>
            <label htmlFor="trade-quantity" className="block font-medium mb-2">Quantity of {selectedOption}</label>
            <input
                id="trade-quantity"
                type="number"
                min="0"
                step="any"
                value={shares}
                onChange={(event) => { setShares(event.target.value); setError(''); setSuccess(''); }}
                disabled={Boolean(pending)}
                placeholder="Enter quantity"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-600 mt-2">Fractional quantities are supported.</p>
            <div className="flex gap-4 mt-4">
                <button onClick={() => submitOrder('BUY')} disabled={Boolean(pending)}
                    className="bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50">
                    {pending === 'BUY' ? 'Buying…' : 'Buy'}
                </button>
                <button onClick={() => submitOrder('SELL')} disabled={Boolean(pending)}
                    className="bg-red-500 text-white py-2 px-4 rounded-md hover:bg-red-600 disabled:opacity-50">
                    {pending === 'SELL' ? 'Selling…' : 'Sell'}
                </button>
            </div>
            {error && <p role="alert" className="text-red-600 mt-4">{error}</p>}
            {success && <p role="status" className="text-green-700 mt-4">{success}</p>}
        </div>
    );
}

TradeControls.propTypes = { selectedOption: PropTypes.string.isRequired };
export default TradeControls;
