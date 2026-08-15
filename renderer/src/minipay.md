# CyanOS → MiniPay dApp Integration Guide

## What is MiniPay?

MiniPay is a mobile stablecoin wallet by Opera built on the Celo blockchain. It exposes an
in-app browser that injects `window.ethereum` (EIP-1193) automatically, so your web app
auto-connects without any wallet-picker UI. Users of MiniPay in Africa and emerging markets
can pay for services with USDC/USDT/cUSD directly inside the app.

This guide explains exactly how to turn the **CyanOS renderer** (currently an Electron
React app) into a standalone web dApp that runs inside MiniPay and gates feature access
behind on-chain payments.

---

## Architecture Understanding

Before diving in, understand what CyanOS currently is and what must change.

### Current Architecture (Electron)

```
Electron Main (main.js)
  ├── Audio capture + WebSocket to backend
  ├── IPC bridge (preload.js)
  └── Renderer (renderer/src/) ← React UI

renderer/src/
  ├── App.jsx                   ← root shell
  ├── components/               ← UI components
  ├── hooks/                    ← audio pipeline, translation feed, auth
  ├── services/ipcService.js    ← talks to Electron IPC (window.electronAPI)
  ├── services/summarizeService.js
  └── store/useStore.js         ← Zustand global state
```

The **critical blocker**: `ipcService.js` calls `window.electronAPI` which only exists
inside Electron. In MiniPay (a browser), these calls silently return `null` via the Proxy
fallback already coded in lines 15-23 of `ipcService.js`. That fallback is your escape hatch.

### Target Architecture (MiniPay Web dApp)

```
MiniPay Browser
  └── Your deployed HTTPS URL
        ├── React app (renderer/src/)  ← same code, minimal changes
        ├── window.ethereum injected by MiniPay (Celo chain, ID 42220)
        └── Backend API (translator-gateway.fly.dev)  ← unchanged
```

The audio pipeline must move from IPC (Electron) to a **WebSocket connection directly to
your backend** from the browser. The translator-gateway backend already exists at
`https://translator-gateway.fly.dev`.

---

## Step 1: Understand MiniPay Hard Requirements

Before writing a line of code, internalize these hard constraints:

| Requirement | Detail |
|---|---|
| HTTPS only | Your URL must be `https://`. `http://localhost` will be blocked. |
| Auto-connect | Never show a "Connect Wallet" button. Connect on mount via `window.ethereum`. |
| `window.ethereum.isMiniPay` | This flag is `true` only inside MiniPay. Use it to detect the environment. |
| Celo Mainnet | Chain ID `42220`. Celo Sepolia testnet is `11142220`. |
| No EIP-1559 | Use legacy transactions only (`gasPrice`, not `maxFeePerGas`). |
| Stablecoins | USDC, USDT, cUSD are the native payment tokens. |
| Mobile-first | MiniPay runs on Android/iOS. Design for ~375px wide screens. |
| No Electron APIs | `window.electronAPI` will be `undefined`. Must use browser APIs only. |

---

## Step 2: Create a Standalone Web Build Target

The renderer is already a Vite + React app. You need to make it deployable independently
without the Electron shell.

### 2.1 Update `renderer/vite.config.js`

```js
// renderer/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'electron' ? './' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',  // required for ngrok to tunnel to
    port: 5173,
  },
}));
```

### 2.2 Add a web build script to `renderer/package.json`

```json
{
  "scripts": {
    "dev": "npx vite",
    "dev:web": "npx vite --host 0.0.0.0",
    "build": "npx vite build",
    "build:web": "npx vite build --mode web",
    "preview": "vite preview --host 0.0.0.0"
  }
}
```

---

## Step 3: Install Web3 Dependencies

Inside `renderer/`:

```bash
npm install viem@2 wagmi@2 @tanstack/react-query
```

- **viem**: Celo-native EVM library (recommended over ethers.js for Celo fee abstraction)
- **wagmi**: React hooks wrapping viem for wallet state management
- **@tanstack/react-query**: Required peer dep by wagmi v2

Do not install ethers.js. MiniPay's custom transaction types (fee currency) are only
supported correctly by viem.

---

## Step 4: Create the Wagmi + Celo Configuration

Create a new file: `renderer/src/web3/config.js`

