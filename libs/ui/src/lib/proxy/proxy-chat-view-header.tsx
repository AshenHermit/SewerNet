import type { ChatViewHeaderProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewHeaderProps = ChatViewHeaderProps;

/** Renders the chat view header of the currently selected UI kit. */
export function ProxyChatViewHeader(props: ChatViewHeaderProps) {
  const kit = useUiKit();
  return <kit.ChatViewHeader {...props} />;
}

