import React, { useEffect, useState, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import { useAuth } from '../hooks/useAuth';
import { useMessages, TempMessage } from '../hooks/useMessages';
import { MessageService } from '../services/MessageService';
import { RedPacketService } from '../services/RedPacketService';
import { MessageList, RedPacketItemInfo } from './MessageList';
import { MessageInput } from './MessageInput';
import { BankingModule } from './BankingModule';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '../utils/LanguageContext';

const ChatRoom: React.FC = () => {
  const [isBankingOpen, setIsBankingOpen] = useState(false);

  const {
    isConnected,
    account,
    isInitialized,
    initError,
    fhevmInstance,
    authHelper,
    publicClient,
    walletClient,
    userRequestedConnection,
    initializeAuth,
    reinitVersion
  } = useAuth();

  const { t } = useI18n();

  const convertRedPacketsToItems = useCallback((redPackets: { id: number; sender: string; recipient: string; expireTime: number; message?: string }[]): RedPacketItemInfo[] => {
    return redPackets.map(packet => ({
      packetId: packet.id,
      sender: packet.sender,
      recipient: packet.recipient,
      message: packet.message || '',
      timestamp: packet.expireTime - (7 * 24 * 60 * 60),
      type: 'redpacket' as const
    }));
  }, []);

  const {
    messages,
    tempMessages,
    tempRedPackets,
    isLoading,
    decryptedMessages,
    decryptingMessageId,
    decryptionStatus,
    messageGroupManager,
    loadMessageHistory,
    updateTempMessageStatus,
    removeTempMessage,
    addTempMessage,
    updateDecryptionStatus,
    clearDecryptionStatus,
    setDecryptedMessage,
    resetDecryptionState,
    setDecryptingMessageId,
    addTempRedPacket,
    updateTempRedPacketStatus,
    removeTempRedPacket,
    redPackets,
    loadRedPacketHistory,

  } = useMessages(authHelper, publicClient, account);

  // 自动初始化FHE系统（当钱包连接后）
  useEffect(() => {
    if (isConnected && account && walletClient && publicClient && !isInitialized && !userRequestedConnection) {
      initializeAuth();
    }
  }, [isConnected, account, walletClient, publicClient, isInitialized, userRequestedConnection, initializeAuth]);

  useEffect(() => {
    if (isInitialized && authHelper) {
      loadMessageHistory();
    }

  }, [isInitialized, authHelper, loadMessageHistory]);

  useEffect(() => {
    resetDecryptionState();
  }, [account, resetDecryptionState]);

  useEffect(() => {
    if (isInitialized && authHelper && account) {
      loadMessageHistory();
      loadRedPacketHistory();
    }
  }, [account, isInitialized, authHelper, loadMessageHistory, loadRedPacketHistory]);

  useEffect(() => {
    if (isInitialized && authHelper && account) {
      loadMessageHistory();
      loadRedPacketHistory();
    }
  }, [reinitVersion, isInitialized, authHelper, account, loadMessageHistory, loadRedPacketHistory]);

  const handleSendMessage = async (messageText: string, recipient: string) => {
    if (!authHelper || !account) {
      throw new Error(t('system_not_ready', '系统未就绪'));
    }

    await MessageService.sendMessageWithProgress(
      messageText,
      recipient,
      authHelper,
      account,
      addTempMessage,
      updateTempMessageStatus,
      removeTempMessage,
      loadMessageHistory
    );
  };

  const handleDecryptMessage = async (messageId: number) => {
    if (!fhevmInstance || !account || !publicClient || !walletClient || !authHelper) {
      return;
    }

    await MessageService.decryptMessage(
      messageId,
      fhevmInstance,
      account,
      publicClient,
      walletClient,
      authHelper,
      messageGroupManager,
      decryptedMessages,
      updateDecryptionStatus,
      clearDecryptionStatus,
      setDecryptedMessage,
      setDecryptingMessageId
    );

    try {
      await loadMessageHistory();
    } catch {
    }
  };

  const handleRetryMessage = async (tempMessage: TempMessage) => {
    if (!authHelper || !account) {
      return;
    }

    await MessageService.retrySendMessage(
      tempMessage,
      authHelper,
      account,
      addTempMessage,
      updateTempMessageStatus,
      removeTempMessage,
      loadMessageHistory
    );
  };



  const handleSendRedPacket = async (amount: string, recipient: string, message: string) => {
    if (!authHelper || !account || !fhevmInstance) {
      throw new Error(t('system_not_ready', '系统未就绪'));
    }

    await RedPacketService.createRedPacketWithProgress(
      amount,
      recipient,
      message,
      account,
      fhevmInstance,
      addTempRedPacket,
      updateTempRedPacketStatus,
      removeTempRedPacket,
      loadRedPacketHistory
    );
  };

  if (!isConnected) {
    return (
      <div className="app-background" style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '30px',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '500px',
          width: '100%'
        }}>
          <h2 style={{ marginBottom: '20px', color: '#333' }}>FHE 加密聊天</h2>
          <p style={{ marginBottom: '30px', color: '#666' }}>请连接您的钱包以开始使用</p>
          <ConnectButton />
        </div>
      </div>
    );
  }
  
  return (
    <div className="app-background" style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg,rgba(172, 161, 65, 0.77) 0%,rgb(114, 113, 73) 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '700px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.46)'
      }}>
        <div style={{
          padding: '15px 20px',
          background: '#f8f9fa',
          borderBottom: '1px solidrgb(5, 6, 7)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.2rem',
              display: 'inline-block',
              background: '#FFD400',
              color: '#111',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
            }}
          >
            FHE 加密聊天
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <LanguageSwitcher />
            <button
              onClick={() => {
                setIsBankingOpen(true);
              }}
              style={{
                padding: '8px 16px',
                background: (isConnected && isInitialized) ? '#FFD400' : '#6c757d',
                color: (isConnected && isInitialized) ? '#111' : 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (isConnected && isInitialized) ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                boxShadow: (isConnected && isInitialized) ? '0 2px 6px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.1)',
                opacity: (isConnected && isInitialized) ? 1 : 0.6
              }}
              onMouseOver={(e) => {
                if (isConnected && isInitialized) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                }
              }}
              onMouseOut={(e) => {
                if (isConnected && isInitialized) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }
              }}
              disabled={!isConnected || !isInitialized}
              title={
                !isConnected ? '请先连接钱包' :
                !isInitialized ? '正在初始化FHE系统...' :
                '打开钱包服务'
              }
            >
              {t('wallet', '钱包')}
              {!isConnected && ' (需要钱包)'}
              {isConnected && !isInitialized && ' (初始化中...)'}
            </button>
          <ConnectButton />
          </div>
        </div>
        {initError && (
          <div style={{
            padding: '15px 20px',
            background: '#f8d7da',
            color: '#721c24',
            borderBottom: '1px solid #f5c6cb'
          }}>
            <strong>初始化错误:</strong> {initError}
          </div>
        )}

        <div style={{
          padding: '20px',
          height: '550px',
          overflowY: 'auto',
          background: '#f8f9fa'
        }}>
          <MessageList
            messages={messages}
            tempMessages={tempMessages}
            tempRedPackets={tempRedPackets}
            redPackets={convertRedPacketsToItems(redPackets)}
            decryptedMessages={decryptedMessages}
            decryptingMessageId={decryptingMessageId}
            decryptionStatus={decryptionStatus}
            account={account}
            onDecryptMessage={handleDecryptMessage}
            onRetryMessage={handleRetryMessage}

            fheInstance={fhevmInstance}
            walletClient={walletClient}
          />
        </div>
        <MessageInput
          account={account}
          isInitialized={isInitialized}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          onSendRedPacket={handleSendRedPacket}
          fhevmInstance={fhevmInstance}
        />
      </div>

      <BankingModule
        isOpen={isBankingOpen}
        onClose={() => setIsBankingOpen(false)}
        fheInstance={fhevmInstance}
      />
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .spinner {
          display: inline-block;
        }
      `}</style>
    </div>
  );
}

export default ChatRoom;
