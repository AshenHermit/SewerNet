import type { ChatViewInputFormProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyChatViewInputFormProps = ChatViewInputFormProps;

/** Renders the chat view input form of the currently selected UI kit. */
export function ProxyChatViewInputForm(props: ChatViewInputFormProps) {
  const kit = useUiKit();
  return <kit.ChatViewInputForm {...props} />;
}
