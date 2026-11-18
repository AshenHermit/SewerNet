import type { BottomNavigationProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyBottomNavigationProps = BottomNavigationProps;

/** Renders the compact bottom navigation of the currently selected UI kit. */
export function ProxyBottomNavigation(props: ProxyBottomNavigationProps) {
  const kit = useUiKit();
  return <kit.BottomNavigation {...props} />;
}
