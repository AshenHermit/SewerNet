import type { LoginFormProps } from '../ui-kit.js';
import { useUiKit } from './ui-kit-provider.js';

export type ProxyLoginFormProps = LoginFormProps;

/** Renders the login form of the currently selected UI kit. */
export function ProxyLoginForm(props: LoginFormProps) {
  const kit = useUiKit();
  return <kit.LoginForm {...props} />;
}
