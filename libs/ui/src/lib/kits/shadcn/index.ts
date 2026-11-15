import type { UiKit } from '../../ui-kit.js';
import { ShadcnButton } from './button.js';
import { ShadcnInput } from './input.js';

export const shadcnKit: UiKit = {
  id: 'shadcn',
  name: 'shadcn/ui',
  Button: ShadcnButton,
  Input: ShadcnInput,
};
