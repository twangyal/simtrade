import { useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Sidebar, { Brand, WorkspaceNav } from './Sidebar';
import Icon from './Icon';

export default function AppShell({ section, children }) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const background = useRef(null);
  useLayoutEffect(() => {
    if (background.current) background.current.inert = navigationOpen;
    const closeOnDesktop = () => { if (window.innerWidth >= 1100) setNavigationOpen(false); };
    window.addEventListener('resize', closeOnDesktop);
    return () => window.removeEventListener('resize', closeOnDesktop);
  }, [navigationOpen]);

  return <div className="workspace">
    <div ref={background} className="workspace-background" aria-hidden={navigationOpen ? true : undefined}>
      <a className="skip-link" href="#workspace-main">Skip to content</a>
      <aside className="desktop-sidebar"><WorkspaceNav /></aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="workspace-breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{section}</strong></div>
          <div className="workspace-topbar-right"><span className="paper-badge"><span />Paper trading</span><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={navigationOpen} aria-controls={navigationOpen ? 'mobile-navigation' : undefined} onClick={() => setNavigationOpen(true)}><Icon name="menu" /></button></div>
        </header>
        <main id="workspace-main" tabIndex={-1} className="workspace-main">{children}</main>
        <footer className="workspace-footer"><span>SimTrade <span aria-hidden="true">·</span> A space to find your trading rhythm.</span><span>Virtual funds. Real learning.</span></footer>
      </div>
    </div>
    <Sidebar isOpen={navigationOpen} onClose={() => setNavigationOpen(false)} />
  </div>;
}
AppShell.propTypes = { section: PropTypes.string.isRequired, children: PropTypes.node.isRequired };
