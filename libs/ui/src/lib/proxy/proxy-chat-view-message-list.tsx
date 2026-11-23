import type { ChatViewMessageListProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewMessageListProps = ChatViewMessageListProps;

/** Renders the chat view message list of the currently selected UI kit. */
export function ProxyChatViewMessageList(props: ChatViewMessageListProps) {
  const kit = useUiKit();
  return <kit.ChatViewMessageList {...props} />;
}

