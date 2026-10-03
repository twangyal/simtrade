import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement viewport or element scrolling; real geometry is checked in Chrome.
window.scrollTo = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
});
