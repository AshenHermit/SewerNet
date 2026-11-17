import { useEffect, useRef } from 'react';
import type { MatrixEmittedEvents } from 'matrix-js-sdk';
import { getMatrixClient } from '../../client/init-matrix';

/**
 * Подписка на событие SDK-клиента. Подписка стабильна (переподписка только
 * при смене имени события), актуальный handler живёт в ref — его замена
 * не переподписывает и не роняет мемоизацию вызывающих компонентов.
 */
export function useMatrixEvent(
  event: MatrixEmittedEvents,
  handler: (...args: unknown[]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const client = getMatrixClient();
    const wrapper = (...args: unknown[]) => handlerRef.current(...args);

    client.on(event, wrapper as Parameters<typeof client.on>[1]);
    return () => {
      client.off(event, wrapper as Parameters<typeof client.off>[1]);
    };
  }, [event]);
}
