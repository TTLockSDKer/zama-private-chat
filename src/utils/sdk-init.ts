export function isSdkLoaded(): boolean {
  if (typeof window === 'undefined') return false;
  
  const hasFhevm = typeof window.fhevm !== 'undefined';
  const hasRelayerSDK = typeof window.relayerSDK !== 'undefined';
  
  if (hasRelayerSDK && !hasFhevm) {
    window.fhevm = window.relayerSDK;
  }
  
  const finalFhevm = window.fhevm || window.relayerSDK;
  return finalFhevm && typeof finalFhevm.initSDK === 'function' && typeof finalFhevm.createInstance === 'function';
}

export function waitForSdk(timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isSdkLoaded()) {
      return resolve();
    }
    
    const timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('SDK加载超时'));
    }, timeout);
    
    const checkInterval = setInterval(() => {
      if (isSdkLoaded()) {
        clearTimeout(timeoutId);
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });
}

export async function loadSdkManually(): Promise<void> {
  if (typeof window === 'undefined') return;
  return new Promise((resolve, reject) => {
    if (window.fhevm || window.relayerSDK) {
      if (!window.fhevm && window.relayerSDK) {
        window.fhevm = window.relayerSDK;
      }
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://cdn.zama.ai/relayer-sdk-js/0.1.0-9/relayer-sdk-js.umd.cjs';
    script.crossOrigin = 'anonymous';
    script.async = true;

    script.onload = () => {
      setTimeout(() => {
        if (window.relayerSDK || window.fhevm) {
          if (!window.fhevm && window.relayerSDK) {
            window.fhevm = window.relayerSDK;
          }
          resolve();
        } else {
          reject(new Error('CDN加载失败'));
        }
      }, 500);
    };

    script.onerror = () => reject(new Error('CDN加载失败'));
    document.head.appendChild(script);
  });
}

export async function ensureSdkInitialized(): Promise<void> {
  try {
    await waitForSdk();
  } catch {
    await loadSdkManually();
    await waitForSdk();
  }
  
  const sdk = window.fhevm || window.relayerSDK;
  if (!sdk || typeof sdk.initSDK !== 'function') {
    throw new Error('SDK对象无效');
  }
  
  interface SDKWithFlag { _initialized?: boolean; }
  if ((sdk as SDKWithFlag)._initialized) {
    return;
  }
  
  await sdk.initSDK();
  (sdk as SDKWithFlag)._initialized = true;
}

export default ensureSdkInitialized; 