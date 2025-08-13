import React from 'react';
import { Toaster } from 'react-hot-toast';
import ChatRoom from '../components/ChatRoom';

export default function Home() {
  return (
    <div>
      <Toaster position="top-right" />
      <ChatRoom />
    </div>
  );
}