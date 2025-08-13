// 全局类型声明文件
// 确保WebAssembly和全局对象正确定义

// 为浏览器环境声明全局变量
declare global {
  
  interface Window {
    global: typeof globalThis;
    process: {
      env: {
        NODE_ENV: string;
        [key: string]: string | undefined;
      };
      [key: string]: unknown;
    };
    Buffer: typeof Buffer;
    ethereum: unknown;
    WebAssembly: typeof WebAssembly;
    // 完善 fhevm 全局对象定义
    fhevm: {
      initSDK: (options?: {
        tfheParams?: {
          wasmBinary?: ArrayBuffer;
          locateFile?: (path: string) => string;
        };
        kmsParams?: {
          wasmBinary?: ArrayBuffer;
          locateFile?: (path: string) => string;
        };
      }) => Promise<void>;
      createInstance: (config: any) => Promise<{
        encrypt32: (value: number, contractAddress: string) => Promise<{
          externalEuint32: unknown;
          proof: unknown;
        }>;
        [key: string]: unknown;
      }>;
      SepoliaConfig: {
        chainId: number;
        network: any;
        [key: string]: unknown;
      };
    };
  }
  
  // 确保全局变量在Node.js和浏览器环境中都可用
  var global: typeof globalThis;
  var process: Window['process'];
}

// 确保TypeScript知道这是一个模块
export {}; 