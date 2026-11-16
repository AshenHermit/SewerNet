import type { LoginScreenProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxyLoginScreenProps = LoginScreenProps;

/** Renders the login screen of the currently selected UI kit. */
export function ProxyLoginScreen(props: LoginScreenProps) {
  const kit = useUiKit();
  return <kit.LoginScreen {...props} />;
}

