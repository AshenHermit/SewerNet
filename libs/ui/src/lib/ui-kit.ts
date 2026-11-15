import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * A UI kit is a set of concrete component implementations.
 * Proxy components render the kit that is currently selected in the theme settings,
 * so the whole interface can switch between shadcn, custom registries, etc.
 */
export interface UiKit {
  id: string;
  name: string;
  Button: ComponentType<ButtonProps>;
  Input: ComponentType<InputProps>;
}
