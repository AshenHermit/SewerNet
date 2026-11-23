import { ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { cn } from '@sewer-net/utils';
import { ProxyButton, ProxyInput } from '../../proxy/index';
import { ProxyIcon } from '@sewer-net/icons';
import type { ChatViewInputFormProps } from '../../ui-kit';

export function ShadcnChatViewInputForm({
  draft,
  onChange,
  onSubmit,
  sending = false,
  onAttach,
  attachLabel = 'Attach',
  messageLabel = 'Message',
  sendLabel = 'Send',
  className,
  ...props
}: ChatViewInputFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Allow picking the same file again later.
      event.target.value = '';
      if (file) {
        onAttach?.(file);
      }
    },
    [onAttach],
  );

  return (
    <form
      {...props}
      onSubmit={handleSubmit}
      className={cn(
        'flex shrink-0 items-center gap-2 border-t border-[var(--sn-border)] p-3 pb-[calc(0.75rem+var(--sn-safe-bottom))]',
        className,
      )}
    >
      {onAttach ? (
        <>
          <ProxyButton
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleAttachClick}
            title={attachLabel}
            aria-label={attachLabel}
            className="shrink-0"
          >
            <ProxyIcon name="paperclip" />
          </ProxyButton>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      ) : null}
      <ProxyInput
        value={draft}
        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={messageLabel}
        aria-label={messageLabel}
        className="min-w-0 flex-1 text-base"
      />
      <ProxyButton
        size="icon"
        type="submit"
        loading={sending}
        title={sendLabel}
        aria-label={sendLabel}
        className="shrink-0"
      >
        {sending ? null : <ProxyIcon name="send" size={18} />}
      </ProxyButton>
    </form>
  );
}
