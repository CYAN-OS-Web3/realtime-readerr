// renderer/src/components/PaymentGate.jsx
// Payment wall for MiniPay web context.
// Shows a cUSD payment screen before unlocking the translation app.
// In Electron context this is never rendered (IS_WEB guards usage in App.jsx).

import React, { useState } from 'react';
import { payCUSD, TARGET_CHAIN_ID, isTestnet } from '../web3/payment';
import { useAccount, useDisconnect, useConnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { CreditCard, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const PLAN_PRICE_CUSD = 1.0; // 1 cUSD per 24-hour session
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function getExistingSession() {
  try {
    const raw = localStorage.getItem('minipay_session_paid');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() < parsed.expiry) return parsed;
    localStorage.removeItem('minipay_session_paid');
    return null;
  } catch {
    return null;
  }
}

export const PaymentGate = ({ onPaymentSuccess, children }) => {
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(() => !!getExistingSession());

  if (paid) return children;

  const handlePay = async () => {
    if (!isConnected) {
      setError('Wallet not connected. Open this app inside MiniPay.');
      return;
    }
    setPaying(true);
    setError(null);
    try {
      let currentChainId = chainId;
      if (window.ethereum) {
        const rawChainId = await window.ethereum.request({ method: 'eth_chainId' });
        currentChainId = parseInt(rawChainId, 16);
      }

      if (currentChainId !== TARGET_CHAIN_ID) {
        if (!switchChainAsync) {
          throw new Error(`Please switch to ${isTestnet ? 'Celo Sepolia' : 'Celo Mainnet'} manually.`);
        }
        try {
          await switchChainAsync({ chainId: TARGET_CHAIN_ID });
        } catch (switchError) {
          console.error("Chain switch failed:", switchError);
          throw new Error(`Auto-switch failed (${switchError.message || 'RPC 403'}). Please switch your wallet network to ${isTestnet ? 'Celo Sepolia' : 'Celo Mainnet'} manually.`);
        }
      }
      
      const { hash, address: paidAddress } = await payCUSD(PLAN_PRICE_CUSD);
      const expiry = Date.now() + SESSION_DURATION_MS;
      localStorage.setItem(
        'minipay_session_paid',
        JSON.stringify({ hash, expiry, address: paidAddress })
      );
      setPaid(true);
      onPaymentSuccess?.({ hash, address: paidAddress });
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] text-gray-100 px-6">
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.08)' }}
        className="rounded-3xl p-8 max-w-sm w-full text-center backdrop-blur-sm">

        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-cyan-500/10 border border-dashed border-cyan-500/30 flex items-center justify-center">
          <CreditCard className="w-8 h-8 text-cyan-400" />
        </div>

        <h2 className="text-xl font-black text-white mb-1 uppercase tracking-widest">
          CyanOS Translator
        </h2>
        <p className="text-xs font-black text-cyan-400/60 uppercase tracking-[0.3em] mb-6">
          Powered by Celo
        </p>

        <div className="bg-black/30 rounded-2xl p-4 mb-6 border border-dashed border-gray-800">
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            Unlock real-time speech translation for 24 hours.
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-black text-white">{PLAN_PRICE_CUSD}</span>
            <span className="text-lg font-bold text-cyan-400">cUSD</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">per session · 24 hours</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          <p className="font-mono text-xs text-gray-500 break-all">
            {address ? `${address.slice(0, 10)}...${address.slice(-8)}` : 'Not Connected'}
          </p>
          <button 
            onClick={() => {
              disconnect();
              setTimeout(() => connect({ connector: injected() }), 500);
            }}
            className="text-gray-500 hover:text-cyan-400 transition-colors"
            title="Reconnect Wallet"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-red-400 text-xs mb-4 bg-red-500/10 rounded-xl p-3 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          id="minipay-pay-btn"
          onClick={handlePay}
          disabled={paying || !isConnected}
          className="w-full py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all"
          style={{
            background: paying || !isConnected ? 'rgba(6,182,212,0.3)' : '#06b6d4',
            color: paying || !isConnected ? 'rgba(0,0,0,0.4)' : '#000',
            cursor: paying || !isConnected ? 'not-allowed' : 'pointer',
          }}
        >
          {paying ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming on Celo...
            </span>
          ) : chainId !== TARGET_CHAIN_ID && isConnected ? (
            `Switch to ${isTestnet ? 'Celo Sepolia' : 'Celo Mainnet'}`
          ) : (
            `Pay ${PLAN_PRICE_CUSD} cUSD`
          )}
        </button>

        <p className="text-xs text-gray-600 mt-4">
          Transaction confirmed on {isTestnet ? 'Celo Sepolia' : 'Celo Mainnet'} · No subscription
        </p>
      </div>
    </div>
  );
};
