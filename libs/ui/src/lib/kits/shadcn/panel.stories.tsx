import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyPanel } from '../../proxy/proxy-panel';

const meta: Meta<typeof ProxyPanel> = {
  title: 'Proxy/Panel',
  component: ProxyPanel,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyPanel>;

export const Default: Story = {
  args: { children: 'Panel content', p: 'md' },
};

export const SmallPadding: Story = {
  args: { children: 'Tight panel', p: 'sm' },
};

export const LargePadding: Story = {
  args: { children: 'Spacious panel', p: 'lg' },
};

export const Unbordered: Story = {
  args: { children: 'No border', bordered: false, p: 'md' },
};

