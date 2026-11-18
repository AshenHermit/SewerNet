import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyAdaptiveSlot } from '../../proxy/proxy-adaptive-slot';
import { ProxyInput } from '../../proxy/proxy-input';

/**
 * `AdaptiveSlot` mounts exactly one variant for the current layout mode:
 * `undefined` → `fallback`, `null` → intentionally empty. The controlled value
 * lives *above* the slot, which is the contract the chat shell relies on — a
 * breakpoint crossing remounts the variant and must not reset it.
 */

interface DemoArgs {
  compactLabel: string;
  wideLabel: string;
  emptyWide: boolean;
}

function Demo({ compactLabel, wideLabel, emptyWide }: DemoArgs) {
  const [value, setValue] = useState('draft that survives a reflow');

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="text-xs text-[var(--sn-text-muted)]">
        Resize the canvas across 48rem. The input below sits above the slot, so the value
        survives; the panel label switches with the layout.
      </p>
      <ProxyInput
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Controlled value"
      />
      <ProxyAdaptiveSlot
        fallback={<Panel label={`fallback (${compactLabel})`} />}
        compact={<Panel label={`compact (${compactLabel})`} />}
        wide={emptyWide ? null : <Panel label={`wide (${wideLabel})`} />}
      />
    </div>
  );
}

function Panel({ label }: { label: string }) {
  return (
    <div
      data-sn-variant={label}
      className="rounded-[var(--sn-radius)] border border-[var(--sn-border)] bg-[var(--sn-surface-1)] p-4 text-sm text-[var(--sn-text)]"
    >
      {label}
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Proxy/AdaptiveSlot',
  component: Demo,
  args: { compactLabel: 'compact view', wideLabel: 'wide view', emptyWide: false },
};

export default meta;
type Story = StoryObj<typeof Demo>;

/** Both variants render the same controlled value from above the slot. */
export const Variants: Story = {};

/** Wide renders `null`: only the controlled input shows at and above 48rem. */
export const WideEmpty: Story = { args: { emptyWide: true } };
