import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyLoginScreen } from '../../proxy/proxy-login-screen.js';

const meta: Meta<typeof ProxyLoginScreen> = {
  title: 'Proxy/LoginScreen',
  component: ProxyLoginScreen,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyLoginScreen>;

export const WithMas: Story = {
  args: {
    appName: 'SewerNet',
    subtitle: 'Sign in to your Matrix account',
    homeserverUrl: 'https://matrix.org',
    homeserverLabel: 'Homeserver URL',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    signInLabel: 'Sign in',
    onHomeserverChange: () => {},
    onHomeserverBlur: () => {},
    mas: {
      issuer: 'https://account.matrix.org/',
      authorizationEndpoint: 'https://account.matrix.org/_matrix/client/v3/authorize',
      tokenEndpoint: 'https://account.matrix.org/_matrix/client/v3/oauth2/token',
      registrationEndpoint: 'https://account.matrix.org/_matrix/client/v3/register',
      responseModesSupported: ['query', 'fragment'],
    },
    resolving: false,
    starting: false,
    error: null,
    onContinueWithMatrix: () => {},
    continueLabel: 'Continue with Matrix',
    createAccountLabel: 'Create account',
    onTogglePasswordForm: () => {},
    passwordFormLabel: 'Sign in with password',
    user: '',
    onUserChange: () => {},
    password: '',
    onPasswordChange: () => {},
    passwordLoading: false,
    passwordError: null,
    onSignIn: () => {},
  },
};

export const WithoutMas: Story = {
  args: {
    appName: 'SewerNet',
    subtitle: 'Sign in to your Matrix account',
    homeserverUrl: 'https://matrix.org',
    homeserverLabel: 'Homeserver URL',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    signInLabel: 'Sign in',
    onHomeserverChange: () => {},
    onHomeserverBlur: () => {},
    mas: null,
    resolving: false,
    starting: false,
    error: null,
    onContinueWithMatrix: () => {},
    continueLabel: 'Continue with Matrix',
    createAccountLabel: 'Create account',
    onTogglePasswordForm: () => {},
    passwordFormLabel: 'Sign in with password',
    user: '',
    onUserChange: () => {},
    password: '',
    onPasswordChange: () => {},
    passwordLoading: false,
    passwordError: null,
    onSignIn: () => {},
  },
};
