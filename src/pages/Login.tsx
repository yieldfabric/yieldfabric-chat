import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { LoginAltMethods, LoginComponent, useAuth } from '@yieldfabric/wallet';

import DocLink from '../components/DocLink';
import { DOCS } from '../docs';

/**
 * Sign-in screen. All auth logic is the wallet-SDK's:
 *
 *   - `<LoginComponent render>` owns the email/password form state,
 *     validation, submission, and error lifecycle — this file only
 *     describes the JSX shape.
 *   - `<LoginAltMethods />` renders the alternative sign-in chips
 *     (wallet signature / passkey / providers) based on what the auth
 *     service advertises at `auth.providers.enabled`.
 *
 * Both are themed entirely by the semantic Tailwind tokens defined in
 * tailwind.config.js.
 */
export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <span
          aria-hidden
          className="h-10 w-10 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin"
        />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/chat" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink-deep">
            <span className="h-8 w-8 rounded-lg bg-brand-600 text-white grid place-items-center text-sm font-bold">
              YF
            </span>
            YieldFabric Chat
          </span>
          <p className="mt-3 text-sm text-ink-soft">
            Reference chat app — sign in with your YieldFabric account.
          </p>
        </div>

        <div className="bg-white border border-line rounded-xl shadow-card p-6">
          <LoginComponent
            options={{
              services: ['vault', 'payments'],
              autoRedirect: false,
              onSuccess: () => navigate('/chat'),
            }}
            render={({ values, handleChange, handleSubmit, isSubmitting, error, clearError }) => (
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="block text-xs font-medium text-ink-soft mb-1">Email</span>
                  <input
                    type="email"
                    autoFocus
                    value={values.email}
                    onChange={(e) => {
                      handleChange('email', e.target.value);
                      if (error) clearError();
                    }}
                    disabled={isSubmitting}
                    placeholder="you@example.com"
                    className="field"
                    required
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-ink-soft mb-1">Password</span>
                  <input
                    type="password"
                    value={values.password}
                    onChange={(e) => {
                      handleChange('password', e.target.value);
                      if (error) clearError();
                    }}
                    disabled={isSubmitting}
                    placeholder="••••••••"
                    className="field"
                    required
                  />
                </label>

                {error && (
                  <div className="rounded-md border border-status-error-text/20 bg-status-error-bg px-3 py-2 text-xs text-status-error-text">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
                  {isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          />

          <div className="flex items-center gap-3 my-5">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[10px] uppercase tracking-widest text-ink-mute font-semibold">
              Or continue with
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          {/* Averer is excluded: it needs the external Averer SDK,
              which this example deliberately doesn't load (see
              `disableGlobalSigner` in App.tsx). The chip row otherwise
              follows whatever the auth service advertises. */}
          <LoginAltMethods exclude={['averer']} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-mute">
          Open-source tutorial app. Learn the pieces:{' '}
          <DocLink href={DOCS.guide} title="The LLM-access guide this app follows">
            LLM access
          </DocLink>{' '}
          ·{' '}
          <DocLink href={DOCS.auth} title="Sign-in flows and API keys">
            authentication
          </DocLink>{' '}
          ·{' '}
          <DocLink href={DOCS.agentsApi} title="Every endpoint this app calls">
            API reference
          </DocLink>
        </p>
      </div>
    </div>
  );
}
