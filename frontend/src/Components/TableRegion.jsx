import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icon';
import './TableRegion.css';

export default function TableRegion({ label, children }) {
  const viewport = useRef(null);
  const id = useId();
  const regionId = `table-region-${id}`;
  const hintId = `table-hint-${id}`;
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });

  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const maximum = element.scrollWidth - element.clientWidth;
    // Browser scroll positions can be fractional even though widths are rounded.
    const overflow = maximum > 1;
    const next = {
      overflow,
      left: overflow && element.scrollLeft > 1,
      right: overflow && element.scrollLeft < maximum - 1,
    };
    setScroll((previous) => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right
      ? previous : next);
  }, []);

  useLayoutEffect(() => {
    const element = viewport.current;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (observer && element) {
      observer.observe(element);
      const table = element.querySelector('table');
      if (table) observer.observe(table);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, measure]);

  const scrollColumns = (direction) => {
    const element = viewport.current;
    if (!element) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return <div className="table-region">
    {scroll.overflow && <div className="table-region__controls">
      <p id={hintId} className="table-region__hint"><span>More columns</span><span className="table-region__sr-only">. Scroll horizontally or use the arrow buttons to view all columns.</span></p>
      <div className="table-region__buttons" role="group" aria-label={`${label} column navigation`}>
        <button type="button" className="table-region__button table-region__button--left" aria-label={`Scroll ${label} left`} aria-controls={regionId} disabled={!scroll.left} onClick={() => scrollColumns(-1)}><Icon name="arrow" size={17} /></button>
        <button type="button" className="table-region__button" aria-label={`Scroll ${label} right`} aria-controls={regionId} disabled={!scroll.right} onClick={() => scrollColumns(1)}><Icon name="arrow" size={17} /></button>
      </div>
    </div>}
    <div ref={viewport} id={regionId} className="table-scroll table-region__viewport" tabIndex={0} role="region" aria-label={label} aria-describedby={scroll.overflow ? hintId : undefined} onScroll={measure}>{children}</div>
  </div>;
}

TableRegion.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired };
