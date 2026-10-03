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

  for (const name of ['Close navigation', 'Home', 'Trade', 'View Trade History', 'Log Out']) {
    expect(screen.getByRole('button', { name })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
  expect(onClose).toHaveBeenCalledOnce();
});

it.each([
  ['Home', '/dashboard'],
  ['Trade', '/trade'],
  ['View Trade History', '/trade-history'],
])('navigates through %s and closes the sidebar', (name, destination) => {
  const onClose = vi.fn();
  render(<MemoryRouter initialEntries={['/']}>
    <Sidebar isOpen={true} onClose={onClose} />
    <NavigationState />
  </MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name }));

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
