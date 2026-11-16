import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyLoginForm } from '../../proxy/proxy-login-form.js';

const meta: Meta<typeof ProxyLoginForm> = {
  title: 'Proxy/LoginForm',
  component: ProxyLoginForm,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProxyLoginForm>;

export const Default: Story = {
  args: {
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    signInLabel: 'Sign in',
    onSubmit: () => {},
    user: '',
    onUserChange: () => {},
    password: '',
    onPasswordChange: () => {},
    invalid: false,
    loading: false,
  },
};

export const WithError: Story = {
  args: {
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    signInLabel: 'Sign in',
    onSubmit: () => {},
    user: '',
    onUserChange: () => {},
    password: '',
    onPasswordChange: () => {},
    invalid: true,
    error: 'Invalid credentials',
    loading: false,
  },
};
