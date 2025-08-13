import React, { useRef, useEffect, useState } from 'react';
import { MessageInfo, TempMessage, TempRedPacket } from '../hooks/useMessages';
import { RedPacketBubble } from './RedPacketBubble';
import { useI18n } from '../utils/LanguageContext';

export interface RedPacketItemInfo {
  packetId: number;
  sender: string;
  recipient: string;
  message?: string;
  timestamp: number;
  type: 'redpacket';
}

export interface ChatItem {
  id: string;
  timestamp: number;
  type: 'message' | 'redpacket';
  data: MessageInfo | RedPacketItemInfo;
}

interface MessageListProps {
  messages: MessageInfo[];
  tempMessages: TempMessage[];
  tempRedPackets?: TempRedPacket[];
  redPackets?: RedPacketItemInfo[]; // 红包列表
  decryptedMessages: Record<number, string>;
  decryptingMessageId: number | null;
  decryptionStatus: Record<number, string>;
  account: string | undefined;
  onDecryptMessage: (messageId: number) => void;
  onRetryMessage: (tempMessage: TempMessage) => void;
  onRetryRedPacket?: (tempRedPacket: TempRedPacket) => void;
  onRedPacketClaimSuccess?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fheInstance?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient?: any;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  tempMessages,
  tempRedPackets = [],
  redPackets = [],
  decryptedMessages,
  decryptingMessageId,
  decryptionStatus,
  account,
  onDecryptMessage,
  onRetryMessage,
  onRetryRedPacket,
  onRedPacketClaimSuccess,
  fheInstance,
  walletClient
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const AddressBadge: React.FC<{ address: string }> = ({ address }) => {
    const [copied, setCopied] = useState(false);

    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '1px 6px',
      borderRadius: 6,
      border: '1px solid rgba(0,0,0,0.12)',
      background: 'rgba(255,255,255,0.9)',
      color: '#333',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '0.78rem',
      cursor: 'pointer',
      verticalAlign: 'baseline',
      userSelect: 'none'
    };

    const copiedStyle: React.CSSProperties = {
      fontSize: '0.72rem',
      color: '#28a745',
    };

