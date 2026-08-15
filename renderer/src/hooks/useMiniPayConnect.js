// renderer/src/hooks/useMiniPayConnect.js
// Auto-connects to the injected window.ethereum provider on mount.
// MiniPay REQUIRES this — never show a "Connect Wallet" button.

import { useEffect } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { IS_WEB } from '../web3/config';

export function useMiniPayConnect() {
  const { connect } = useConnect();
  const { isConnected, address } = useAccount();

  useEffect(() => {
    // Only run in browser/MiniPay context, not in Electron
    if (!IS_WEB) return;
    // Skip if already connected
    if (isConnected) return;

    if (typeof window.ethereum === 'undefined') {
      console.warn('[MiniPay] window.ethereum not found. Open this app inside MiniPay.');
      return;
    }

    console.log('[MiniPay] Auto-connecting to injected provider...');
    connect({ connector: injected() });
  }, [connect, isConnected]);

  return { isConnected, address };
}
