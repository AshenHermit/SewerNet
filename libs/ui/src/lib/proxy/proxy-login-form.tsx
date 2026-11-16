import type { LoginFormProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyLoginFormProps = LoginFormProps;

/** Renders the login form of the currently selected UI kit. */
export function ProxyLoginForm(props: LoginFormProps) {
  const kit = useUiKit();
  return <kit.LoginForm {...props} />;
}

