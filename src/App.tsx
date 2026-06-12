import React from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { WalletProvider } from '@yieldfabric/wallet';

import RequireAuth from './components/RequireAuth';
import Login from './pages/Login';
import Chat from './pages/Chat';

/**
 * Root providers. `<WalletProvider>` is the wallet-SDK's single mount
 * point: it owns the auth session (tokens, refresh, the `useAuth`
 * hook) and every SDK UI surface.
 *
 * `disableGlobalSigner: true` — this example never signs on-chain
 * operations from the browser, so the global wallet-signer (which
 * lazy-loads the external Averer SDK after login) is dead weight. If
 * you extend the example into payments / obligations, remove the flag
 * and mount `<SignatureWorkflow />` next to your routes — see
 * tncshell/frontend for the full pattern.
 */
function RootProviders({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const walletConfig = React.useMemo(
    () => ({
      onNavigate: (href: string, opts?: { replace?: boolean }) =>
        navigate(href, opts?.replace ? { replace: true } : undefined),
      disableGlobalSigner: true,
    }),
    [navigate]
  );
  return <WalletProvider config={walletConfig}>{children}</WalletProvider>;
}

export default function App() {
  return (
    <RootProviders>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <Chat />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </RootProviders>
  );
}
