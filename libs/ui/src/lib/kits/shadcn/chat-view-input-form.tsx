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
        'flex items-center gap-2 border-t border-[var(--sn-border)] p-3',
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
        placeholder="Message"
        aria-label="Message"
        className="flex-1"
      />
      <ProxyButton
        size="icon"
        type="submit"
        loading={sending}
        title="Send"
      >
        {sending ? null : <ProxyIcon name="send" size={18} />}
      </ProxyButton>
    </form>
  );
}
