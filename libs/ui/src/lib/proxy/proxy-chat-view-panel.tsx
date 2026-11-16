import type { ChatViewPanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewPanelProps = ChatViewPanelProps;

/** Renders the chat view panel of the currently selected UI kit. */
export function ProxyChatViewPanel(props: ChatViewPanelProps) {
  const kit = useUiKit();
  return <kit.ChatViewPanel {...props} />;
}

