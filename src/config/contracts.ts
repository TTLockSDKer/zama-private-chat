
import ConfidentialMessagingABI from '../abi/ConfidentialMessaging.json';
import ConfidentialBankingABI from '../abi/ConfidentialBanking.json';


const CONFIDENTIAL_CONTRACTS = {
  BANKING: "0x426aeB7c23aE32d4094C469dae7441E9bE567Bc9",
  MESSAGING: "0x9a3183030840Deb55E30653975518409785C76D0"
} as const;

const UNIFIED_CONFIG = {
  CONFIDENTIAL_CONTRACTS,
  
  CONTRACT_ADDRESS: CONFIDENTIAL_CONTRACTS.MESSAGING,


  ZAMA_CONTRACTS: {

    aclContractAddress: "0x687820221192C5B662b25367F70076A37bc79b6c",

    kmsContractAddress: "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",

    inputVerifierContractAddress: "0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4",

    verifyingContractAddressDecryption: "0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1",

    verifyingContractAddressInputVerification: "0x7048C39f048125eDa9d678AEbaDfB22F7900a29F",

    chainId: 11155111,

    gatewayChainId: 55815,

    network: process.env.NEXT_PUBLIC_RPC_URL || "https://eth-sepolia.public.blastapi.io",
    gatewayUrl: "https://gateway.sepolia.zama.ai/",
    relayerUrl: "https://relayer.testnet.zama.cloud"
  },

  WALLETCONNECT: {
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'b996637b735ebd42362f5f53544b36b5'
  },

  NETWORK: {
    name: "sepolia",
    chainId: 11155111,
    gatewayChainId: 55815,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://eth-sepolia.public.blastapi.io",
    explorerUrl: "https://sepolia.etherscan.io"
  },

  DEFAULT_SESSION_DURATION: 3600,

  GAS_LIMITS: {
    startSession: 150000,
    sendMessage: 300000,
    sendTransfer: 350000,
    claimFunds: 200000
  }
};

export { CONFIDENTIAL_CONTRACTS };
export const BANKING_ADDRESS = CONFIDENTIAL_CONTRACTS.BANKING;
export const MESSAGING_ADDRESS = CONFIDENTIAL_CONTRACTS.MESSAGING;
export const CONTRACT_ADDRESS = MESSAGING_ADDRESS;

export const fheConfig = {
  aclContractAddress: '0x687820221192C5B662b25367F70076A37bc79b6c',
  kmsContractAddress: '0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC',
  inputVerifierContractAddress: '0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4',
  verifyingContractAddressDecryption: '0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1',
  verifyingContractAddressInputVerification: '0x7048C39f048125eDa9d678AEbaDfB22F7900a29F',
  relayerUrl: 'https://relayer.testnet.zama.cloud',
};
export const CONTRACT_ABI = ConfidentialMessagingABI.abi;
export const MESSAGING_ABI = ConfidentialMessagingABI.abi;
export const BANKING_ABI = ConfidentialBankingABI.abi;

// 官方 Zama Sepolia 配置 - 来源: https://docs.zama.ai/fhevm/frontend/webapp
export const ZAMA_CONTRACTS = UNIFIED_CONFIG.ZAMA_CONTRACTS;
export const ZAMA_SYSTEM_CONTRACTS = {
  inputVerificationAddress: ZAMA_CONTRACTS.inputVerifierContractAddress,
  fhevmExecutor: ZAMA_CONTRACTS.aclContractAddress,
};
export const SEPOLIA_CHAIN_ID = UNIFIED_CONFIG.NETWORK.chainId;
export const GATEWAY_CHAIN_ID = UNIFIED_CONFIG.NETWORK.gatewayChainId;
export const DEFAULT_SESSION_DURATION = UNIFIED_CONFIG.DEFAULT_SESSION_DURATION;
export const GAS_LIMITS = UNIFIED_CONFIG.GAS_LIMITS;
export function validateContractAddress(address: string): boolean {
  try {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return false;
    }
    const hex = address.slice(2);
    return /^[0-9a-fA-F]{40}$/.test(hex);
  } catch {
    return false;
  }
}

export function getNetworkConfig() {
  return {
    chainId: SEPOLIA_CHAIN_ID,
    gatewayChainId: GATEWAY_CHAIN_ID,
    contracts: ZAMA_CONTRACTS,
    systemContracts: ZAMA_SYSTEM_CONTRACTS,
    contractAddress: CONTRACT_ADDRESS,
    confidentialContracts: CONFIDENTIAL_CONTRACTS
  };
}

export function getContractAddress(moduleName: keyof typeof CONFIDENTIAL_CONTRACTS): string {
  const address = CONFIDENTIAL_CONTRACTS[moduleName];
  if (!validateContractAddress(address)) {
    throw new Error(`Invalid contract address for ${moduleName}: ${address}`);
  }
  return address;
}

export function getAllContractAddresses() {
  return {
    banking: CONFIDENTIAL_CONTRACTS.BANKING,
    messaging: CONFIDENTIAL_CONTRACTS.MESSAGING
  };
}

export function validateAllContractAddresses(): boolean {
  return Object.values(CONFIDENTIAL_CONTRACTS).every(address => validateContractAddress(address));
}

export function getContractDescription(moduleName: keyof typeof CONFIDENTIAL_CONTRACTS): string {
  const descriptions = {
    BANKING: "机密银行合约 - 零转换设计，隐私友好转账",
    MESSAGING: "机密消息合约 - 统一euint32，零gas查询"
  };
  return descriptions[moduleName] || "未知合约";
}

export function getContractABI(moduleName: keyof typeof CONFIDENTIAL_CONTRACTS): unknown[] {
  const abis = {
    BANKING: ConfidentialBankingABI.abi,
    MESSAGING: ConfidentialMessagingABI.abi
  };
  return abis[moduleName] || [];
}

export { UNIFIED_CONFIG }; 