```js
// renderer/src/web3/config.js
import { createConfig, http } from 'wagmi';
import { celo, celoAlfajores } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [celo, celoAlfajores],
  connectors: [
    injected(),
  ],
  transports: {
    [celo.id]: http(),
    [celoAlfajores.id]: http(),
  },
});

// True only when running inside MiniPay browser
export const IS_MINIPAY =
  typeof window !== 'undefined' &&
  typeof window.ethereum !== 'undefined' &&
  window.ethereum.isMiniPay === true;

// True when running as a web app (not inside Electron)
export const IS_WEB =
  typeof window !== 'undefined' &&
  typeof window.electronAPI === 'undefined';
```

---

## Step 5: Add Wagmi Provider to the App Entry Point

Wrap the entire app in `renderer/src/main.jsx`:

```jsx
// renderer/src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { wagmiConfig } from './web3/config';

const queryClient = new QueryClient();

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);

window.addEventListener('error', (error) => {
  console.error('Uncaught error:', error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
```

---

## Step 6: Create the MiniPay Auto-Connect Hook

Create `renderer/src/hooks/useMiniPayConnect.js`:

```js
// renderer/src/hooks/useMiniPayConnect.js
import { useEffect } from 'react';
import { useConnect, useAccount } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { IS_WEB } from '../web3/config';

export function useMiniPayConnect() {
  const { connect } = useConnect();
  const { isConnected, address } = useAccount();

  useEffect(() => {
    // Only run in web/MiniPay context
    if (!IS_WEB) return;
    // Already connected
    if (isConnected) return;

    if (typeof window.ethereum === 'undefined') {
      console.warn('[MiniPay] window.ethereum not found. Open this inside MiniPay.');
      return;
    }

    // Auto-connect to injected provider — MiniPay requirement
    connect({ connector: injected() });
  }, [connect, isConnected]);

  return { isConnected, address };
}
```

MiniPay's spec requires auto-connect on page mount. This hook fires once silently.
Never add a "Connect Wallet" button — it violates MiniPay's UX policy.

---

## Step 7: Update `App.jsx` to Use MiniPay Wallet Identity

The current auth flow in `App.jsx` opens an OAuth URL via `ipcService.openExternal()`,
which is Electron-only. In MiniPay, the user's identity IS their wallet address.

Add the following inside `AppShell`, after the existing hooks:

```jsx
// At the top of App.jsx, add these imports:
import { SignJWT } from 'jose';
import { useMiniPayConnect } from './hooks/useMiniPayConnect';
import { IS_WEB } from './web3/config';

// Inside AppShell, after existing hook calls:
const { address: walletAddress } = useMiniPayConnect();

React.useEffect(() => {
  if (!IS_WEB || !walletAddress) return;
  addLog(`Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`, 'success');

  const generateMiniPayToken = async () => {
      try {
          // Since this runs client-side inside MiniPay, we can self-sign a JWT
          // that the backend will accept, because the backend relies on the same VITE_JWT_SECRET
          const secretStr = import.meta.env.VITE_JWT_SECRET || "9b7f3a0d7a4d2f8c0b6f2f7b1a0c9d4e3b2a1c0d9e8f7a6b5c4d3e2f1a0b9c8d";
          const secret = new TextEncoder().encode(secretStr);

          // Check if they have an active 24-hour paid session
          let currentPlan = "free";
          try {
              const rawSession = localStorage.getItem('minipay_session_paid');
              if (rawSession) {
                  const parsed = JSON.parse(rawSession);
                  if (Date.now() < parsed.expiry) {
                      currentPlan = "pro";
                  } else {
                      localStorage.removeItem('minipay_session_paid');
                  }
              }
          } catch (e) {
              console.error("Failed to parse minipay session", e);
          }

          const token = await new SignJWT({
              user_id: walletAddress,
              email: `${walletAddress.slice(0, 8)}@minipay.celo`,
              username: `MiniPay ${walletAddress.slice(0, 6)}`,
              plan: currentPlan,
          })
              .setProtectedHeader({ alg: "HS256" })
              .setIssuedAt()
              .setExpirationTime("7d")
              .sign(secret);
          
          setAuthUserId(walletAddress);
          localStorage.setItem('cyan_token', token);
          addLog(`MiniPay session token generated (Plan: ${currentPlan}).`, 'info');
      } catch (err) {
          console.error("[MiniPay] Failed to generate token", err);
      }
  };

  generateMiniPayToken();
}, [walletAddress, setAuthUserId, addLog]);
```

