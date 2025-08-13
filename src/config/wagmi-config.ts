import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { sepolia } from 'viem/chains';
import { http } from 'viem';
import { Config, createConfig } from 'wagmi';
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { UNIFIED_CONFIG } from './contracts';

const RPC_URLS = [
  UNIFIED_CONFIG.NETWORK.rpcUrl,
  'https://rpc.sepolia.org',
  'https://ethereum-sepolia.publicnode.com',
  'https://sepolia.drpc.org',
];

// WalletConnect projectId（https://cloud.walletconnect.com/）
const projectId = UNIFIED_CONFIG.WALLETCONNECT.projectId;

let config: Config | null = null;

export function getWagmiConfig(): Config {
  if (config) {
    return config;
  }

  // 手动配置钱包连接器，排除 Coinbase Wallet 以避免 CORS 冲突
  const connectors = connectorsForWallets(
    [
      {
        groupName: 'Recommended',
        wallets: [
          metaMaskWallet,
          walletConnectWallet,
          injectedWallet,
        ],
      },
    ],
    {
      appName: 'FHE Zama Next App',
      projectId,
    }
  );

  config = createConfig({
    chains: [sepolia],
    connectors,
    transports: {
      [sepolia.id]: http(RPC_URLS[0], { batch: true })
    },
    ssr: true
  });

  return config;
} 