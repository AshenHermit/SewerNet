import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyButton } from '../../proxy/proxy-button';

const meta: Meta<typeof ProxyButton> = {
  title: 'Proxy/Button',
  component: ProxyButton,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyButton>;

export const Primary: Story = {
  args: { children: 'Primary' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete' },
};

export const Loading: Story = {
  args: { children: 'SendingвЂ¦', loading: true },
};

export const Small: Story = {
  args: { size: 'sm', children: 'Small' },
};

export const Large: Story = {
  args: { size: 'lg', children: 'Large' },
};

export const IconButton: Story = {
  args: { size: 'icon', children: 'вњ“' },
};

