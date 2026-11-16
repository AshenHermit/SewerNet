import { createContext } from 'react';
import type { UiKit } from '../ui-kit';

/** Контекст текущего UI-kit. Без импорта из kits/index — разрывает цикл импортов. */
export const UiKitContext = createContext<UiKit | undefined>(undefined);
