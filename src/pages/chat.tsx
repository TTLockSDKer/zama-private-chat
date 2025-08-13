import React from 'react';
import { Toaster } from 'react-hot-toast';
import dynamic from 'next/dynamic';
import NoSSR from '../components/NoSSR';

// 动态导入组件，禁用SSR（移除不存在的 FheSdkLoader）
const ChatRoom = dynamic(() => import('../components/ChatRoom'), { ssr: false });

// 已移除 global-polyfill

const ChatPage: React.FC = () => {
  return (
    <NoSSR>
      <div>
        <Toaster position="top-right" />
        <ChatRoom />
      </div>
    </NoSSR>
  );
};

export default ChatPage; 