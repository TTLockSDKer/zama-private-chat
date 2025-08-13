// 为浏览器环境声明全局变量
declare global {
  interface Window {
    ethereum?: any;
    relayerSDK?: any;
    tfhe?: any;
    WebAssembly: {
      instantiateStreaming: (
        response: Response,
        importObject?: WebAssembly.Imports
      ) => Promise<WebAssembly.Instance>;
      Module: any;
    };
}
}

export {}; 