import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import api, { authHeaders, errorMessage } from '../api';

const CHECK_HISTORY = 'The earlier order result is uncertain. Check trade history before placing another order.';

function createOrderId() {
    const secureCrypto = globalThis.crypto;
    if (typeof secureCrypto?.randomUUID === 'function') return secureCrypto.randomUUID();
    if (typeof secureCrypto?.getRandomValues !== 'function') return null;
    const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function TradeControls({ selectedOption }) {
    const [shares, setShares] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [pending, setPending] = useState(null);
    const [retryNotice, setRetryNotice] = useState('');
    const submitting = useRef(false);
    const retryOrder = useRef(null);

    useEffect(() => {
        retryOrder.current = null;
        setRetryNotice((notice) => notice ? CHECK_HISTORY : '');
    }, [selectedOption]);

    const changeQuantity = (event) => {
        const value = event.target.value;
        if (retryOrder.current && (!value.trim() || Number(value) !== retryOrder.current.quantity)) {
            retryOrder.current = null;
            setRetryNotice((notice) => notice ? CHECK_HISTORY : '');
        }
        setShares(value);
        setError('');
        setSuccess('');
    };

    const submitOrder = async (side) => {
        if (submitting.current) return;
        setError('');
        setSuccess('');
        const quantity = Number(shares);
        if (!shares.trim() || !Number.isFinite(quantity) || quantity <= 0) {
            setError('Enter a finite quantity greater than zero.');
            return;
        }
        let attempt;
        let sent = false;
        try {
            const headers = authHeaders();
            attempt = retryOrder.current;
            if (!attempt || attempt.side !== side || attempt.symbol !== selectedOption || attempt.quantity !== quantity) {
                const id = createOrderId();
                if (!id) {
                    setError('A secure order ID could not be generated. Please use a browser with secure cryptography support.');
                    return;
                }
                attempt = { id, side, symbol: selectedOption, quantity, uncertain: false };
                retryOrder.current = attempt;
            }
            submitting.current = true;
            setPending(side);
            setRetryNotice('');
            sent = true;
            await api.post(`/${side}`, { symbol: selectedOption, quantity, client_order_id: attempt.id }, { headers });
            if (retryOrder.current === attempt) retryOrder.current = null;
            setSuccess(`${side === 'BUY' ? 'Buy' : 'Sell'} order for ${quantity} ${selectedOption} completed.`);
            setShares('');
        } catch (error) {
            const status = error.response?.status;
            const rejected = status >= 400 && status < 500;
            if (sent && rejected && !attempt.uncertain) {
                if (retryOrder.current === attempt) retryOrder.current = null;
            } else if (sent) {
                attempt.uncertain = true;
                setRetryNotice(retryOrder.current === attempt
                    ? 'Retry the unchanged order on this page to avoid a duplicate fill. If you reload, leave, or change details, check trade history before placing another order.'
                    : CHECK_HISTORY);
            }
            setError(errorMessage(error, sent ? 'Could not confirm the order.' : 'Unable to prepare a secure order ID. Please try again.'));
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
                onChange={changeQuantity}
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
            {retryNotice && <p className="text-gray-700 mt-2">{retryNotice}</p>}
            {success && <p role="status" className="text-green-700 mt-4">{success}</p>}
        </div>
    );
}

TradeControls.propTypes = { selectedOption: PropTypes.string.isRequired };
export default TradeControls;
