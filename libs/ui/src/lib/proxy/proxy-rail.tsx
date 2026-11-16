import type { RailProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRailProps = RailProps;

/** Renders the rail (left navigation panel) of the currently selected UI kit. */
export function ProxyRail(props: RailProps) {
  const kit = useUiKit();
  return <kit.Rail {...props} />;
}
