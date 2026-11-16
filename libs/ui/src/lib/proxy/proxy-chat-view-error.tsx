import type { ChatViewErrorProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyChatViewErrorProps = ChatViewErrorProps;

/** Renders the chat view error of the currently selected UI kit. */
export function ProxyChatViewError(props: ChatViewErrorProps) {
  const kit = useUiKit();
  return <kit.ChatViewError {...props} />;
}
