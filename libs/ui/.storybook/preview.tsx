import type { Decorator, Preview } from '@storybook/react-vite';
import { UiKitProvider } from '../src/index.js';
import { IconSetProvider } from '@sewer-net/icons';
import '../src/styles.css';

/** Wraps every story with the proxy providers, as the real app shell does. */
const withProviders: Decorator = (Story) => (
  <UiKitProvider>
    <IconSetProvider>
      <div className="p-4">
        <Story />
      </div>
    </IconSetProvider>
  </UiKitProvider>
);

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'sewer-dark',
      values: [
        { name: 'sewer-dark', value: '#0b0f0d' },
        { name: 'sewer-light', value: '#eef3f0' },
      ],
    },
  },
  decorators: [withProviders],
};

export default preview;
