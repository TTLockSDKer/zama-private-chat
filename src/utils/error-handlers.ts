function isBrowser() {
  return typeof window !== 'undefined';
}

export function handleError(message: string, error: any) {
  console.error(`${message}:`, error);
  if (error?.cause) {
    console.error('Caused by:', error.cause);
  }
  throw error;
}

export function logError(message: string, error: any) {
  console.error(`${message}:`, error);
  if (error?.cause) {
    console.error('Caused by:', error.cause);
  }
}

export function silenceCoinbaseErrors() {
  if (!isBrowser()) return;
  
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const errorMessage = args.join(' ');
    if (errorMessage.includes('Coinbase Wallet SDK') || 
        errorMessage.includes('NotSameOriginAfterDefaultedToSameOriginByCoep') ||
        errorMessage.includes('cca-lite.coinbase.com') ||
        errorMessage.includes('Analytics SDK: TypeError: Failed to fetch') ||
        errorMessage.includes('metrics net::ERR_BLOCKED_BY_RESPONSE') ||
        errorMessage.includes('POST https://cca-lite.coinbase.com/metrics') ||
        errorMessage.includes('POST https://cca-lite.coinbase.com/amp') ||
        errorMessage.includes('WalletConnect Core is already initialized')) {
      // 忽略Coinbase钱包SDK和WalletConnect的错误
      return;
    }
    originalConsoleError.apply(console, args);
  };
  
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input instanceof Request ? input.url : '';
      
      if (url.includes('cca-lite.coinbase.com')) {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
      
      return originalFetch.apply(this, arguments);
    };
  }
}

export function silenceWalletConnectErrors() {
  if (!isBrowser()) return;
  
  const originalConsoleError = console.error;
  console.error = function(...args) {
    const errorMessage = args.join(' ');
    if (errorMessage.includes('WalletConnect Core is already initialized')) {
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

export function initErrorHandlers() {
  if (!isBrowser()) return;
  
  silenceCoinbaseErrors();
  silenceWalletConnectErrors();
} 