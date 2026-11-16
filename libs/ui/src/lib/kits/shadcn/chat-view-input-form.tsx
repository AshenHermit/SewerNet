import { FormEvent, useCallback } from 'react';
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
  className,
  ...props
}: ChatViewInputFormProps) {
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
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
        <ProxyButton
          variant="ghost"
          size="icon"
          type="button"
          onClick={onAttach}
          title="Attach"
        >
          <ProxyIcon name="paperclip" />
        </ProxyButton>
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

