// renderer/src/web3/config.js
// Wagmi v2 config targeting Celo Mainnet + Alfajores.
// IS_WEB / IS_MINIPAY flags are used to branch Electron vs browser code paths.

import { createConfig, http } from 'wagmi';
import { celo, celoSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [celo, celoSepolia],
  connectors: [
    injected(), // MiniPay injects window.ethereum — picked up automatically
  ],
  transports: {
    [celo.id]: http('https://forno.celo.org'), // Switching to official Forno as Ankr returns 403
    [celoSepolia.id]: http('https://alfajores-forno.celo-testnet.org'), // Or forno.celo-sepolia.celo-testnet.org
  },
});

// True only when running inside MiniPay's in-app browser
export const IS_MINIPAY =
  typeof window !== 'undefined' &&
  typeof window.ethereum !== 'undefined' &&
  window.ethereum.isMiniPay === true;

// True when running as a web app (not inside Electron shell).
// ipcService.js Proxy fallback handles null returns, but this flag lets
// hooks skip IPC entirely and use webAudioService via WebSocket instead.
export const IS_WEB =
  typeof window !== 'undefined' &&
  typeof window.electronAPI === 'undefined';