Make sure to install `jose` via `npm install jose` in the `renderer` directory.

The existing Electron OAuth listeners (`onAuthSync`, URL token params) will simply not
fire in the browser — that's fine, they are wrapped in `ipcService` which returns `null`.

---

## Step 8: Abstract the IPC Layer for Browser Audio

The audio pipeline (`useAudioPipeline` hook) currently sends chunks via IPC to Electron,
which forwards them to the Deepgram/Azure WebSocket. In the browser, you need to open
that WebSocket directly.

Create `renderer/src/services/webAudioService.js`:

```js
// renderer/src/services/webAudioService.js
// Handles audio streaming directly to the backend in web/MiniPay context.
// Replaces the IPC -> Electron -> WebSocket path used in the desktop app.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://translator-gateway.fly.dev';

let ws = null;
let onTranslationCallback = null;
let onSTTCallback = null;

export const webAudioService = {
  isWeb: typeof window !== 'undefined' && typeof window.electronAPI === 'undefined',

  connect(token, settings, { onTranslation, onSTT, onStatus }) {
    if (!this.isWeb) return;
    onTranslationCallback = onTranslation;
    onSTTCallback = onSTT;

    const wsUrl = BACKEND_URL
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    ws = new WebSocket(`${wsUrl}/ws/translate?token=${token}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'config', ...settings }));
      onStatus?.('connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'translation') onTranslationCallback?.(data);
      if (data.type === 'stt') onSTTCallback?.(data);
    };

    ws.onclose = () => onStatus?.('disconnected');
    ws.onerror = (err) => {
      console.error('[webAudioService] WS error', err);
      onStatus?.('error');
    };
  },

  sendChunk(buffer) {
    if (!this.isWeb || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(buffer);
  },

  disconnect() {
    if (!this.isWeb) return;
    ws?.close();
    ws = null;
  },
};
```

Then in `useAudioPipeline.js`, add an `IS_WEB` branch wherever audio is sent:

```js
import { webAudioService } from '../services/webAudioService';
import { IS_WEB } from '../web3/config';

// When starting translation:
if (IS_WEB) {
  const token = localStorage.getItem('cyan_token') || '';
  webAudioService.connect(token, settings, {
    onTranslation: (data) => addTranscript(data),
    onSTT: (data) => setLatestPartialTranscript(data.text),
    onStatus: (s) => setWSConnectionState(s),
  });
} else {
  ipcService.toggleTranslation({ isTranslating: true, ...settings, token });
}

// When sending audio chunks from AudioWorklet:
if (IS_WEB) {
  webAudioService.sendChunk(chunk);
} else {
  ipcService.sendAudioChunk(chunk);
}

// When stopping:
if (IS_WEB) {
  webAudioService.disconnect();
} else {
  ipcService.toggleTranslation({ isTranslating: false });
}
```

---

## Step 9: Implement On-Chain Payment Gate

This is the core dApp feature. Users pay cUSD on Celo to unlock a translation session.

### 9.1 Create `renderer/src/web3/payment.js`

```js
// renderer/src/web3/payment.js
import { createWalletClient, createPublicClient, custom, http, parseUnits } from 'viem';
import { celo } from 'viem/chains';

// cUSD contract on Celo mainnet
const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a';

// Your treasury wallet on Celo (replace with your actual address)
const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || '0xYourTreasuryAddress';

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

export async function payCUSD(amountUSD) {
  if (typeof window.ethereum === 'undefined') {
    throw new Error('window.ethereum not found. Open inside MiniPay.');
  }

  const walletClient = createWalletClient({
    chain: celo,
    transport: custom(window.ethereum),
  });

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(),
  });

  const [address] = await walletClient.getAddresses();
  const amount = parseUnits(String(amountUSD), 18); // cUSD = 18 decimals

  const balance = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  if (balance < amount) {
    throw new Error(`Insufficient cUSD balance.`);
  }

  // MiniPay uses legacy transactions — do not use maxFeePerGas / maxPriorityFeePerGas
  const hash = await walletClient.writeContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [TREASURY_ADDRESS, amount],
    account: address,
    chain: celo,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
