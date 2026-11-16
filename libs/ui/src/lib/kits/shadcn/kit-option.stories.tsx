import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyKitOption } from '../../proxy/proxy-kit-option.js';

const meta: Meta<typeof ProxyKitOption> = {
  title: 'Proxy/KitOption',
  component: ProxyKitOption,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyKitOption>;

export const Active: Story = {
  args: { kitId: 'shadcn', label: 'shadcn/ui', active: true, onSelect: () => {} },
};

export const Inactive: Story = {
  args: { kitId: 'shadcn', label: 'shadcn/ui', active: false, onSelect: () => {} },
};
