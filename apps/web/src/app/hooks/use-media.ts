import { useEffect, useRef, useState } from 'react';
import type { MediaSource } from '../../platform/contracts';
import { acquireMedia } from '../../lib/media-resolver';
import { subscribeAccounts } from '../../client/accounts';

export interface MediaState {
  url?: string;
  loading: boolean;
  error?: string;
}

export function useMedia(source: MediaSource | null): MediaState {
  const [state, setState] = useState<MediaState>({ loading: Boolean(source), });
  const generation = useRef(0);
  const latestSourceKey = useRef<string | null>(null);
  const key = source
    ? `${source.mxc}|${source.size ?? ''}|${source.encryptedFile?.hashes.sha256 ?? ''}`
    : null;
  latestSourceKey.current = key;

  useEffect(() => {
    const unsubscribe = subscribeAccounts(() => {
      generation.current += 1;
      setState({ loading: false });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!source) {
      setState({ loading: false });
      return;
    }
    let disposed = false;
    let released: { release(): void } | null = null;
    const controller = new AbortController();
    const effectGeneration = ++generation.current;
    const key = `${source.mxc}|${source.size ?? ''}|${source.encryptedFile?.hashes.sha256 ?? ''}`;
    setState({ loading: true });

    void acquireMedia(source, controller.signal).then((lease) => {
      if (disposed || controller.signal.aborted || effectGeneration !== generation.current || latestSourceKey.current !== key) {
        lease.release();
        return;
      }
      released = lease;
      setState({ url: lease.url, loading: false });
    }).catch((error: unknown) => {
      if (!disposed && !controller.signal.aborted) {
        setState({ loading: false, error: error instanceof Error ? error.message : 'Media unavailable' });
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      released?.release();
    };
  }, [source?.mxc, source?.size, source?.encryptedFile]);

  return state;
}
