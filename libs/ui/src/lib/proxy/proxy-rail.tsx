import type { RailProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyRailProps = RailProps;

/** Renders the rail (left navigation panel) of the currently selected UI kit. */
export function ProxyRail(props: RailProps) {
  const kit = useUiKit();
  return <kit.Rail {...props} />;
}

