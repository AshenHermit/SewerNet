import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewInputForm } from '../../proxy/proxy-chat-view-input-form.js';

const meta: Meta<typeof ProxyChatViewInputForm> = {
  title: 'Proxy/ChatViewInputForm',
  component: ProxyChatViewInputForm,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewInputForm>;

export const Default: Story = {
  args: {
    draft: '',
    onChange: () => {},
    onSubmit: () => {},
    onAttach: () => {},
  },
};

export const Sending: Story = {
  args: {
    draft: '',
    onChange: () => {},
    onSubmit: () => {},
    sending: true,
  },
};