```

### 9.2 Create `renderer/src/components/PaymentGate.jsx`

```jsx
// renderer/src/components/PaymentGate.jsx
import React, { useState } from 'react';
import { payCUSD } from '../web3/payment';
import { useAccount } from 'wagmi';

const PLAN_PRICE_CUSD = 1.0;

export const PaymentGate = ({ onPaymentSuccess, children }) => {
  const { address, isConnected } = useAccount();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(() => {
    const proof = localStorage.getItem('minipay_session_paid');
    if (!proof) return false;
    const { expiry } = JSON.parse(proof);
    return Date.now() < expiry;
  });

  if (paid) return children;

  const handlePay = async () => {
    if (!isConnected) {
      setError('Wallet not connected. Open this app inside MiniPay.');
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const { hash } = await payCUSD(PLAN_PRICE_CUSD);
      const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24h
      localStorage.setItem(
        'minipay_session_paid',
        JSON.stringify({ hash, expiry, address })
      );
      setPaid(true);
      onPaymentSuccess?.({ hash, address });
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-gray-100 px-6">
      <div className="glass-panel rounded-3xl p-8 max-w-sm w-full text-center">
        <h2 className="text-xl font-black text-white mb-2 uppercase tracking-widest">
          CyanOS Translation
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          Pay {PLAN_PRICE_CUSD} cUSD to unlock a 24-hour translation session.
        </p>
        <p className="font-mono text-xs text-cyan-400 mb-6 break-all">
          {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : 'Connecting...'}
        </p>
        {error && (
          <p className="text-red-400 text-xs mb-4 bg-red-500/10 rounded-lg p-3">{error}</p>
        )}
        <button
          onClick={handlePay}
          disabled={paying || !isConnected}
          className="w-full py-3 rounded-2xl bg-cyan-500 text-black font-black uppercase tracking-widest text-sm hover:bg-cyan-400 transition disabled:opacity-40"
        >
          {paying ? 'Processing...' : `Pay ${PLAN_PRICE_CUSD} cUSD`}
        </button>
      </div>
    </div>
  );
};
```

### 9.3 Wrap the app render with `PaymentGate`

In `App.jsx`, add an `IS_WEB` conditional around the existing content:

```jsx
import { PaymentGate } from './components/PaymentGate';
import { IS_WEB } from './web3/config';

// In AppShell return:
const content = (
  <div className="relative h-screen bg-[#050505] text-gray-100 flex flex-col overflow-hidden font-sans selection:bg-cyan-500/30">
    <BubbleBackground />
    <Header />
    <div className="flex-1 flex overflow-hidden relative z-10">
      <Sidebar />
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {renderContent()}
      </main>
    </div>
    <FloatingOverlay />
    {showConfigModal && <AutoConfigModal />}
    <ProfileModal />
    {/* ... rest of existing JSX ... */}
  </div>
);

return IS_WEB ? (
  <PaymentGate
    onPaymentSuccess={({ hash }) =>
      addLog(`Payment confirmed: ${hash.slice(0, 10)}...`, 'success')
    }
  >
    {content}
  </PaymentGate>
) : content;
```

---

## Step 10: Handle Mobile UI Constraints

MiniPay's in-app browser is ~375px wide. The current layout (sidebar + main panel) won't
fit. You need responsive handling.

### 10.1 Add mobile viewport to `renderer/index.html`

Inside `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

### 10.2 Add responsive CSS to `renderer/src/index.css`

```css
@media (max-width: 768px) {
  .desktop-sidebar { display: none !important; }
  .mobile-tabbar { display: flex !important; }
  body { padding-bottom: 60px; }
}

@media (min-width: 769px) {
  .mobile-tabbar { display: none !important; }
  .desktop-sidebar { display: flex; }
}
```

### 10.3 Create `renderer/src/components/MobileTabBar.jsx`

```jsx
// renderer/src/components/MobileTabBar.jsx
import React from 'react';
import { Mic, FileText, User, List } from 'lucide-react';
import { useStore } from '../store/useStore';

const TABS = [
  { id: 'translation', icon: Mic, label: 'Live' },
  { id: 'summaries', icon: FileText, label: 'Summaries' },
  { id: 'profile', icon: User, label: 'Profile' },
  { id: 'logs', icon: List, label: 'Logs' },
];

export const MobileTabBar = () => {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="mobile-tabbar fixed bottom-0 left-0 right-0 bg-black/90 border-t border-gray-800 z-50">
      {TABS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === id ? 'text-cyan-400' : 'text-gray-500'
          }`}
        >
          <Icon className="w-5 h-5" />
          {label}
        </button>
      ))}
    </div>
  );
};
```

Then in `App.jsx`, replace `<Sidebar />` with:

```jsx
import { MobileTabBar } from './components/MobileTabBar';

