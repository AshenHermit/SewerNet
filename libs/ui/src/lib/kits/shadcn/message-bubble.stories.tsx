import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyMessageBubble } from '../../proxy/proxy-message-bubble';

const meta: Meta<typeof ProxyMessageBubble> = {
  title: 'Proxy/MessageBubble',
  component: ProxyMessageBubble,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProxyMessageBubble>;

export const Theirs: Story = {
  args: { text: 'Hello, how are you?' },
};

export const Ours: Story = {
  args: { own: true, text: 'I am good, thanks!' },
};

