import type { ChatViewInputFormProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyChatViewInputFormProps = ChatViewInputFormProps;

/** Renders the chat view input form of the currently selected UI kit. */
export function ProxyChatViewInputForm(props: ChatViewInputFormProps) {
  const kit = useUiKit();
  return <kit.ChatViewInputForm {...props} />;
}

