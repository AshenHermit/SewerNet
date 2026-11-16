import type { KitOptionProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyKitOptionProps = KitOptionProps;

/** Renders a UI kit option of the currently selected UI kit. */
export function ProxyKitOption(props: KitOptionProps) {
  const kit = useUiKit();
  return <kit.KitOption {...props} />;
}
