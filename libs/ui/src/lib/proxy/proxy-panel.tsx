import type { PanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyPanelProps = PanelProps;

/** Renders the panel of the currently selected UI kit. */
export function ProxyPanel(props: PanelProps) {
  const kit = useUiKit();
  return <kit.Panel {...props} />;
}

