declare module '@zama-fhe/relayer-sdk' {
  export function initSDK(options?: {
    tfheParams?: {
      wasmBinary?: ArrayBuffer;
      locateFile?: (path: string) => string;
    };
    kmsParams?: {
      wasmBinary?: ArrayBuffer;
      locateFile?: (path: string) => string;
    };
  }): Promise<void>;

  export interface FhevmInstanceConfig {
    network: any; // Ethereum provider
    chainId?: number;
    apiKey?: string;
    gatewayUrl?: string;
  }

  export interface EncryptedUint32 {
    externalEuint32: string;
    proof: string;
  }

  export interface EncryptionResult {
    chunksCount: number;
    encryptedHandles: string[];
    inputProofs: string[];
  }

  // FHE 实例类型定义
  export interface FhevmInstance {
    createEncryptedInput: (contractAddress: string, senderAddress: string) => Promise<{
      add32: (value: number) => Promise<void>;
      add64: (value: bigint) => Promise<void>;
      encrypt: () => Promise<{
        handles: string[];
        inputProof: string;
      }>;
    }>;
    encrypt32: (value: number | Uint8Array) => Promise<{
      handle: string;
      proof: string;
    }>;
    encrypt64: (value: bigint) => Promise<{
      handle: string;
      proof: string;
    }>;
    decrypt32: (handle: string, proof: string) => Promise<Uint8Array>;
    decrypt64: (handle: string, proof: string) => Promise<bigint>;
    publicKey: string;
    publicParams: string;
  }

  export const SepoliaConfig: FhevmInstanceConfig;
  export const MainnetConfig: FhevmInstanceConfig;
  export const LocalhostConfig: FhevmInstanceConfig;

  export function createInstance(config: FhevmInstanceConfig): Promise<FhevmInstance>;

  // Export additional configs and types as needed
  export const VotingContractAbi: any[];
  export const AuctionContractAbi: any[];
}

// Bundle module definition
declare module '@zama-fhe/relayer-sdk/bundle' {
  export * from '@zama-fhe/relayer-sdk';
}

// Web module definition
declare module '@zama-fhe/relayer-sdk/web' {
  export * from '@zama-fhe/relayer-sdk';
}

// Global window augmentation for CDN usage
interface Window {
  fhevm: {
    initSDK: typeof import('@zama-fhe/relayer-sdk').initSDK;
    createInstance: typeof import('@zama-fhe/relayer-sdk').createInstance;
    SepoliaConfig: import('@zama-fhe/relayer-sdk').FhevmInstanceConfig;
    MainnetConfig: import('@zama-fhe/relayer-sdk').FhevmInstanceConfig;
    LocalhostConfig: import('@zama-fhe/relayer-sdk').FhevmInstanceConfig;
  };
  ethereum?: any; // Ethereum provider from MetaMask or similar
} 