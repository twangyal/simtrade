import { Link } from 'react-router-dom';

export default function Brand() {
    return (
        <Link to="/" className="public-brand" aria-label="SimTrade home">
            <span className="public-brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>SimTrade<span className="public-brand-dot">.</span></span>
        </Link>
    );
}
