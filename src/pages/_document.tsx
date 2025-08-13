// src/pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="zh-CN">
      <Head>
        {/* SDK版本常量 */}
        <script 
          dangerouslySetInnerHTML={{
            __html: `
              window.ZAMA_SDK_VERSION = "0.1.0-9"; // 设置SDK版本常量
              window.global = window; // 确保全局对象可用
            `
          }}
        />
        
        {/* 使用crossorigin属性处理CORS问题 */}
        <script 
          src="https://cdn.zama.ai/relayer-sdk-js/0.1.0-9/relayer-sdk-js.umd.cjs" 
          crossOrigin="anonymous"
          async
        />
        
        {/* SDK初始化脚本 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function checkSDK() {
                  if (window.fhevm || window.relayerSDK) {
                    if (window.relayerSDK && !window.fhevm) {
                      window.fhevm = window.relayerSDK;
                    }
                    window.dispatchEvent(new CustomEvent('fheSdkLoaded'));
                    return true;
                  }
                  return false;
                }
                
                if (checkSDK()) return;
                
                document.addEventListener('DOMContentLoaded', function() {
                  if (checkSDK()) return;
                  
                  const checkInterval = setInterval(function() {
                    if (checkSDK()) {
                      clearInterval(checkInterval);
                    }
                  }, 2000);
                  
                  setTimeout(function() {
                    clearInterval(checkInterval);
                  }, 10000);
                });
              })();
            `
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
} 