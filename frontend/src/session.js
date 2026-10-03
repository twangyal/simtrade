const TOKEN_KEY = 'accessToken';
const SESSION_EVENT = 'simtrade-session-change';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function subscribeSession(listener) {
  const onStorage = (event) => {
    if (event.storageArea === localStorage && (event.key === TOKEN_KEY || event.key === null)) listener();
  };
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(SESSION_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function setSession(token) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Invalid access token');
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession(expectedToken) {
  const token = getAccessToken();
  if (expectedToken !== undefined && token !== expectedToken) return false;
  if (token === null) return false;
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
  return true;
}
