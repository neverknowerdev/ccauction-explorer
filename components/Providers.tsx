'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { MiniAppProvider } from '@/contexts/MiniAppContext';
import { useState, useMemo } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  
  const wagmiConfig = useMemo(() => {
    return createConfig({
      chains: [base],
      transports: {
        [base.id]: http(),
      },
      connectors: [farcasterMiniApp()],
    });
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniAppProvider>{children}</MiniAppProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
