import React, { useState } from 'react';
import { MessageService } from '../services/MessageService';
import { RedPacketService } from '../services/RedPacketService';
import { useI18n } from '../utils/LanguageContext';

interface MessageInputProps {
  account: string | undefined;
  isInitialized: boolean;
  isLoading: boolean;
  onSendMessage: (message: string, recipient: string) => Promise<void>;
  onSendRedPacket?: (amount: string, recipient: string, message: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fhevmInstance?: any;
  onRedPacketCreated?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  account,
  isInitialized,
  isLoading,
  onSendMessage,
  onSendRedPacket,
  fhevmInstance,
  onRedPacketCreated
}) => {
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const { t } = useI18n();

  const handleSend = async () => {
    if (!recipientAddress || !account) {
      return;
    }

    try {
      setSendError(null);

      if (amount.trim()) {
        if (!fhevmInstance) {
          throw new Error(t('fhe_not_initialized_redpacket', 'FHE系统未初始化，无法创建红包'));
        }

        if (onSendRedPacket) {
          await onSendRedPacket(amount.trim(), recipientAddress, ``);
          setAmount('');
        } else {
          const result = await RedPacketService.createRedPacket(
            amount.trim(),
            recipientAddress,
            ``,
            account,
            fhevmInstance
          );

          if (result.success && typeof result.packetId === 'number') {
            setAmount('');
            onRedPacketCreated?.();
          } else {
            throw new Error(result.error || t('create_redpacket_failed', '创建红包失败'));
          }
        }
      } else if (message.trim()) {
        await onSendMessage(message.trim(), recipientAddress);
        setMessage('');
      }
    } catch (error) {
      setSendError(String(error));
    }
  };

  const isAddressValid = MessageService.isValidAddress(recipientAddress);
  const isSelfAddress = recipientAddress && account && recipientAddress.toLowerCase() === account.toLowerCase();
  
  // 互斥逻辑：有金额时禁用消息，有消息时禁用金额
  const hasAmount = amount.trim().length > 0;
  const hasMessage = message.trim().length > 0;
  const modeText = hasAmount
    ? t('mode_redpacket', '红包模式')
    : hasMessage
      ? `${t('mode_message', '消息模式')} (${message.length}/500)`
      : t('mode_hint', '输入消息或红包金额');
  
  const canSend = isInitialized && recipientAddress && isAddressValid && !isSelfAddress && !isLoading && (hasAmount || hasMessage);

  return (
    <div style={{
      padding: '15px 20px',
      borderTop: '1px solid #e9ecef',
      background: 'white'
    }}>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '5px' }}>
          <input
            type="text"
            placeholder={t('input_recipient', '接收者地址 (0x...)')}
            value={recipientAddress}
            onChange={e => setRecipientAddress(e.target.value)}
            style={{
              width: '65%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '14px'
            }}
          />
          
          <input
            type="number"
            step="0.001"
            placeholder={t('input_amount', '红包金额 (ETH)')}
            value={amount}
            disabled={hasMessage}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: '35%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '14px',
              backgroundColor: hasMessage ? '#f8f9fa' : 'white',
              cursor: hasMessage ? 'not-allowed' : 'text'
            }}
          />
        </div>
        {isSelfAddress && (
          <div style={{ 
            fontSize: '12px', 
            color: '#dc3545', 
            marginBottom: '10px',
            lineHeight: '1.4',
            background: '#f8d7da',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #f5c6cb'
          }}>
            {t('cannot_send_to_self_hint', '不能给自己发送消息或红包，请输入其他用户的地址')}
          </div>
        )}
        
        <textarea
          placeholder={hasAmount ? t('mode_redpacket', '红包模式') : t('input_message', '输入消息 (最多500字符)')}
          value={message}
          maxLength={500}
          disabled={hasAmount}
          onChange={e => setMessage(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid #ced4da',
            minHeight: '80px',
            resize: 'vertical',
            fontSize: '14px',
            marginBottom: '10px',
            backgroundColor: hasAmount ? '#f8f9fa' : 'white',
            cursor: hasAmount ? 'not-allowed' : 'text'
          }}
        />
      </div>
      
      {sendError && (
        <div style={{ 
          color: '#dc3545',
          marginBottom: '10px',
          padding: '10px',
          background: '#f8d7da',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          {sendError}
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>{modeText}</div>
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: '10px 20px',
            background: canSend ? '#FFD400' : '#cccccc',
            color: canSend ? '#111' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: canSend ? 'pointer' : 'not-allowed',
            fontSize: '14px'
          }}
        >
          {hasAmount ? t('send_redpacket', '发红包') : t('send', '发消息')}
        </button>
      </div>
    </div>
  );
}; 