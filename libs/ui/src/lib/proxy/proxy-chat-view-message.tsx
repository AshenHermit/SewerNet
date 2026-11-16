import type { ChatViewMessageProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyChatViewMessageProps = ChatViewMessageProps;

/** Renders a single chat message of the currently selected UI kit. */
export function ProxyChatViewMessage(props: ChatViewMessageProps) {
  const kit = useUiKit();
  return <kit.ChatViewMessage {...props} />;
}
