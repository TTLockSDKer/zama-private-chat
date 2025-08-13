import { AuthHelper } from '../utils/auth-helper';
import { t } from '../utils/i18n';
import { sendEncryptedMessageToContractOptimized } from '../utils/contract-interaction';
import { TempMessage } from '../hooks/useMessages';
import { toast } from 'react-hot-toast';

export interface MessageStatusTexts {
  sending: string;
  sendingToBlockchain: string;
  sendSuccess: string;
  sendFailed: string;
  invalidRecipient: string;
  cannotSendToSelf: string;
  messageTooLong: string;
  noPermission: string;
  decryptFailed: string;
  decrypting: string;
}

export class MessageService {
  private static getStatusTexts(): MessageStatusTexts {
    return {
      sending: t('sending', '发送中...'),
      sendingToBlockchain: t('sending_to_blockchain', '发送到区块链...'),
      sendSuccess: t('message_send_success', '发送成功'),
      sendFailed: t('message_send_failed', '发送失败'),
      invalidRecipient: t('invalid_recipient', '无效的接收者地址'),
      cannotSendToSelf: t('cannot_send_to_self_message', '不能给自己发送消息'),
      messageTooLong: t('message_too_long', '消息长度不能超过500字符'),
      noPermission: t('no_permission', '您没有权限访问此消息'),
      decryptFailed: t('decryption_failed', '解密失败'),
      decrypting: t('decrypting', '解密中...')
    };
  }
  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  static async sendMessageWithProgress(
    messageText: string, 
    recipient: string, 
    authHelper: AuthHelper,
    account: string,
    onTempMessageUpdate: (tempMessage: TempMessage) => void,
    onTempMessageStatusUpdate: (tempId: string, status: 'sending' | 'failed' | 'sent', statusText: string) => void,
    onTempMessageRemove: (tempId: string) => void,
    onMessageHistoryReload: () => void
  ): Promise<void> {
    const tempMessageId = `temp_${Date.now()}_${Math.random()}`;
    const statusTexts = this.getStatusTexts();
    
    try {
      if (!this.isValidAddress(recipient)) {
        throw new Error(statusTexts.invalidRecipient);
      }
      if (recipient.toLowerCase() === account?.toLowerCase()) {
        throw new Error(statusTexts.cannotSendToSelf);
      }
      
      if (messageText.length > 500) {
        throw new Error(statusTexts.messageTooLong);
      }

      const tempMessage: TempMessage = {
        id: tempMessageId,
        content: messageText,
        recipient: recipient,
        status: 'sending',
        statusText: statusTexts.sending,
        timestamp: Date.now()
      };
      onTempMessageUpdate(tempMessage);

      onTempMessageStatusUpdate(tempMessageId, 'sending', statusTexts.sendingToBlockchain);
      
      await sendEncryptedMessageToContractOptimized(
        authHelper,
        messageText,
        recipient
      );

      onTempMessageStatusUpdate(tempMessageId, 'sent', statusTexts.sendSuccess);
      
      setTimeout(() => {
        onTempMessageRemove(tempMessageId);
        onMessageHistoryReload();
      }, 1000);

    } catch (error) {
      onTempMessageStatusUpdate(tempMessageId, 'failed', `${statusTexts.sendFailed}: ${error}`);
      throw error;
    }
  }

  static async decryptMessage(
    messageId: number,
    fhevmInstance: unknown,
    account: string,
    publicClient: unknown,
    walletClient: unknown,
    authHelper: AuthHelper,
    messageGroupManager: unknown,
    decryptedMessages: Record<number, string>,
    onDecryptionStatusUpdate: (messageId: number, status: string) => void,
    onDecryptionStatusClear: (messageId: number) => void,
    onDecryptedMessageSet: (messageId: number, content: string) => void,
    onDecryptingMessageIdSet: (messageId: number | null) => void
  ): Promise<void> {
    if (!fhevmInstance || !account || !publicClient || !walletClient || decryptedMessages[messageId]) {
      return;
    }

    const statusTexts = this.getStatusTexts();

    try {
      onDecryptingMessageIdSet(messageId);
      onDecryptionStatusUpdate(messageId, statusTexts.decrypting);

      const contract = authHelper.getContract();
      const messageInfo = await contract.getMessageInfo(messageId) as [string, string, number, number, boolean];
      const [sender, recipient] = messageInfo;
      
      const isParticipant = sender.toLowerCase() === account.toLowerCase() || 
                           recipient.toLowerCase() === account.toLowerCase();
      
      if (!isParticipant) {
        throw new Error(statusTexts.noPermission);
      }

      const { MESSAGING_ADDRESS } = await import('../config/contracts');
      const ConfidentialMessagingABI = await import('../abi/ConfidentialMessaging.json');
      const CONTRACT_ABI = ConfidentialMessagingABI.abi;
      
      const { getAndDecryptMessage } = await import('../utils/contract-caller');
      const result = await getAndDecryptMessage(
        messageId,
        fhevmInstance,
        MESSAGING_ADDRESS,
        CONTRACT_ABI,
        authHelper,
        publicClient,
        account,
        walletClient
      );
      
      if (!result.success) {
        throw new Error(result.error || statusTexts.decryptFailed);
      }

      onDecryptedMessageSet(messageId, result.content);
      onDecryptionStatusClear(messageId);
      
    } catch (error) {
      onDecryptionStatusUpdate(messageId, statusTexts.decryptFailed);
      toast.error(`${statusTexts.decryptFailed}: ${error}`);
      
      setTimeout(() => {
        onDecryptionStatusClear(messageId);
      }, 3000);
    } finally {
      onDecryptingMessageIdSet(null);
    }
  }

  static async retrySendMessage(
    tempMessage: TempMessage, 
    authHelper: AuthHelper,
    account: string,
    onTempMessageUpdate: (tempMessage: TempMessage) => void,
    onTempMessageStatusUpdate: (tempId: string, status: 'sending' | 'failed' | 'sent', statusText: string) => void,
    onTempMessageRemove: (tempId: string) => void,
    onMessageHistoryReload: () => void
  ): Promise<void> {
    try {
      onTempMessageStatusUpdate(tempMessage.id, 'sending', '重新发送中...');
      
      await this.sendMessageWithProgress(
        tempMessage.content, 
        tempMessage.recipient, 
        authHelper,
        account,
        onTempMessageUpdate,
        onTempMessageStatusUpdate,
        onTempMessageRemove,
        onMessageHistoryReload
      );
      
    } catch {
      onTempMessageStatusUpdate(tempMessage.id, 'failed', t('message_send_failed', '发送失败'));
    }
  }

  private static parseDecryptedValues(decryptedValues: bigint[]): string {
    try {
      const bytes: number[] = [];
      
      for (const value of decryptedValues) {
        const valueNumber = Number(value);
        for (let i = 0; i < 8; i++) {
          const byte = (valueNumber >> (i * 8)) & 0xFF;
          if (byte !== 0) {
            bytes.push(byte);
          }
        }
      }
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      return '';
    }
  }
}