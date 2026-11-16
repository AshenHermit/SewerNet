import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProxyLoginForm } from '../../proxy/proxy-login-form';

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
    submitLabel: 'Sign in',
    onSubmit: () => undefined,
    user: '',
    onUserChange: () => undefined,
    password: '',
    onPasswordChange: () => undefined,
    invalid: false,
    loading: false,
  },
};

export const WithError: Story = {
  args: {
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    submitLabel: 'Sign in',
    onSubmit: () => undefined,
    user: '',
    onUserChange: () => undefined,
    password: '',
    onPasswordChange: () => undefined,
    invalid: true,
    error: 'Invalid credentials',
    loading: false,
  },
};