    const handleCopy = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(address);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = address;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
      }
    };

    return (
      <span
        title={copied ? t('copied', '已复制') : t('copy_address', '点击复制地址')}
        style={baseStyle}
        onClick={handleCopy}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLSpanElement).style.background = 'rgba(255,255,255,1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLSpanElement).style.background = 'rgba(255,255,255,0.9)';
        }}
      >
        <span>{short}</span>
        {copied && <span style={copiedStyle}>{t('copied', '已复制')}</span>}
      </span>
    );
  };

  const combinedItems = React.useMemo(() => {
    const items: ChatItem[] = [];

    messages.forEach(msg => {
      items.push({
        id: `message-${msg.id}`,
        timestamp: msg.timestamp || 0,
        type: 'message',
        data: msg
      });
    });

    redPackets.forEach(redPacket => {
      items.push({
        id: `redpacket-${redPacket.packetId}`,
        timestamp: redPacket.timestamp,
        type: 'redpacket',
        data: redPacket
      });
    });

    return items.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, redPackets]);

  const prevTempMsgCountRef = useRef<number>(0);
  const prevTempRpCountRef = useRef<number>(0);
  const prevCombinedCountRef = useRef<number>(0);
  const prevLastItemIdRef = useRef<string | null>(null);

  const combinedCount = combinedItems.length;
  const lastItemId = combinedCount > 0 ? combinedItems[combinedCount - 1].id : null;
  const tempMsgCount = tempMessages.length;
  const tempRpCount = tempRedPackets.length;

  useEffect(() => {
    let shouldScroll = false;

    if (combinedCount > prevCombinedCountRef.current || lastItemId !== prevLastItemIdRef.current) {
      shouldScroll = true;
    }
    if (tempMsgCount > prevTempMsgCountRef.current || tempRpCount > prevTempRpCountRef.current) {
      shouldScroll = true;
    }

    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    }

    prevCombinedCountRef.current = combinedCount;
    prevLastItemIdRef.current = lastItemId;
    prevTempMsgCountRef.current = tempMsgCount;
    prevTempRpCountRef.current = tempRpCount;
  }, [combinedCount, lastItemId, tempMsgCount, tempRpCount]);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (combinedItems.length === 0 && tempMessages.length === 0 && tempRedPackets.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6c757d', padding: '20px' }}>
        {t('no_messages', '暂无消息和红包')}
      </div>
    );
  }

  return (
    <>
      {combinedItems.map((item) => {
        if (item.type === 'message') {
          const msg = item.data as MessageInfo;
          const isDecrypted = Boolean(decryptedMessages[msg.id]);
          const bubbleBg = isDecrypted ? '#d4edda' : '#fff3cd';
          const bubbleBorder = isDecrypted ? '#c3e6cb' : '#ffeeba';
          const textColor = isDecrypted ? '#155724' : '#856404';
          return (
            <div
              key={item.id}
              style={{
                margin: '10px 0',
                padding: '10px 15px',
                background: bubbleBg,
                color: textColor,
                border: `1px solid ${bubbleBorder}`,
                borderRadius: '10px',
                maxWidth: '80%',
                marginLeft: msg.sender === account ? 'auto' : '0',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ fontSize: '0.8rem', marginBottom: '5px', opacity: 0.8 }}>
                {msg.sender === account ? (
                  <>
                    <span>{t('me', '我')} → </span>
                    <AddressBadge address={msg.recipient} />
                  </>
                ) : (
                  <>
                    <AddressBadge address={msg.sender} />
                    <span> → {t('me', '我')}</span>
                  </>
                )}
              </div>
              <div style={{ wordBreak: 'break-word' }}>
                {isDecrypted ? (
                  decryptedMessages[msg.id]
                ) : (
                  <button
                    className="decrypt-button"
                    onClick={() => onDecryptMessage(msg.id)}
                    disabled={decryptingMessageId === msg.id}
                    style={{
                      background: decryptingMessageId === msg.id ? 'rgba(255, 193, 7, 0.45)' : 'rgba(255, 193, 7, 0.25)',
                      border: `2px solid ${'#FFC107'}`,
                      color: '#7a5d00',
                      cursor: decryptingMessageId === msg.id ? 'not-allowed' : 'pointer',
                      padding: '12px 20px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      width: '100%',
                      minHeight: '48px',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      transform: decryptingMessageId === msg.id ? 'scale(0.98)' : 'scale(1)',
                      opacity: decryptingMessageId === msg.id ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => {
                     if (decryptingMessageId !== msg.id) {
                         e.currentTarget.style.background = 'rgba(255, 193, 7, 0.45)';
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (decryptingMessageId !== msg.id) {
                         e.currentTarget.style.background = 'rgba(255, 193, 7, 0.25)';
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                      }
                    }}
                  >
                     {decryptingMessageId === msg.id && decryptionStatus[msg.id] ? (
                      <>
                        <div style={{
                          width: '16px',
                          height: '16px',
                           border: '2px solid rgba(255, 193, 7, 0.35)',
                           borderTop: '2px solid #FFC107',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                        <span>{decryptionStatus[msg.id]}</span>
                      </>
                    ) : (
                      <>
                        <span style={{fontSize: '18px'}}>🔓</span>
                        <span>{t('decrypt', '点击解密消息')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.7rem', marginTop: '5px', opacity: 0.6 }}>
                <span>ID: {msg.id}</span>
                <span style={{ marginLeft: '12px' }}>{formatTimestamp(msg.timestamp)}</span>
              </div>
            </div>
          );
        } else if (item.type === 'redpacket') {
          const redPacket = item.data as RedPacketItemInfo;
          return (
            <div key={item.id} style={{ margin: '10px 0', display: 'flex', flexDirection: 'column' }}>
              <RedPacketBubble
                packetId={redPacket.packetId}
                sender={redPacket.sender}
                recipient={redPacket.recipient}
                message={redPacket.message}
                timestamp={redPacket.timestamp}
                currentUserAddress={account}
                isFromCurrentUser={redPacket.sender === account}
                onClaimSuccess={onRedPacketClaimSuccess}
                fheInstance={fheInstance}
                walletClient={walletClient}
              />
            </div>
          );
        }
        return null;
      })}
      
      {tempRedPackets.map((tempRedPacket) => (
        <div
          key={tempRedPacket.id}
          style={{
            margin: '10px 0',
            padding: '15px',
            background: tempRedPacket.status === 'failed' ? '#dc3545' : '#ff6b35',
            color: 'white',
            borderRadius: '15px',
            maxWidth: '80%',
            marginLeft: 'auto',
            boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
            opacity: tempRedPacket.status === 'sending' ? 0.8 : 1,
            border: '2px solid rgba(255,255,255,0.3)'
          }}
        >
          <div style={{ fontSize: '0.8rem', marginBottom: '8px', opacity: 0.9 }}>
            {t('me', '我')} → <span style={{ 
              background: 'rgba(255,255,255,0.2)', 
              padding: '2px 6px', 
              borderRadius: '4px', 
              fontFamily: 'monospace' 
            }}>
              {`${tempRedPacket.recipient.slice(0, 6)}...${tempRedPacket.recipient.slice(-4)}`}
            </span>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '20px' }}>🧧</span>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                {tempRedPacket.amount} ETH
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                {t('redpacket', '红包')}
              </div>
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            borderTop: '1px solid rgba(255,255,255,0.3)',
            paddingTop: '8px',
            marginTop: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {tempRedPacket.status === 'sending' && (
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
              )}
              <span>{tempRedPacket.statusText}</span>
            </div>
            
            {tempRedPacket.status === 'failed' && onRetryRedPacket && (
              <button
                onClick={() => onRetryRedPacket(tempRedPacket)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'white',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
              >
                {t('retry', '重试')}
              </button>
            )}
          </div>
          
          <div style={{ fontSize: '0.7rem', marginTop: '5px', opacity: 0.6 }}>
            {formatTimestamp(tempRedPacket.timestamp)}
          </div>
        </div>
      ))}
      
      {tempMessages.map((tempMsg) => (
        <div
          key={tempMsg.id}
          style={{
            margin: '10px 0',
            padding: '10px 15px',
            background: tempMsg.status === 'failed' ? '#dc3545' : '#007bff',
            color: 'white',
            borderRadius: '10px',
            maxWidth: '80%',
            marginLeft: 'auto',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
            opacity: tempMsg.status === 'sending' ? 0.8 : 1
          }}
        >
          <div style={{ fontSize: '0.8rem', marginBottom: '5px', opacity: 0.8 }}>
            {t('me', '我')} → <AddressBadge address={tempMsg.recipient} />
          </div>
          <div style={{ wordBreak: 'break-word', marginBottom: '8px' }}>
            {tempMsg.content}
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            fontSize: '0.8rem',
            borderTop: '1px solid rgba(255,255,255,0.3)',
            paddingTop: '8px',
            marginTop: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {tempMsg.status === 'sending' && (
                <div style={{
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
              )}
              <span>{tempMsg.statusText}</span>
            </div>
            
            {tempMsg.status === 'failed' && (
              <button
                onClick={() => onRetryMessage(tempMsg)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'white',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
              >
                {t('retry', '重试')}
              </button>
            )}
          </div>
          
          <div style={{ fontSize: '0.7rem', marginTop: '5px', opacity: 0.6 }}>
            {formatTimestamp(tempMsg.timestamp)}
          </div>
        </div>
      ))}
      
      <div ref={messagesEndRef} />
    </>
  );
}; 