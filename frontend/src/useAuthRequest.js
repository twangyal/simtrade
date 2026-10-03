import { useEffect, useRef, useState } from 'react';
import api, { errorMessage } from './api';
import { getAccessToken, subscribeSession } from './session';

export default function useAuthRequest() {
  const current = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    current.current?.controller.abort();
    current.current?.unsubscribe();
    current.current = null;
  }, []);

  const submit = async (path, credentials, onSuccess, fallback) => {
    if (current.current) return;
    const token = getAccessToken();
    const pending = { controller: new AbortController(), unsubscribe: () => {} };
    current.current = pending;
    pending.unsubscribe = subscribeSession(() => {
      // Each event invalidates the attempt, even if queued login/logout events end at the same token.
      pending.controller.abort();
      pending.unsubscribe();
      if (current.current === pending) {
        current.current = null;
        setBusy(false);
      }
    });
    setBusy(true);
    setError('');
    try {
      const response = await api.post(path, credentials, { signal: pending.controller.signal });
      if (!pending.controller.signal.aborted && current.current === pending && getAccessToken() === token) {
        onSuccess(response);
      }
    } catch (error) {
      if (!pending.controller.signal.aborted && current.current === pending) setError(errorMessage(error, fallback));
    } finally {
      pending.unsubscribe();
      if (current.current === pending) {
        current.current = null;
        setBusy(false);
      }
    }
  };

  return { busy, error, setError, submit };
}
