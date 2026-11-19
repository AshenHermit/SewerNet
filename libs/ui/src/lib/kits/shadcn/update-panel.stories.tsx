import type { Meta, StoryObj } from '@storybook/react';
import { ShadcnUpdatePanel } from './update-panel';

const meta: Meta<typeof ShadcnUpdatePanel> = {
  title: 'Settings/UpdatePanel',
  component: ShadcnUpdatePanel,
};
export default meta;
type Story = StoryObj<typeof ShadcnUpdatePanel>;

export const Available: Story = {
  args: {
    phase: 'available',
    version: '0.2.0',
    title: 'Software updates',
    statusLabel: 'A new version is available',
    checkLabel: 'Check for updates',
    installLabel: 'Install and restart',
    dismissLabel: 'Later',
    draftWarningLabel: 'Unsaved message draft may be lost',
    draftWarning: true,
    onCheck: () => {},
    onInstall: () => {},
    onDismiss: () => {},
  },
};
