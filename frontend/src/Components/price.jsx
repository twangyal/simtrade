import PropTypes from 'prop-types';
import { formatQuotePrice } from '../quoteFormat';

function Price({ data, parentChange }) {
    if (!data || data.symbol !== parentChange) {
        return <p className="quote-waiting">Waiting for a quote…</p>;
    }
    const { price, bid, ask } = data;
    const currentPrice = Array.isArray(price) ? price[0] : price;
    const formattedPrice = currentPrice == null ? 'N/A' : formatQuotePrice(currentPrice);
    return (
        <div className="quote-price-row">
            <div>
                <span className="quote-price-label">Last received price</span>
                <span className={`quote-last-price${formattedPrice.length > 16 ? ' quote-last-price-long' : ''}`} aria-label="Last received price">{formattedPrice}</span>
            </div>
            {(ask != null || bid != null) && <dl className="quote-spread">
                {bid != null && <div><dt>Bid</dt><dd>{formatQuotePrice(bid)}</dd></div>}
                {ask != null && <div><dt>Ask</dt><dd>{formatQuotePrice(ask)}</dd></div>}
            </dl>}
        </div>
    );
}

const quoteValue = PropTypes.oneOfType([PropTypes.number, PropTypes.string]);
Price.propTypes = {
    data: PropTypes.shape({ symbol: PropTypes.string, price: PropTypes.oneOfType([quoteValue, PropTypes.arrayOf(quoteValue)]), bid: quoteValue, ask: quoteValue }),
    parentChange: PropTypes.string.isRequired,
};
export default Price;
