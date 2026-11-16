import type { ButtonHTMLAttributes } from 'react';
import type { ButtonProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyButtonProps = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Renders the button of the currently selected UI kit.
 * Screens import proxy components, never concrete kit implementations.
 */
export function ProxyButton(props: ProxyButtonProps) {
  const kit = useUiKit();
  return <kit.Button {...props} />;
}

