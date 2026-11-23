import type { Decorator, Preview } from '@storybook/react-vite';
import { UiKitProvider } from '../src/index.js';
import { IconSetProvider } from '@sewer-net/icons';
import '../src/styles.css';

/**
 * Wraps every component story with the proxy providers, as the real app shell
 * does. The padding belongs to component stories only: acceptance stories draw
 * their own fullscreen shell.
 */
const withProviders: Decorator = (Story, context) => {
  const fullscreen = context.parameters.layout === 'fullscreen';
  return (
    <UiKitProvider>
      <IconSetProvider>
        <div className={fullscreen ? 'h-full w-full' : 'p-4'}>
          <Story />
        </div>
      </IconSetProvider>
    </UiKitProvider>
  );
};

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