// In render, replace <Sidebar /> with:
<>
  <Sidebar className="desktop-sidebar" />
  <MobileTabBar />
</>
```

---

## Step 11: Environment Variables for Web Build

Create `renderer/.env` (or `renderer/.env.production` for Vercel):

```
VITE_BACKEND_URL=https://translator-gateway.fly.dev
VITE_TREASURY_ADDRESS=0xYourRealCeloMainnetAddress
VITE_CHAIN_ID=42220
```

Reference in code via `import.meta.env.VITE_BACKEND_URL`. Never use `process.env` in Vite.

---

## Step 12: Local Testing with ngrok

MiniPay cannot load `http://localhost`. You must expose your dev server over HTTPS.

### 12.1 Start the dev server

```bash
cd renderer
npm run dev:web
# Starts Vite on 0.0.0.0:5173
```

### 12.2 Run ngrok in a separate terminal

```bash
# Install if not present
winget install ngrok

# Tunnel to port 5173
ngrok http 5173
```

ngrok outputs: `https://abc123.ngrok-free.app` — copy this URL.

### 12.3 Enable Developer Mode in MiniPay

1. Open **MiniPay** on your physical Android/iOS device
2. Navigate to **Settings** → **About**
3. Tap the **version number** 5–7 times rapidly
4. A "Developer Mode Enabled" toast appears
5. Go back → find **Developer** section → tap **Load Test Page**
6. Enter your ngrok URL: `https://abc123.ngrok-free.app`
7. Tap **Load**

### 12.4 Verify the injection

Open MiniPay developer tools console and run:

```js
console.log(window.ethereum.isMiniPay);
// → true

console.log(await window.ethereum.request({ method: 'eth_chainId' }));
// → "0xa4ec"  (hex for 42220)

console.log(await window.ethereum.request({ method: 'eth_accounts' }));
// → ["0xYourAddress"]
```

---

## Step 13: Deploy to Vercel

### 13.1 Create `renderer/vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 13.2 Push to GitHub

```bash
cd renderer
git init
git add .
git commit -m "feat: MiniPay dApp build"
git remote add origin https://github.com/yourname/cyan-minipay.git
git push -u origin main
```

### 13.3 Import to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the repository
3. Set **Root Directory** to `renderer/` (if importing the full monorepo)
4. Under **Environment Variables**, add:
   - `VITE_BACKEND_URL` = `https://translator-gateway.fly.dev`
   - `VITE_TREASURY_ADDRESS` = your Celo mainnet address
   - `VITE_CHAIN_ID` = `42220`
5. Click **Deploy**

Vercel gives you `https://your-app.vercel.app` — this is your production MiniPay URL.

---

## Step 14: Verify Full End-to-End Flow

After deploying, test in MiniPay:

1. Open MiniPay → Developer → Load Test Page → enter Vercel URL
2. App loads → auto-connects wallet (no button shown)
3. `PaymentGate` screen appears showing your wallet address
4. Tap **Pay 1 cUSD** → MiniPay native confirmation dialog appears
5. Confirm → on-chain cUSD transfer executes
6. App unlocks → translation UI appears
7. Tap **Start** → browser asks for microphone permission
8. Grant mic → audio streams to `translator-gateway.fly.dev` via WebSocket
9. Translated text appears in `TranslationFeed` in real time

---

## Step 15: Submit to MiniPay Discover (Optional)

Once your app is live and tested:

