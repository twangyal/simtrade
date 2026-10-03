import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigationType } from 'react-router-dom';
import './RouteEntry.css';

const EntryContext = createContext(null);

export function RouteEntryProvider({ children }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousLocation = useRef(null);
  // Keep entry intent stable while a lazy page waits to mount, even after the provider commits.
  const entry = useMemo(() => ({
    hash: location.hash,
    navigationType,
    initial: previousLocation.current === null,
    pathnameChanged: previousLocation.current?.pathname !== location.pathname,
  }), [location, navigationType]);

  useLayoutEffect(() => {
    previousLocation.current = location;
  }, [location]);

  return <EntryContext.Provider value={entry}>{children}</EntryContext.Provider>;
}
RouteEntryProvider.propTypes = { children: PropTypes.node.isRequired };

export default function RouteEntry({ children }) {
  const entry = useContext(EntryContext);
  const root = useRef(null);

  useLayoutEffect(() => {
    if (!entry || !root.current || (!entry.initial && !entry.pathnameChanged)) return;
    // Back/Forward retains the browser's restoration, rather than forcing a new-page reset.
    if (entry.navigationType === 'POP' && !entry.initial) return;
    let hashTarget = null;
    if (entry.hash) {
      try {
        const candidate = document.getElementById(decodeURIComponent(entry.hash.slice(1)));
        if (candidate && root.current.contains(candidate)) hashTarget = candidate;
      } catch {
        // A malformed fragment must not prevent the destination page from opening.
      }
    }
    if (entry.initial && entry.navigationType === 'POP' && !hashTarget) return;

    const target = hashTarget ?? root.current.querySelector('main');
    if (!target) return;
    if (hashTarget) hashTarget.scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }, [entry]);

  return <div ref={root} className="route-entry">{children}</div>;
}
RouteEntry.propTypes = { children: PropTypes.node.isRequired };
