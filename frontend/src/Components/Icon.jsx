import PropTypes from 'prop-types';

const paths = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  chart: <><path d="M4 4v16h16" /><path d="m7 14 4-4 4 2 5-7" /></>,
  history: <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  wallet: <><path d="M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15V8H5a3 3 0 0 1 0-6" /><path d="M20 12h-5v5h5M16 14.5h.1" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  up: <path d="m5 15 6-6 4 4 5-7m-6 0h6v6" />,
  down: <path d="m5 9 6 6 4-4 5 7m-6 0h6v-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  logout: <path d="M9 4H4v16h5m6-12 4 4-4 4M9 12h10" />,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2" /></>,
  layers: <path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
};

export default function Icon({ name, size = 20, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name] ?? paths.chart}</svg>;
}
Icon.propTypes = { name: PropTypes.string.isRequired, size: PropTypes.number, className: PropTypes.string };
