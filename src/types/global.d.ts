// 为Window接口添加全局变量支持
interface Window {
  global: Window;
  process: {
    env: {
      [key: string]: string | undefined;
    };
    [key: string]: unknown;
  };
  ethereum?: unknown;
}

// 确保TypeScript识别全局的process变量
declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    [key: string]: string | undefined;
  }

  interface Process {
    env: ProcessEnv;
    [key: string]: unknown;
  }
}

// 在类型声明文件中使用declare var是标准做法
declare var process: NodeJS.Process;
declare var global: Window;

// 为Zama SDK添加类型扩展
declare module '@zama-fhe/relayer-sdk' {
  // SDK配置类型
  interface FhevmInstanceConfig {
    chainId: number;
    gatewayChainId: number;
    network: string | Eip1193Provider | undefined;
    relayerUrl: string;
    aclContractAddress: string;
    kmsContractAddress: string;
    inputVerifierContractAddress: string;
    verifyingContractAddressDecryption: string;
    verifyingContractAddressInputVerification: string;
    tfheWasmPath?: string;
    kmsWasmPath?: string;
    [key: string]: unknown;
  }

  // Eip1193Provider 类型
  interface Eip1193Provider {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    [key: string]: unknown;
  }

  // SDK初始化选项类型
  interface SdkInitOptions {
    tfheParams?: {
      locateFile?: (path: string) => string;
      wasmBinary?: ArrayBuffer;
    };
    kmsParams?: {
      locateFile?: (path: string) => string;
      wasmBinary?: ArrayBuffer;
    };
    thread?: number;
  }

  // 类型声明
  export const SepoliaConfig: FhevmInstanceConfig;
  
  export function createInstance(config: FhevmInstanceConfig): Promise<{
    encrypt32: (value: number, contractAddress: string) => Promise<{
      externalEuint32: unknown;
      proof: unknown;
    }>;
    [key: string]: unknown;
  }>;
  
  export function initSDK(options?: SdkInitOptions): Promise<void>;
} 