1. Visit [minipay.xyz](https://minipay.xyz) or the Discover section in MiniPay
2. Find the developer submission form
3. Submit:
   - **App name**: CyanOS Translator
   - **URL**: your Vercel HTTPS URL
   - **Description**: Real-time speech translation with on-chain payments on Celo
   - **Category**: Productivity

---

## Pre-Submission Checklist

- [ ] App auto-connects wallet on load — no "Connect Wallet" button anywhere
- [ ] `window.ethereum.isMiniPay === true` logged on load
- [ ] Served over HTTPS
- [ ] All fetch/WebSocket calls use HTTPS/WSS URLs
- [ ] Microphone requested only after user taps Start (not on mount)
- [ ] Only legacy transactions used — no `maxFeePerGas` / `maxPriorityFeePerGas`
- [ ] Mobile viewport meta tag in `index.html`
- [ ] `MobileTabBar` visible on screens < 768px
- [ ] Graceful error screen when `window.ethereum` is absent
- [ ] `minipay_session_paid` expiry checked correctly (24h)
- [ ] Treasury address is a real Celo mainnet address you control
- [ ] `ipcService.js` Proxy fallback confirmed (returns null, no crashes)
- [ ] `IS_WEB` flag gates all Electron-only codepaths

---

## File Reference: What to Create / Modify

| File | Action | Purpose |
|---|---|---|
| `renderer/src/web3/config.js` | CREATE | Wagmi config + `IS_WEB` / `IS_MINIPAY` flags |
| `renderer/src/web3/payment.js` | CREATE | cUSD payment via viem |
| `renderer/src/hooks/useMiniPayConnect.js` | CREATE | Auto-connect on mount |
| `renderer/src/components/PaymentGate.jsx` | CREATE | Payment wall UI |
| `renderer/src/components/MobileTabBar.jsx` | CREATE | Mobile bottom navigation |
| `renderer/src/services/webAudioService.js` | CREATE | Direct WebSocket audio service |
| `renderer/src/main.jsx` | MODIFY | Wrap with WagmiProvider + QueryClientProvider |
| `renderer/src/App.jsx` | MODIFY | Add auto-connect, PaymentGate, IS_WEB branches |
| `renderer/vite.config.js` | MODIFY | `host: 0.0.0.0`, mode-based base path |
| `renderer/package.json` | MODIFY | Add `dev:web`, `build:web` scripts |
| `renderer/index.html` | MODIFY | Add mobile viewport meta tag |
| `renderer/vercel.json` | CREATE | Vercel SPA config |
| `renderer/.env` | CREATE | `VITE_BACKEND_URL`, `VITE_TREASURY_ADDRESS` |

---

## Key Gotchas

**1. `useStore.js` calls `localStorage` at module init**
Lines 3–8 call `localStorage.getItem()` synchronously at module level. This is valid browser
behavior. No change needed.

**2. IPC events never fire in browser (expected)**
`ipcService.js` lines 76–126 register listeners like `onTranslationUpdate`, `onSTTTranscript`.
These call `window.electronAPI.onXxx()` which returns `null` in the browser via the Proxy.
They will never fire. Replace them with `webAudioService` WebSocket events.

**3. Microphone access in MiniPay**
`navigator.mediaDevices.getUserMedia()` works in MiniPay's browser context. Always trigger
it from a user gesture (button tap), not on page load — browser security policy requires this.

**4. CORS on translator-gateway**
Requests from `https://your-app.vercel.app` to `https://translator-gateway.fly.dev` will
hit CORS. Your backend must respond with:
`Access-Control-Allow-Origin: https://your-app.vercel.app`
During dev, use `Access-Control-Allow-Origin: *`.

**5. Chain ID mismatch**
If a user's MiniPay is on Celo Alfajores testnet, `eth_chainId` returns `"0x2afeec"`.
Your `payCUSD` function targets mainnet (`celo` chain). Add a chain check:

```js
const chainId = await window.ethereum.request({ method: 'eth_chainId' });
if (chainId !== '0xa4ec') {
  throw new Error('Please switch MiniPay to Celo Mainnet.');
}
```

**6. `window.innerWidth` for mobile detection**
Don't rely on `window.innerWidth` at render time — it may not reflect the actual viewport
inside MiniPay's webview on some devices. Use CSS media queries instead (more reliable).
