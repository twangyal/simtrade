import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession } from '../session';
import Icon from './Icon';

export function Brand() {
  return <span className="workspace-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>SimTrade<span className="brand-period">.</span></span>;
}

export function WorkspaceNav({ onNavigate = () => {} }) {
  const navigate = useNavigate();
  const logout = () => {
    clearSession();
    onNavigate();
    navigate('/login', { replace: true });
  };
  return <>
    <div className="sidebar-brand"><Brand /><span className="sidebar-caption">A little practice. A lot of possibility.</span></div>
    <nav className="workspace-navigation" aria-label="Main navigation">
      <span className="nav-section-label">YOUR WORKSPACE</span>
      {[
        ['/dashboard', 'Overview', 'overview'],
        ['/trade', 'Trade', 'chart'],
        ['/trade-history', 'Activity', 'history'],
      ].map(([to, label, icon]) => <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
        <Icon name={icon} /><span>{label}</span><Icon name="chevron" size={14} className="nav-chevron" />
      </NavLink>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="practice-card"><Icon name="shield" /><strong>Real practice.<br />Virtual money.</strong><p>Your orders stay in SimTrade. Build confidence at your own pace.</p><span>Paper trading account</span></div>
      <button className="logout-button" onClick={logout}><Icon name="logout" />Log Out</button>
    </div>
  </>;
}
WorkspaceNav.propTypes = { onNavigate: PropTypes.func };

export default function Sidebar({ isOpen, onClose }) {
  const panel = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = panel.current?.querySelectorAll('a[href],button:not([disabled])');
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <div className="navigation-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label="Navigation" id="mobile-navigation" className="mobile-sidebar" onKeyDown={handleKeyDown}>
      <button aria-label="Close navigation" className="navigation-close icon-button" onClick={onClose}><Icon name="close" /></button>
      <WorkspaceNav onNavigate={onClose} />
    </div>
  </div>;
}
Sidebar.propTypes = { isOpen: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired };
