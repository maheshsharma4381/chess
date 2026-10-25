import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '@/components/auth/AuthForm';
import { UserMenu } from '@/components/auth/UserMenu';
import { ApiError, type Api } from '@/lib/api/client';
import { createSessionStore } from '@/lib/api/session';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

const alice = { id: 'u1', email: 'a@x.com', username: 'alice', displayName: 'Alice' };

function fakeApi(
  routes: Record<string, (init?: { json?: unknown }) => unknown>,
): Api & ReturnType<typeof vi.fn> {
  return vi.fn(async (path: string, init?: { json?: unknown }) => {
    const handler = routes[path];
    if (!handler) throw new ApiError(404, 'Not found');
    return handler(init);
  }) as never;
}

describe('<AuthForm mode="signup">', () => {
  it('creates the account and goes to the next page', async () => {
    const api = fakeApi({
      '/auth/providers': () => ({ password: true, google: false }),
      '/auth/signup': () => ({ user: alice }),
    });
    const store = createSessionStore(api);
    render(<AuthForm mode="signup" next="/play/bots" api={api} store={store} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.com');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/play/bots'));
    expect(api).toHaveBeenCalledWith('/auth/signup', {
      method: 'POST',
      json: { email: 'a@x.com', password: 'correct horse', username: 'alice' },
    });
    expect(store.getState().user).toEqual(alice);
  });

  it('shows server errors next to the field they concern', async () => {
    const api = fakeApi({
      '/auth/providers': () => ({ password: true, google: false }),
      '/auth/signup': () => {
        throw new ApiError(409, 'Email already registered', { email: 'Email already registered' });
      },
    });
    render(<AuthForm mode="signup" api={api} store={createSessionStore(api)} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.com');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const email = screen.getByLabelText('Email');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveAccessibleDescription('Email already registered');
    expect(push).not.toHaveBeenCalled();
  });

  it('validates the password length before sending', async () => {
    const api = fakeApi({ '/auth/providers': () => ({ password: true, google: false }) });
    render(<AuthForm mode="signup" api={api} store={createSessionStore(api)} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.com');
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters');
    expect(api).not.toHaveBeenCalledWith('/auth/signup', expect.anything());
  });
});

describe('<AuthForm mode="login">', () => {
  it('signs in, and reports a wrong password as a form error', async () => {
    let attempts = 0;
    const api = fakeApi({
      '/auth/providers': () => ({ password: true, google: true }),
      '/auth/login': () => {
        attempts++;
        if (attempts === 1) throw new ApiError(401, 'Wrong email or password');
        return { user: alice };
      },
    });
    render(<AuthForm mode="login" api={api} store={createSessionStore(api)} />);
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/v1/auth/google/start',
    );
    await userEvent.type(screen.getByLabelText('Email'), 'a@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong one');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('explains a failed Google sign-in from the redirect', async () => {
    const api = fakeApi({ '/auth/providers': () => ({ password: true, google: true }) });
    render(
      <AuthForm mode="login" error="google_unverified" api={api} store={createSessionStore(api)} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/verified/i);
  });

  it('says accounts are unavailable when there is no server', async () => {
    const api = vi.fn(async () => {
      throw new ApiError(404, 'Not found', undefined, true);
    }) as never;
    render(<AuthForm mode="login" api={api} store={createSessionStore(api)} />);
    expect(await screen.findByText(/accounts are not available/i)).toBeInTheDocument();
  });
});

describe('<UserMenu>', () => {
  it('links to the profile and logs out', async () => {
    const api = fakeApi({ '/me': () => ({ user: alice }), '/auth/logout': () => undefined });
    const store = createSessionStore(api);
    render(<UserMenu store={store} />);
    expect(await screen.findByRole('link', { name: 'alice' })).toHaveAttribute(
      'href',
      '/profile/alice',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/signup');
  });

  it('shows nothing when accounts are unavailable', async () => {
    const api = vi.fn(async () => {
      throw new ApiError(404, 'Not found', undefined, true);
    }) as never;
    const store = createSessionStore(api);
    const { container } = render(<UserMenu store={store} />);
    await waitFor(() => expect(store.getState().status).toBe('unavailable'));
    expect(container).toBeEmptyDOMElement();
  });
});
