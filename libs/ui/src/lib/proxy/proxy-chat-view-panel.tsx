import type { ChatViewPanelProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyChatViewPanelProps = ChatViewPanelProps;

/** Renders the chat view panel of the currently selected UI kit. */
export function ProxyChatViewPanel(props: ChatViewPanelProps) {
  const kit = useUiKit();
  return <kit.ChatViewPanel {...props} />;
}
