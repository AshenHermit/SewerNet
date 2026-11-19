import { Trans } from '@lingui/react/macro';
import { ProxyStatusPanel } from '@sewer-net/ui';

/**
 * Startup failure surface: reuses the existing status panel and offers an
 * explicit retry. It never reads storage itself, so rendering it is safe even
 * when the durable snapshot could not be loaded.
 */
export function BootstrapStatus({ onRetry }: { onRetry?: () => void }) {
  return (
    <ProxyStatusPanel
      title={<Trans>Could not start SewerNet</Trans>}
      detail={
        <Trans>
          Local session storage is unavailable. Your saved accounts were not changed.
        </Trans>
      }
      actionLabel={<Trans>Try again</Trans>}
      onAction={onRetry}
    />
  );
}
