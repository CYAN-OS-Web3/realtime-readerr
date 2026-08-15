// renderer/src/web3/payment.js
// cUSD on-chain payment via viem (MiniPay-compatible: legacy transactions only).
// Uses window.ethereum injected by MiniPay — no external wallet required.

import { createWalletClient, createPublicClient, custom, parseUnits } from 'viem';
import { celo } from 'viem/chains';

const celoSepolia = {
  id: 11142220,
  name: 'Celo Sepolia',
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: { default: { http: ['https://forno.celo-sepolia.celo-testnet.org'] } },
};

// Map known chain IDs to human-readable names for better error messages
const CHAIN_NAMES = {
  1: 'Ethereum Mainnet',
  42220: 'Celo Mainnet',
  11142220: 'Celo Sepolia Testnet',
  42161: 'Arbitrum One',
  10: 'Optimism',
  137: 'Polygon Mainnet',
  8453: 'Base Mainnet',
};

export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || '';
export const isTestnet = import.meta.env.VITE_USE_TESTNET === 'true';

export const TARGET_CHAIN_ID = isTestnet ? 11142220 : 42220;
export const targetChain = isTestnet ? celoSepolia : celo;
const CUSD_ADDRESS = isTestnet 
  ? '0x01C5C0122039549AD1493B8220cABEdD739BC44E' // Sepolia USDC (Circle)
  : '0x765DE816845861e75A25fCA122bb6898B8B1282a'; // Mainnet cUSD

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
    throw new Error('window.ethereum not found. Open this app inside MiniPay.');
  }

  if (!TREASURY_ADDRESS || TREASURY_ADDRESS === '') {
    throw new Error('VITE_TREASURY_ADDRESS is not configured. Check renderer/.env');
  }

  let rawChainId = await window.ethereum.request({ method: 'eth_chainId' });
  let chainIdNum;
  
  if (typeof rawChainId === 'string' && rawChainId.startsWith('0x')) {
    chainIdNum = parseInt(rawChainId, 16);
  } else {
    chainIdNum = parseInt(rawChainId, 10);
  }

  if (chainIdNum !== TARGET_CHAIN_ID) {
    const networkName = isTestnet ? 'Celo Sepolia Testnet' : 'Celo Mainnet';
    const detectedNetwork = CHAIN_NAMES[chainIdNum] || `Unknown network (chain ID: ${chainIdNum})`;
    throw new Error(`Please switch MiniPay to ${networkName} to make a payment. (Detected: ${detectedNetwork})`);
  }

  const walletClient = createWalletClient({
    chain: targetChain,
    transport: custom(window.ethereum),
  });

  const publicClient = createPublicClient({
    chain: targetChain,
    transport: custom(window.ethereum),
  });

  const [address] = await walletClient.getAddresses();
  
  // USDC uses 6 decimals on testnet, cUSD uses 18 decimals on mainnet
  const decimals = isTestnet ? 6 : 18;
  const amount = parseUnits(String(amountUSD), decimals); 

  console.log(`[Payment] Fetching balance for address ${address} on contract ${CUSD_ADDRESS}...`);
  const balance = await publicClient.readContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  });

  if (balance < amount) {
    const tokenName = isTestnet ? 'Testnet USDC' : 'cUSD';
    throw new Error(
      `Insufficient ${tokenName} balance. You need ${amountUSD} ${tokenName} to unlock a session.`
    );
  }

  console.log(`[Payment] Initializing transfer of ${amountUSD} ${isTestnet ? 'USDC' : 'cUSD'} to ${TREASURY_ADDRESS}...`);
  const hash = await walletClient.writeContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [TREASURY_ADDRESS, amount],
    account: address,
    chain: targetChain,
  });
  console.log(`[Payment] Transaction sent! Hash: ${hash}`);

  console.log(`[Payment] Waiting for transaction receipt for ${hash}...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[Payment] Transaction receipt received! Status: ${receipt.status}`, receipt);
  return { hash, receipt, address };
}
