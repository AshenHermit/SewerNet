import type { ChatScreenProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatScreenProps = ChatScreenProps;

/** Renders the chat screen of the currently selected UI kit. */
export function ProxyChatScreen(props: ChatScreenProps) {
  const kit = useUiKit();
  return <kit.ChatScreen {...props} />;
}

