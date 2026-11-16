import type { InputProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyInputProps = InputProps;

/** Renders the input of the currently selected UI kit. */
export function ProxyInput(props: ProxyInputProps) {
  const kit = useUiKit();
  return <kit.Input {...props} />;
}

