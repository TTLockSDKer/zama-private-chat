// src/pages/_app.tsx
import '@rainbow-me/rainbowkit/styles.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import '../styles/globals.css';

import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';
import { LanguageProvider } from '../utils/LanguageContext';

// ClientApp必须禁用SSR，避免hydration错误
const ClientApp = dynamic(
  () => import('../components/ClientApp'),
  { ssr: false }
);

function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // 可添加其他一次性初始化逻辑
  }, []);

  return (
    <>
      <Head>
        <title>FHE 加密聊天</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <LanguageProvider>
        <ClientApp>
          <Component {...pageProps} />
        </ClientApp>
      </LanguageProvider>
    </>
  );
}

export default App;