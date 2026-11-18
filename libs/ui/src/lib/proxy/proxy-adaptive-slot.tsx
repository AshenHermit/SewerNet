import type { AdaptiveSlotProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyAdaptiveSlotProps = AdaptiveSlotProps;

/** Renders the adaptive slot of the currently selected UI kit. */
export function ProxyAdaptiveSlot(props: AdaptiveSlotProps) {
  const kit = useUiKit();
  return <kit.AdaptiveSlot {...props} />;
}
