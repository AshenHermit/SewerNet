import type { ChatViewMessageProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewMessageProps = ChatViewMessageProps;

/** Renders a single chat message of the currently selected UI kit. */
export function ProxyChatViewMessage(props: ChatViewMessageProps) {
  const kit = useUiKit();
  return <kit.ChatViewMessage {...props} />;
}

