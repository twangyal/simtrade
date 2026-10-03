import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../Components/Sidebar';
import { getAccessToken, setSession, subscribeSession } from '../session';

function NavigationState() {
  const location = useLocation();
  const navigate = useNavigate();

  return <>
    <output aria-label="Current route">{location.pathname}</output>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}

it('removes closed navigation controls from the accessible tree and keyboard order', () => {
  const { container, rerender } = render(<MemoryRouter>
    <Sidebar isOpen={true} onClose={vi.fn()} />
  </MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Log Out' })).toBeTruthy();

  rerender(<MemoryRouter><Sidebar isOpen={false} onClose={vi.fn()} /></MemoryRouter>);

  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(container.querySelector('button, a[href], input, select, textarea, [tabindex]')).toBeNull();
});

it('shows navigation controls when open and lets the user close them', () => {
  const onClose = vi.fn();
  render(<MemoryRouter><Sidebar isOpen={true} onClose={onClose} /></MemoryRouter>);

  for (const name of ['Close navigation', 'Log Out']) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it.each([
  ['Overview', '/dashboard'],
  ['Trade', '/trade'],
  ['Activity', '/trade-history'],
])('navigates through %s and closes the sidebar', (name, destination) => {
  const onClose = vi.fn();
  render(<MemoryRouter initialEntries={['/']}>
    <Sidebar isOpen={true} onClose={onClose} />
    <NavigationState />
  </MemoryRouter>);

  fireEvent.click(screen.getByRole('link', { name }));

  expect(screen.getByLabelText('Current route').textContent).toBe(destination);
  expect(onClose).toHaveBeenCalledOnce();
});

it('notifies session subscribers and replaces the protected history entry on logout', () => {
  setSession('account-token');
  const onSessionChange = vi.fn();
  const unsubscribe = subscribeSession(onSessionChange);
  render(<MemoryRouter initialEntries={['/', '/dashboard']} initialIndex={1}>
    <Sidebar isOpen={true} onClose={vi.fn()} />
    <NavigationState />
  </MemoryRouter>);

  try {
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
  } finally {
    unsubscribe();
  }

  expect(onSessionChange).toHaveBeenCalledOnce();
  expect(getAccessToken()).toBeNull();
  expect(localStorage.getItem('accessToken')).toBeNull();
  expect(screen.getByLabelText('Current route').textContent).toBe('/login');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Current route').textContent).toBe('/');
});


it('traps keyboard focus and supports Escape without activating a navigation item', () => {
  const onClose = vi.fn();
  render(<MemoryRouter initialEntries={['/trade']}><Sidebar isOpen={true} onClose={onClose} /></MemoryRouter>);
  const close = screen.getByRole('button', { name: 'Close navigation' });
  const logout = screen.getByRole('button', { name: 'Log Out' });
  expect(document.activeElement).toBe(close);
  expect(screen.getByRole('link', { name: 'Trade', exact: true }).getAttribute('aria-current')).toBe('page');
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(logout);
  fireEvent.keyDown(logout, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});

it('restores the opener focus and scroll position when dismissed', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  document.body.style.overflow = 'auto';
  const { rerender } = render(<MemoryRouter><Sidebar isOpen={true} onClose={vi.fn()} /></MemoryRouter>);
  expect(document.body.style.overflow).toBe('hidden');
  rerender(<MemoryRouter><Sidebar isOpen={false} onClose={vi.fn()} /></MemoryRouter>);
  expect(document.body.style.overflow).toBe('auto');
  expect(document.activeElement).toBe(opener);
  opener.remove();
  document.body.style.overflow = '';
});
