import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyRailButton } from '../../proxy/proxy-rail-button';

const meta: Meta<typeof ProxyRailButton> = {
  title: 'Proxy/RailButton',
  component: ProxyRailButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyRailButton>;

export const Default: Story = {
  args: { icon: 'settings', title: 'Settings' },
};

export const Active: Story = {
  args: { icon: 'chats', title: 'Chats', active: true },
};

