import type { MessageAttachmentProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyMessageAttachmentProps = MessageAttachmentProps;

export function ProxyMessageAttachment(props: MessageAttachmentProps) {
  const kit = useUiKit();
  return <kit.MessageAttachment {...props} />;
}
