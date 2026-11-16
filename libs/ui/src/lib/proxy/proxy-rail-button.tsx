import type { RailButtonProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyRailButtonProps = RailButtonProps;

/** Renders a rail navigation button of the currently selected UI kit. */
export function ProxyRailButton(props: RailButtonProps) {
  const kit = useUiKit();
  return <kit.RailButton {...props} />;
}
