import { useState, useRef, useCallback, useEffect } from 'react';
import { RedPacketInfo } from '../services/RedPacketService';
import { AuthHelper } from '../utils/auth-helper';

export interface MessageInfo {
  id: number;
  sender: string;
  recipient: string;
  timestamp: number;
  chunks: unknown[];
  decryptedContent?: string;
}

export interface TempMessage {
  id: string;
  content: string;
  recipient: string;
  status: 'sending' | 'failed' | 'sent';
  statusText: string;
  timestamp: number;
}

export interface TempRedPacket {
  id: string;
  amount: string; // ETH amount as string
  recipient: string;
  message?: string;
  status: 'sending' | 'failed' | 'sent';
  statusText: string;
  timestamp: number;
}

export function useMessages(authHelper: AuthHelper | null, publicClient: unknown, account: string | undefined) {
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [tempMessages, setTempMessages] = useState<TempMessage[]>([]);
  const [tempRedPackets, setTempRedPackets] = useState<TempRedPacket[]>([]);
  const [redPackets, setRedPackets] = useState<RedPacketInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [decryptedMessages, setDecryptedMessages] = useState<Record<number, string>>({});
  const [decryptingMessageId, setDecryptingMessageId] = useState<number | null>(null);
  const [decryptionStatus, setDecryptionStatus] = useState<Record<number, string>>({});
  
  const messageGroupManagerRef = useRef<{ addChunk: () => null; getGroupStatus: () => null }>({
    addChunk: () => null,
    getGroupStatus: () => null
  });

  const loadMessageHistory = useCallback(async (options?: { silent?: boolean }) => {
    if (!publicClient || !account || !authHelper) {
      if (!options?.silent) setIsLoading(false);
      return;
    }
    
    try {
      if (!options?.silent) setIsLoading(true);
      
      const baseContract = authHelper.getContract() as unknown as {
        queryMessages: (qt: number, p1: number, p2: number) => Promise<{ messages: { id: number; sender: string; recipient: string; timestamp: number; totalChunks: number; chunkCount: number }[] }>;
        getMessageHandles: (id: number) => Promise<unknown[]>;
        getMessageChunk: (id: number, idx: number) => Promise<unknown>;
        connect?: (signer: unknown) => typeof baseContract;
      };
      
      const connectedContract = baseContract.connect ? baseContract.connect(authHelper.getSigner()) : baseContract;
      const result = await connectedContract.queryMessages(0, 0, 0);
      
      if (!result || !result.messages || result.messages.length === 0) {
        setMessages([]);
        return;
      }

      const messagePromises = result.messages.map(async (msgInfo: { id: number; sender: string; recipient: string; timestamp: number; totalChunks: number; chunkCount: number }) => {
        try {
          let chunks = [];
          try {
            chunks = await connectedContract.getMessageHandles(msgInfo.id);
          } catch {
            chunks = [];
            
            const actualChunkCount = Number(msgInfo.chunkCount) || 0;
            for (let i = 0; i < actualChunkCount; i++) {
              try {
                const chunk = await connectedContract.getMessageChunk(msgInfo.id, i);
                chunks.push(chunk);
              } catch {
                break;
              }
            }
          }
          
          return {
            id: Number(msgInfo.id),
            sender: msgInfo.sender,
            recipient: msgInfo.recipient,
            timestamp: Number(msgInfo.timestamp),
            chunks
          };
        } catch {
          return null;
        }
      });

      const messageInfos = await Promise.all(messagePromises);
      const validMessages = messageInfos.filter((msg): msg is MessageInfo => msg !== null);
      // 按时间升序
      validMessages.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(validMessages);

      // 基于最新链上消息，清理已落地的临时气泡（按收件人+时间近似匹配）
      try {
        const myLatestPerRecipient: Record<string, number> = {};
        for (const m of validMessages) {
          if (m.sender && account && m.sender.toLowerCase() === account.toLowerCase()) {
            const key = (m.recipient || '').toLowerCase();
            myLatestPerRecipient[key] = Math.max(myLatestPerRecipient[key] || 0, Number(m.timestamp || 0));
          }
        }
        if (Object.keys(myLatestPerRecipient).length > 0) {
          setTempMessages(prev => prev.filter(tmp => {
            if (tmp.status === 'failed') return true;
            const key = (tmp.recipient || '').toLowerCase();
            const latestSec = myLatestPerRecipient[key] || 0;
            if (!latestSec) return true;
            const latestMs = latestSec * 1000;
            const windowMs = 5000; // 容忍窗口
            // 链上出现了更晚或近似同时的我方消息，则移除预载气泡
            return !(latestMs >= tmp.timestamp - windowMs);
          }));
        }
      } catch {
        // 忽略清理异常
      }
      
    } catch {
      setMessages([]);
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, [publicClient, account, authHelper]);

  const loadRedPacketHistory = useCallback(async () => {
    if (!account || !authHelper) {
      return;
    }
    
    try {
      const { RedPacketService } = await import('../services/RedPacketService');
      const redPacketIds = await RedPacketService.getUserRedPackets(account);
      
      if (!redPacketIds || redPacketIds.length === 0) {
        setRedPackets([]);
        return;
      }
      
      const infos = await Promise.all(redPacketIds.map(async (pid) => {
        try {
          const info = await RedPacketService.getRedPacketInfo(pid);
          return info;
        } catch {
          return null;
        }
      }));
      
      const valid = infos.filter((x): x is RedPacketInfo => !!x);
      valid.sort((a, b) => (a.expireTime - 7 * 24 * 60 * 60) - (b.expireTime - 7 * 24 * 60 * 60));
      setRedPackets(valid);
      
      // 基于最新链上红包，清理已落地的临时红包气泡（和消息逻辑保持一致）
      try {
        const myLatestPerRecipient: Record<string, number> = {};
        for (const rp of valid) {
          if (rp.sender && account && rp.sender.toLowerCase() === account.toLowerCase()) {
            const key = (rp.recipient || '').toLowerCase();
            // 使用红包过期时间推算创建时间（过期时间 - 7天）
            const estimatedCreateTime = rp.expireTime - 7 * 24 * 60 * 60;
            myLatestPerRecipient[key] = Math.max(myLatestPerRecipient[key] || 0, estimatedCreateTime);
          }
        }
        if (Object.keys(myLatestPerRecipient).length > 0) {
          setTempRedPackets(prev => prev.filter(tmp => {
            if (tmp.status === 'failed') return true;
            const key = (tmp.recipient || '').toLowerCase();
            const latestSec = myLatestPerRecipient[key] || 0;
            if (!latestSec) return true;
            const latestMs = latestSec * 1000;
            const windowMs = 5000; // 和消息一样的5秒容忍窗口
            // 链上出现了更晚或近似同时的我方红包，则移除预载气泡
            return !(latestMs >= tmp.timestamp - windowMs);
          }));
        }
      } catch {
        // 忽略清理异常
      }
      
    } catch {
      setRedPackets([]);
    }
  }, [account, authHelper]);

  useEffect(() => {
    setMessages([]);
    setTempMessages([]);
    setRedPackets([]);
    setDecryptedMessages({});
    setDecryptingMessageId(null);
    setDecryptionStatus({});
  }, [account, authHelper]);

  // 添加快捷键手动刷新红包
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'r') {
        event.preventDefault();
        void loadRedPacketHistory();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [loadRedPacketHistory]);

  useEffect(() => {
    if (publicClient && account && authHelper) {
      void loadMessageHistory();
      void loadRedPacketHistory();
    }
  }, [publicClient, account, authHelper, loadMessageHistory, loadRedPacketHistory]);

  const addTempMessage = (tempMessage: TempMessage) => {
    setTempMessages(prev => [...prev, tempMessage]);
  };

  const updateTempMessageStatus = (tempId: string, status: TempMessage['status'], statusText: string) => {
    setTempMessages(prev => 
      prev.map(msg => 
        msg.id === tempId ? { ...msg, status, statusText } : msg
      )
    );
  };

  const removeTempMessage = (tempId: string) => {
    setTempMessages(prev => prev.filter(msg => msg.id !== tempId));
  };

  const updateDecryptionStatus = (messageId: number, status: string) => {
    setDecryptionStatus(prev => ({ ...prev, [messageId]: status }));
  };

  const clearDecryptionStatus = (messageId: number) => {
    setDecryptionStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[messageId];
      return newStatus;
    });
  };

  const setDecryptedMessage = (messageId: number, content: string) => {
    setDecryptedMessages(prev => ({ ...prev, [messageId]: content }));
  };

  const resetDecryptionState = useCallback(() => {
    setDecryptedMessages({});
    setDecryptingMessageId(null);
    setDecryptionStatus({});
  }, []);

  useEffect(() => {
    let intervalId: number | null = null;
    let inFlight = false;
    let unwatch: (() => void) | null = null;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await Promise.all([
          loadMessageHistory({ silent: true }),
          loadRedPacketHistory()
        ]);
      } catch {
        // 静默处理轮询错误
      } finally {
        inFlight = false;
      }
    };

    const setupEventListener = async () => {
      if (!account) {
        console.log('没有账户，跳过事件监听设置');
        return;
      }
      
      console.log('开始设置红包事件监听，账户:', account);
      
      try {
        const { BANKING_ABI, BANKING_ADDRESS, UNIFIED_CONFIG } = await import('../config/contracts');
        
        console.log('红包合约地址:', BANKING_ADDRESS);
        console.log('使用RPC:', UNIFIED_CONFIG.NETWORK.rpcUrl);
        
        // 直接使用现有的publicClient，避免创建新的
        if (!publicClient) {
          console.log('publicClient不存在，无法设置事件监听');
          return;
        }
        
        console.log('开始监听RedPacketCreated事件...');
        
        // 监听发给自己的红包 - 简化版
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unwatch1 = (publicClient as any).watchContractEvent({
          address: BANKING_ADDRESS,
          abi: BANKING_ABI,
          eventName: 'RedPacketCreated',
          args: {
            recipient: account
          },
          onLogs: (logs: unknown[]) => {
            console.log('🎁 收到新红包事件!', logs);
            void tick();
          },
          onError: (error: unknown) => {
            console.log('❌ 红包创建事件监听错误:', error);
          }
        });
        
        console.log('红包事件监听设置成功');
        
        unwatch = () => {
          console.log('清理红包事件监听');
          unwatch1();
        };
        
      } catch (error) {
        console.log('❌ 设置红包事件监听失败:', error);
      }
    };

    if (publicClient && account && authHelper) {
      void tick();
      intervalId = window.setInterval(tick, 1000);
      void setupEventListener();
    }

    return () => {
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      if (unwatch) {
        unwatch();
      }
    };
  }, [publicClient, account, authHelper, loadMessageHistory, loadRedPacketHistory]);

  const addTempRedPacket = (tempRedPacket: TempRedPacket) => {
    setTempRedPackets(prev => [...prev, tempRedPacket]);
  };

  const updateTempRedPacketStatus = (tempId: string, status: TempRedPacket['status'], statusText: string) => {
    setTempRedPackets(prev => 
      prev.map(redPacket => 
        redPacket.id === tempId ? { ...redPacket, status, statusText } : redPacket
      )
    );
  };

  const removeTempRedPacket = (tempId: string) => {
    setTempRedPackets(prev => prev.filter(redPacket => redPacket.id !== tempId));
  };



  return {
    messages,
    tempMessages,
    tempRedPackets,
    redPackets,
    isLoading,
    decryptedMessages,
    decryptingMessageId,
    decryptionStatus,
    messageGroupManager: messageGroupManagerRef.current,
    loadMessageHistory,
    loadRedPacketHistory,
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
  };
}