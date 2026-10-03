import PropTypes from 'prop-types';

function Price({ data, parentChange }) {
    if (!data || data.symbol !== parentChange) {
        return <p className="text-center text-gray-500">Waiting for a quote…</p>;
    }
    const { symbol, price, bid, ask } = data;
    const currentPrice = Array.isArray(price) ? price[0] : price;
    return (
        <div className="p-4 bg-white shadow-md rounded-lg max-w-md mx-auto">
            <div className="flex flex-col items-start space-y-2">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl font-semibold text-gray-800">{symbol}</h2>
                    <p className="text-xl font-bold text-green-600">{currentPrice ?? 'N/A'}</p>
                </div>
                <div className="flex flex-col space-y-1">
                    {ask != null && <p className="text-md text-gray-700">Ask: {ask}</p>}
                    {bid != null && <p className="text-md text-gray-700">Bid: {bid}</p>}
                </div>
            </div>
        </div>
    );
}

const quoteValue = PropTypes.oneOfType([PropTypes.number, PropTypes.string]);
Price.propTypes = {
    data: PropTypes.shape({ symbol: PropTypes.string, price: PropTypes.oneOfType([quoteValue, PropTypes.arrayOf(quoteValue)]), bid: quoteValue, ask: quoteValue }),
    parentChange: PropTypes.string.isRequired,
};
export default Price;
