import { useSyncExternalStore } from 'react';
import { getAccessToken, subscribeSession } from './session';

export default function useSession() {
  return useSyncExternalStore(subscribeSession, getAccessToken, () => null);
}
