import type { StatusPanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyStatusPanelProps = StatusPanelProps;

/** Renders the status panel of the currently selected UI kit. */
export function ProxyStatusPanel(props: StatusPanelProps) {
  const kit = useUiKit();
  return <kit.StatusPanel {...props} />;
}
