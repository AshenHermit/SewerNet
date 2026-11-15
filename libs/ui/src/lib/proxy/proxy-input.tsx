import type { InputProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyInputProps = InputProps;

/** Renders the input of the currently selected UI kit. */
export function ProxyInput(props: ProxyInputProps) {
  const kit = useUiKit();
  return <kit.Input {...props} />;
}
