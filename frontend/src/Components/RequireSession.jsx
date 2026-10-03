import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useSession from '../useSession';

export default function RequireSession() {
  const token = useSession();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}`, loginRequired: true }} />;
  // A different token represents a different session; discard account-specific UI state.
  return <Outlet key={token} />;
}
