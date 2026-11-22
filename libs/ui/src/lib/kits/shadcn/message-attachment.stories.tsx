import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyMessageAttachment } from '../../proxy/proxy-message-attachment';

const meta: Meta<typeof ProxyMessageAttachment> = {
  title: 'Proxy/MessageAttachment',
  component: ProxyMessageAttachment,
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof ProxyMessageAttachment>;
const labels = { downloadLabel: 'Download', loadingLabel: 'Loading attachment', retryLabel: 'Retry', name: 'Encrypted attachment.png', onRetry: () => undefined };

export const Image: Story = { args: { ...labels, url: 'blob:storybook-image', previewUrl: 'blob:storybook-image', loading: false } };
export const File: Story = { args: { ...labels, name: 'document.pdf', url: 'blob:storybook-file', loading: false } };
export const Loading: Story = { args: { ...labels, loading: true } };
export const HashFailure: Story = { args: { ...labels, loading: false, error: 'Encrypted media verification or decryption failed' } };
