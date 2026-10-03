import PropTypes from 'prop-types';
import { INSTRUMENTS } from '../instruments';

export default function DropdownMenu({ onOptionSelect, selectedOption = 'BTC/USD' }) {
    return <div className="instrument-picker"><label htmlFor="instrument">Instrument</label><select id="instrument" value={selectedOption} onChange={(event) => onOptionSelect(event.target.value)}>
        {INSTRUMENTS.map((instrument) => <option key={instrument.symbol} value={instrument.symbol}>{instrument.symbol} — {instrument.name}</option>)}
    </select></div>;
}
DropdownMenu.propTypes = { onOptionSelect: PropTypes.func.isRequired, selectedOption: PropTypes.string };
