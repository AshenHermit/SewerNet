import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyInput } from '../../proxy/proxy-input';

const meta: Meta<typeof ProxyInput> = {
  title: 'Proxy/Input',
  component: ProxyInput,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyInput>;

export const Default: Story = {
  args: { placeholder: 'Type a messageвЂ¦' },
};

export const Invalid: Story = {
  args: { placeholder: 'Invalid value', invalid: true, defaultValue: 'oops' },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled', disabled: true },
};

