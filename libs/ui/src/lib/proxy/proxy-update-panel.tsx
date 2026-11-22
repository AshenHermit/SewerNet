import type { UpdatePanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyUpdatePanelProps = UpdatePanelProps;

export function ProxyUpdatePanel(props: UpdatePanelProps) {
  const kit = useUiKit();
  return <kit.UpdatePanel {...props} />;
}
