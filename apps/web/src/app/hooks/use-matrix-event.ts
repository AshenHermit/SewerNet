import { useEffect, useRef } from 'react';
import { getMatrixClient } from '../../client/init-matrix';

/**
 * Подписка на событие SDK-клиента. Подписка стабильна (переподписка только
 * при смене имени события), актуальный handler живёт в ref — его замена
 * не переподписывает и не роняет мемоизацию вызывающих компонентов.
 */
export function useMatrixEvent(
  event: string,
  handler: (...args: unknown[]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const client = getMatrixClient();
    const wrapper = (...args: unknown[]) => handlerRef.current(...args);

    client.on(event as Parameters<typeof client.on>[0], wrapper as Parameters<typeof client.on>[1]);
    return () => {
      client.off(event as Parameters<typeof client.off>[0], wrapper as Parameters<typeof client.off>[1]);
    };
  }, [event]);
}
