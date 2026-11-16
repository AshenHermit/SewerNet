import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyChatViewError } from '../../proxy/proxy-chat-view-error.js';

const meta: Meta<typeof ProxyChatViewError> = {
  title: 'Proxy/ChatViewError',
  component: ProxyChatViewError,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyChatViewError>;

export const WithError: Story = {
  args: { error: 'Failed to load messages' },
};

export const WithoutError: Story = {
  args: {},
};
