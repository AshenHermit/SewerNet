import type { ChatViewEmptyProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewEmptyProps = ChatViewEmptyProps;

/** Renders the empty chat state of the currently selected UI kit. */
export function ProxyChatViewEmpty(props: ProxyChatViewEmptyProps) {
  const kit = useUiKit();
  return <kit.ChatViewEmpty {...props} />;
}
