import React, { useState, useEffect, useMemo } from 'react';
import { RedPacketService, RedPacketInfo } from '../services/RedPacketService';
import { logInfo, logError } from '../utils/unified-logger';
import { useI18n } from '../utils/LanguageContext';

interface RedPacketBubbleProps {
  packetId: number;
  sender: string;
  recipient: string;
  message?: string;
  timestamp: number;
  currentUserAddress?: string;
  isFromCurrentUser: boolean;
  onClaimSuccess?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fheInstance?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient?: any;
}

export const RedPacketBubble: React.FC<RedPacketBubbleProps> = ({
  packetId,
  sender,
  recipient,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message = '',
  timestamp,
  currentUserAddress,
  isFromCurrentUser,
  onClaimSuccess,
  fheInstance,
  walletClient
}) => {
  const [redPacketInfo, setRedPacketInfo] = useState<RedPacketInfo | null>(null);
  const [decryptedAmount, setDecryptedAmount] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const { t } = useI18n();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatAmount = (amount: bigint) => {
    const ethAmount = Number(amount) / 1e18;
    return ethAmount.toFixed(4);
  };

  const loadRedPacketInfo = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        for (let i = 0; i < 5; i++) {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const info = await RedPacketService.getRedPacketInfo(packetId);
            if (info && info.claimed) {
              setRedPacketInfo(info);
              logInfo('红包状态已更新为已领取');
              return;
            }
          } catch (retryError) {
            console.log(`重试 ${i + 1} 失败:`, retryError);
            if (i === 4) throw retryError; // 最后一次重试失败时抛出错误
          }
        }
      }
      const info = await RedPacketService.getRedPacketInfo(packetId);
      if (info) {
        setRedPacketInfo(info);
      }
    } catch (error) {
      console.log('加载红包信息失败:', error);
      logError('加载红包信息失败:', error);
    }
  };

  const handleDecryptAmount = async () => {
    if (!currentUserAddress || !fheInstance || !walletClient || !redPacketInfo) {
      logError('解密条件不满足:', {
        currentUserAddress: !!currentUserAddress,
        fheInstance: !!fheInstance,
        walletClient: !!walletClient,
        redPacketInfo: !!redPacketInfo
      });
      return;
    }

    const hasPermission = (
      redPacketInfo.sender.toLowerCase() === currentUserAddress.toLowerCase() ||
      redPacketInfo.recipient.toLowerCase() === currentUserAddress.toLowerCase()
    );

    if (!hasPermission) {
      setClaimError('您没有权限查看此红包金额');
      return;
    }

    setIsDecrypting(true);
    setClaimError(null);

    try {
      logInfo('开始解密红包金额:', {
        packetId,
        currentUser: currentUserAddress,
        sender: redPacketInfo.sender,
        recipient: redPacketInfo.recipient,
        hasPermission
      });

      const amount = await RedPacketService.getRedPacketAmount(
        packetId, 
        currentUserAddress, 
        fheInstance, 
        walletClient
      );
      
      if (amount !== null) {
        setDecryptedAmount(amount);
        logInfo('红包金额解密成功:', amount.toString());
      } else {
        throw new Error('解密返回空值');
      }
    } catch (error) {
      logError('红包金额解密失败:', error);
      
      const msg = (error as Error).message || '';
      if (msg.includes('Red packet does not exist')) {
        setClaimError('红包不存在');
      } else if (msg.includes('No permission')) {
        setClaimError('您没有权限查看此红包金额');
      } else if (msg.includes('execution reverted')) {
        setClaimError('合约调用失败，请检查红包状态');
      } else {
        setClaimError('解密失败，请重试');
      }
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleClaimRedPacket = async () => {
    if (!currentUserAddress || !redPacketInfo) return;

    setIsLoading(true);
    setClaimError(null);

    try {
      const result = await RedPacketService.claimRedPacket(packetId, currentUserAddress);
      
      if (result.success) {
        logInfo('红包领取成功!');
        await loadRedPacketInfo(true);
        onClaimSuccess?.();
      } else {
        setClaimError(result.error || '领取失败');
      }
    } catch (error) {
      setClaimError(String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReclaimExpiredRedPacket = async () => {
    if (!currentUserAddress || !redPacketInfo) return;

    setIsLoading(true);
    setClaimError(null);

    try {
      const result = await RedPacketService.reclaimExpiredRedPacket(packetId, currentUserAddress);
      
      if (result.success) {
        logInfo('过期红包回收成功!');
        await loadRedPacketInfo(true);
        onClaimSuccess?.();
      } else {
        setClaimError(result.error || '回收失败');
      }
    } catch (error) {
      setClaimError(String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRedPacketInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packetId]);

  const status = !redPacketInfo
    ? 'loading'
    : redPacketInfo.claimed
    ? 'claimed'
    : RedPacketService.isRedPacketExpired(redPacketInfo.expireTime)
    ? 'expired'
    : 'available';

  useEffect(() => {
    if (!redPacketInfo?.claimed && status === 'available' && redPacketInfo) {
      const interval = setInterval(() => {
        loadRedPacketInfo().catch((error) => {
          console.log('定期检查红包状态失败:', error);
        });
      }, 8000); // 每8秒检查一次状态

      return () => clearInterval(interval);
    }
  }, [redPacketInfo?.claimed, status]);
  const isRecipient = currentUserAddress && recipient.toLowerCase() === currentUserAddress.toLowerCase();
  const isSender = currentUserAddress && sender.toLowerCase() === currentUserAddress.toLowerCase();
  const canClaim = status === 'available' && isRecipient && !isLoading;
  const canReclaim = status === 'expired' && isSender && !isLoading && !redPacketInfo?.claimed;

  const AddressBadge: React.FC<{ address: string }> = ({ address }) => {
    const [copied, setCopied] = useState(false);
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const isExpired = status === 'expired';

    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '1px 6px',
      borderRadius: 6,
      border: isExpired ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.35)',
      background: isExpired ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)',
      color: isExpired ? '#333' : '#fff',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: '0.78rem',
      cursor: 'pointer',
      userSelect: 'none'
    };

    const copiedStyle: React.CSSProperties = {
      fontSize: '0.72rem',
      color: isExpired ? '#28a745' : '#fff',
      opacity: isExpired ? 1 : 0.9
    };

    const handleCopy = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(address);
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
          (e.currentTarget as HTMLSpanElement).style.background = isExpired
            ? 'rgba(255,255,255,1)'
            : 'rgba(255,255,255,0.35)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLSpanElement).style.background = isExpired
            ? 'rgba(255,255,255,0.95)'
            : 'rgba(255,255,255,0.25)';
        }}
      >
        <span>{short}</span>
        {copied && <span style={copiedStyle}>{t('copied', '已复制')}</span>}
      </span>
    );
  };

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '400px',
    minHeight: status === 'expired' ? 100 : 110,
    padding: 0,
    borderRadius: 10,
    background:
      status === 'expired'
        ? '#fff1f0'
        : 'linear-gradient(135deg, #ff4d4f, #d4380d)',
    boxShadow:
      status === 'expired'
        ? '0 2px 8px rgba(0,0,0,0.08)'
        : '0 6px 14px rgba(212, 56, 13, 0.25)',
    border:
      status === 'expired'
        ? '1px solid #ffa39e'
        : '1.5px solid #f7d674',
    color: status === 'expired' ? '#595959' : '#fff',
    marginBottom: 8,
    alignSelf: isFromCurrentUser ? 'flex-end' : 'flex-start'
  };

  const headerStyle: React.CSSProperties = {
    padding: '6px 12px 4px',
    borderBottom:
      status === 'expired' ? '1px solid #e9ecef' : '1px solid rgba(255,255,255,0.25)',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  };

  const bodyStyle: React.CSSProperties = {
    padding: '6px 12px'
  };

  const coinStyle: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 60% 40%, #ffe9a6, #f7d674 55%, #d4a73b 100%)',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)'
  };

  const statusTagStyle: React.CSSProperties = {
    marginLeft: 'auto',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
    background: status === 'expired' ? '#fff1f0' : 'rgba(255,255,255,0.25)',
    color: status === 'expired' ? '#cf1322' : '#ffffff',
    border: status === 'expired' ? '1px solid #ffa39e' : '1px solid rgba(255,255,255,0.35)',
    whiteSpace: 'nowrap',
    flex: '0 0 auto'
  };

  const addressRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%'
  };

  return (
    <div style={bubbleStyle}>
      <div style={headerStyle}>
        {status !== 'expired' && <div style={coinStyle} />}
        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{t('redpacket', '红包')}</span>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={addressRowStyle}>
            <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isFromCurrentUser ? (
                <>
                  {t('send_to', '发给')} <AddressBadge address={recipient} />
                </>
              ) : (
                <>
                  {t('from', '来自')} <AddressBadge address={sender} />
                </>
              )}
            </div>
            {status !== 'available' && (
              <div style={statusTagStyle}>{status === 'claimed' ? t('claimed', '已领取') : t('expired', '已过期')}</div>
            )}
          </div>
          <div style={{ fontSize: 9, opacity: 0.8 }}>
            {formatTime(timestamp)}
          </div>
        </div>
      </div>

      <div style={bodyStyle}>
        {(isSender || isRecipient) && (
          <div style={{ 
            marginBottom: '12px',
            textAlign: 'center'
          }}>
            {decryptedAmount !== null ? (
              <div style={{ fontSize: '14px', fontWeight: 700, color: status === 'expired' ? '#28a745' : '#ffffff' }}>
                {formatAmount(decryptedAmount)} ETH
              </div>
            ) : (
              <button
                onClick={handleDecryptAmount}
                disabled={isDecrypting}
                style={{
                  background: isDecrypting
                    ? (status === 'expired' ? 'rgba(40,167,69,0.3)' : 'rgba(255,255,255,0.35)')
                    : (status === 'expired' ? 'rgba(40,167,69,0.1)' : 'rgba(255,255,255,0.25)'),
                  border: `2px solid ${status === 'expired' ? '#28a745' : 'rgba(255,255,255,0.55)'}`,
                  color: status === 'expired' ? '#28a745' : '#ffffff',
                  cursor: isDecrypting ? 'not-allowed' : 'pointer',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  width: '100%',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isDecrypting) {
                    e.currentTarget.style.background = status === 'expired'
                      ? 'rgba(40,167,69,0.2)'
                      : 'rgba(255,255,255,0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDecrypting) {
                    e.currentTarget.style.background = status === 'expired'
                      ? 'rgba(40,167,69,0.1)'
                      : 'rgba(255,255,255,0.25)';
                  }
                }}
              >
                {isDecrypting ? (
                  <>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      border: `2px solid ${status === 'expired' ? 'rgba(40,167,69,0.3)' : 'rgba(255,255,255,0.35)'}`,
                      borderTop: `2px solid ${status === 'expired' ? '#28a745' : '#ffffff'}`,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    <span>{t('decrypting', '解密中...')}</span>
                  </>
                ) : (
                  <>
                    <span style={{fontSize: '16px'}}>🔓</span>
                    <span>{t('view_amount', '点击查看金额')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {status === 'loading' && (
          <div style={{ textAlign: 'center', fontSize: '14px' }}>
            {t('loading', '加载中...')}
          </div>
        )}

        {status === 'claimed' && (
          <div style={{ 
            textAlign: 'center', 
            fontSize: '14px',
            color: '#28a745'
          }}>
            {t('claimed', '已领取')}
          </div>
        )}

        {status === 'expired' && !redPacketInfo?.claimed && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: 14,
              color: '#dc3545',
              marginBottom: canReclaim ? 8 : 0
            }}>
              {t('expired', '已过期')}
            </div>
            {canReclaim && (
              <button
                onClick={handleReclaimExpiredRedPacket}
                disabled={isLoading}
                style={{
                  padding: '6px 12px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {isLoading ? t('reclaiming', '回收中...') : t('reclaim_redpacket', '回收红包')}
              </button>
            )}
          </div>
        )}

        {status === 'available' && (
          <div style={{ textAlign: 'center' }}>
            {redPacketInfo && (
              <div style={{ 
                fontSize: '12px',
                marginBottom: canClaim ? '8px' : '0',
                opacity: 0.9
              }}>
                {(() => {
                  const expireLabel = (() => {
                    if (!redPacketInfo) return '';
                    const expireDate = new Date(redPacketInfo.expireTime * 1000);
                    const now = new Date();
                    if (expireDate < now) return t('expired', '已过期');
                    const diffMs = expireDate.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays > 1) {
                      const template = t('expires_in_days', 'Expires in {days} days');
                      return template.replace('{days}', String(diffDays));
                    }
                    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
                    const template = t('expires_in_hours', 'Expires in {hours} hours');
                    return template.replace('{hours}', String(diffHours));
                  })();
                  return expireLabel;
                })()}
              </div>
            )}
            
            {canClaim && (
              <button
                onClick={handleClaimRedPacket}
                disabled={isLoading}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                }}
              >
                {isLoading ? t('claiming', '领取中...') : t('claim_redpacket', '领取红包')}
              </button>
            )}

            {!isRecipient && !isSender && (
              <div style={{ 
                fontSize: '12px',
                opacity: 0.8
              }}>
                {t('not_yours', '这不是你的红包')}
              </div>
            )}
          </div>
        )}

        {claimError && (
          <div style={{ 
            marginTop: '8px',
            padding: '6px',
            background: 'rgba(220, 53, 69, 0.1)',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#dc3545',
            textAlign: 'center'
          }}>
            {claimError}
          </div>
        )}
      </div>
    </div>
  );
};
