import { useEffect } from 'react';
import type { AdapterEventName, AdapterEvents } from './adapter';
import { useAdapter } from './AdapterProvider';

/** Subscribe to one shell event for the lifetime of the component. */
export function useAdapterEvent<E extends AdapterEventName>(
  event: E,
  handler: (payload: AdapterEvents[E]) => void,
): void {
  const adapter = useAdapter();
  useEffect(() => adapter.on(event, handler), [adapter, event, handler]);
}
