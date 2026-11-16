import type { PanelProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyPanelProps = PanelProps;

/** Renders the panel of the currently selected UI kit. */
export function ProxyPanel(props: PanelProps) {
  const kit = useUiKit();
  return <kit.Panel {...props} />;
}
