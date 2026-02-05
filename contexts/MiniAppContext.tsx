'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';

interface MiniAppContextType {
  username: string | null;
  walletAddress: string | null;
  isReady: boolean;
  fid: number | null;
  profilePicture: string | null;
  isMiniApp: boolean;
}

const MiniAppContext = createContext<MiniAppContextType>({
  username: null,
  walletAddress: null,
  isReady: false,
  fid: null,
  profilePicture: null,
  isMiniApp: false,
});

function MiniAppContextProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [fid, setFid] = useState<number | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [isMiniApp, setIsMiniApp] = useState(false);
  const { address } = useAccount();

  useEffect(() => {
    // Initialize Farcaster Mini App
    const initializeMiniApp = async () => {
      // Only run on client side
      if (typeof window === 'undefined') return;

      try {
        // Use SDK to detect if we're in a mini-app
        const inMiniApp = await sdk.isInMiniApp();
        setIsMiniApp(inMiniApp);

        if (inMiniApp) {
          // Call ready() when page loads to hide splash screen
          await sdk.actions.ready();

          // Get user data from context (context is a Promise)
          const context = await sdk.context;
          if (context?.user) {
            const user = context.user;
            setFid(user.fid);

            if (user.displayName) {
              setUsername(user.displayName);
            } else if (user.username) {
              setUsername(user.username);
            } else {
              setUsername('Guest');
            }

            if (user.pfpUrl) {
              setProfilePicture(user.pfpUrl);
            }
          } else {
            setUsername('Guest');
          }
        } else {
          // Not in mini-app, set defaults for web
          setUsername(null);
        }

        setIsReady(true);
      } catch (error) {
        console.error('Error initializing Farcaster Mini App:', error);
        // Fallback for development
        setUsername('DemoUser');
        setIsMiniApp(false);
        setIsReady(true);
      }
    };

    initializeMiniApp();
  }, []);

  return (
    <MiniAppContext.Provider value={{ username, walletAddress: address || null, isReady, fid, profilePicture, isMiniApp }}>
      {children}
    </MiniAppContext.Provider>
  );
}

export function MiniAppProvider({ children }: { children: ReactNode }) {
  return <MiniAppContextProvider>{children}</MiniAppContextProvider>;
}

export function useMiniApp() {
  return useContext(MiniAppContext);
}
