import type { MessageBubbleProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyMessageBubbleProps = MessageBubbleProps;

/** Renders a message bubble of the currently selected UI kit. */
export function ProxyMessageBubble(props: MessageBubbleProps) {
  const kit = useUiKit();
  return <kit.MessageBubble {...props} />;
}

