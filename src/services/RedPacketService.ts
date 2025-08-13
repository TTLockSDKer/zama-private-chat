import { parseEther, decodeEventLog } from 'viem';
import { t } from '../utils/i18n';
import { BANKING_ADDRESS, UNIFIED_CONFIG } from '../config/contracts';
import ConfidentialBankingABI from '../abi/ConfidentialBanking.json';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { sepolia } from 'viem/chains';
import { TempRedPacket } from '../hooks/useMessages';

export interface RedPacketInfo {
  id: number;
  sender: string;
  recipient: string;
  expireTime: number;
  claimed: boolean;
  message?: string;
  amount?: bigint;
}

export interface CreateRedPacketResult {
  success: boolean;
  packetId?: number;
  transactionHash?: string;
  error?: string;
}

export interface ClaimRedPacketResult {
  success: boolean;
  claimedAmount?: bigint;
  transactionHash?: string;
  error?: string;
}

export interface RedPacketStatusTexts {
  creating: string;
  encrypting: string;
  sendingToBlockchain: string;
  createSuccess: string;
  createFailed: string;
  invalidAmount: string;
  invalidRecipient: string;
  cannotSendToSelf: string;
  fheNotInitialized: string;
}

export class RedPacketService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;

  constructor() {
    // 使用项目配置的 RPC，避免默认节点 400/限流
    const rpc = UNIFIED_CONFIG?.NETWORK?.rpcUrl || 'https://eth-sepolia.public.blastapi.io';
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpc)
    });
  }

  private async initWalletClient() {
    if (!this.walletClient && typeof window !== 'undefined' && window.ethereum) {
      this.walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(window.ethereum)
      });
    }
    return this.walletClient;
  }

  private static getStatusTexts(): RedPacketStatusTexts {
    return {
      creating: t('creating_redpacket', '创建红包中...'),
      encrypting: t('encrypting_amount', '加密金额中...'),
      sendingToBlockchain: t('sending_to_blockchain', '发送到区块链...'),
      createSuccess: t('redpacket_created_success', '红包创建成功'),
      createFailed: t('create_redpacket_failed', '创建红包失败'),
      invalidAmount: t('invalid_amount', '无效的金额'),
      invalidRecipient: t('invalid_recipient', '无效的接收者地址'),
      cannotSendToSelf: t('cannot_send_to_self_redpacket', '不能给自己发红包'),
      fheNotInitialized: t('fhe_not_initialized_redpacket', 'FHE系统未初始化，无法创建红包')
    };
  }

  static isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  static async createRedPacketWithProgress(
    amount: string,
    recipient: string,
    message: string,
    account: string,
    fhevmInstance: unknown,
    onTempRedPacketUpdate: (tempRedPacket: TempRedPacket) => void,
    onTempRedPacketStatusUpdate: (tempId: string, status: TempRedPacket['status'], statusText: string) => void,
    onTempRedPacketRemove: (tempId: string) => void,
    onRedPacketHistoryReload: () => void
  ): Promise<void> {
    const tempRedPacketId = `temp_redpacket_${Date.now()}_${Math.random()}`;
    const statusTexts = this.getStatusTexts();
    
    try {
      // 参数验证
      if (!amount.trim() || isNaN(Number(amount.trim())) || Number(amount.trim()) <= 0) {
        throw new Error(statusTexts.invalidAmount);
      }
      
      if (!this.isValidAddress(recipient)) {
        throw new Error(statusTexts.invalidRecipient);
      }
      
      if (recipient.toLowerCase() === account?.toLowerCase()) {
        throw new Error(statusTexts.cannotSendToSelf);
      }
      
      if (!fhevmInstance) {
        throw new Error(statusTexts.fheNotInitialized);
      }

      const tempRedPacket: TempRedPacket = {
        id: tempRedPacketId,
        amount: amount.trim(),
        recipient: recipient,
        message: message,
        status: 'sending',
        statusText: statusTexts.creating,
        timestamp: Date.now()
      };
      onTempRedPacketUpdate(tempRedPacket);

      // 更新状态：加密中
      onTempRedPacketStatusUpdate(tempRedPacketId, 'sending', statusTexts.encrypting);
      
      // 更新状态：发送到区块链
      onTempRedPacketStatusUpdate(tempRedPacketId, 'sending', statusTexts.sendingToBlockchain);
      
      // 调用原有的创建方法
      const result = await this.createRedPacket(amount, recipient, message, account, fhevmInstance);

      if (result.success && typeof result.packetId === 'number') {
        onTempRedPacketStatusUpdate(tempRedPacketId, 'sent', statusTexts.createSuccess);
        onRedPacketHistoryReload();
      } else {
        throw new Error(result.error || statusTexts.createFailed);
      }

    } catch (error) {
      onTempRedPacketStatusUpdate(tempRedPacketId, 'failed', `${statusTexts.createFailed}: ${error}`);
      throw error;
    }
  }

  static async createRedPacket(
    amount: string,
    recipient: string,
    message: string,
    senderAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fheInstance: any
  ): Promise<CreateRedPacketResult> {
    try {
      const service = new RedPacketService();
      const walletClient = await service.initWalletClient();
      if (!walletClient) {
        throw new Error('无法初始化钱包客户端');
      }

      const amountWei = parseEther(amount);
      
      const input = fheInstance.createEncryptedInput(BANKING_ADDRESS, senderAddress);
      input.add64(amountWei);
      
      const encryptedInput = await input.encrypt();
      

      const handle = encryptedInput?.handles?.[0];
      const proof = encryptedInput?.inputProof;
      if (!handle || !proof) {
        throw new Error('加密结果无效：handle/proof 缺失');
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convertToBytes = (obj: any): Uint8Array => {
        if (obj instanceof Uint8Array) return obj;
        if (Array.isArray(obj)) return new Uint8Array(obj);
        const keys = Object.keys(obj).map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
        return new Uint8Array(keys.map(k => obj[k]));
      };
      const handleHex = '0x' + Array.from(convertToBytes(handle)).map(b => b.toString(16).padStart(2, '0')).join('');
      const proofHex = '0x' + Array.from(convertToBytes(proof)).map(b => b.toString(16).padStart(2, '0')).join('');

      const txHash = await walletClient.writeContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'createRedPacket',
        args: [
          handleHex,
          proofHex,
          recipient,
          message
        ],
        account: senderAddress as `0x${string}`,
        chain: sepolia,
      });

      if (!txHash) {
        throw new Error('交易提交失败：未获取到交易哈希');
      }
      
      const receipt = await service.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60000
      });

      if (receipt.status === 'success') {
        let packetId: number | undefined;
        
        for (const log of receipt.logs) {
          try {
            const decodedLog = decodeEventLog({
              abi: ConfidentialBankingABI.abi,
              data: log.data,
              topics: log.topics,
            });

            if (decodedLog.eventName === 'RedPacketCreated' && decodedLog.args) {
              const argsObj = decodedLog.args as { packetId?: bigint | number | string } | readonly unknown[];
              const pid = (argsObj as { packetId?: bigint | number | string }).packetId;
              if (pid !== undefined) {
                packetId = Number(pid);
              }
              break;
            }
          } catch {
            
          }
        }

        if (typeof packetId === 'number') {
          return {
            success: true,
            packetId,
            transactionHash: txHash
          };
        } else {
          return {
            success: false,
            error: '无法获取红包ID'
          };
        }
      } else {
        return {
          success: false,
          error: '交易失败'
        };
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '创建红包失败'
      };
    }
  }

  static async claimRedPacket(
    packetId: number,
    claimerAddress: string
  ): Promise<ClaimRedPacketResult> {
    try {
      const service = new RedPacketService();
      const walletClient = await service.initWalletClient();
      if (!walletClient) {
        throw new Error('无法初始化钱包客户端');
      }

      const txHash = await walletClient.writeContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'claimRedPacket',
        args: [packetId],
        account: claimerAddress as `0x${string}`,
      });

      const receipt = await service.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60000
      });

      if (receipt.status === 'success') {
        return {
          success: true,
          transactionHash: txHash
        };
      } else {
        return {
          success: false,
          error: '交易失败'
        };
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '领取红包失败'
      };
    }
  }

  static async reclaimExpiredRedPacket(
    packetId: number,
    senderAddress: string
  ): Promise<ClaimRedPacketResult> {
    try {
      const service = new RedPacketService();
      const walletClient = await service.initWalletClient();
      if (!walletClient) {
        throw new Error('无法初始化钱包客户端');
      }

      const txHash = await walletClient.writeContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'reclaimExpiredRedPacket',
        args: [packetId],
        account: senderAddress as `0x${string}`,
      });

      const receipt = await service.publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60000
      });

      if (receipt.status === 'success') {
        return {
          success: true,
          transactionHash: txHash
        };
      } else {
        return {
          success: false,
          error: '交易失败'
        };
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '回收红包失败'
      };
    }
  }

  static async getRedPacketInfo(packetId: number): Promise<RedPacketInfo | null> {
    try {
      const service = new RedPacketService();
      const result = await service.publicClient.readContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'getRedPacket',
        args: [packetId],
        blockTag: 'latest',
      }) as [string, string, bigint, boolean];

      const redPacketInfo = {
        id: packetId,
        sender: result[0],
        recipient: result[1],
        expireTime: Number(result[2]),
        claimed: result[3]
      };

      return redPacketInfo;
    } catch {
      return null;
    }
  }

  static async getRedPacketAmount(
    packetId: number,
    userAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fheInstance: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletClient: any
  ): Promise<bigint | null> {
    try {
      const service = new RedPacketService();
      
      const encryptedHandle = await service.publicClient.readContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'getRedPacketAmountHandle',
        args: [packetId],
        account: userAddress as `0x${string}`,
      }) as string;

      if (!encryptedHandle || encryptedHandle === '0x') {
        return null;
      }

      const keypair = fheInstance.generateKeypair();
      
      const handleContractPairs = [{
        handle: encryptedHandle,
        contractAddress: BANKING_ADDRESS,
      }];
      
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = "10";
      const contractAddresses = [BANKING_ADDRESS];

      const eip712 = fheInstance.createEIP712(
        keypair.publicKey, 
        contractAddresses, 
        startTimeStamp, 
        durationDays
      );

      const signature = await walletClient.signTypedData({
        ...eip712,
        account: userAddress
      });

      const decryptResult = await fheInstance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        contractAddresses,
        userAddress,
        startTimeStamp,
        durationDays
      );

      const decryptedValue = decryptResult[encryptedHandle];
      if (decryptedValue !== undefined) {
        const amount = BigInt(decryptedValue);
        return amount;
      } else {
        return null;
      }

    } catch {
      return null;
    }
  }

  static async getUserRedPackets(userAddress: string): Promise<number[]> {
    try {
      const service = new RedPacketService();
      
      const result = await service.publicClient.readContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'getUserRedPackets',
        args: [userAddress],
        blockTag: 'latest',
      }) as number[];

      return result || [];
    } catch {
      return [];
    }
  }

  static isRedPacketExpired(expireTime: number): boolean {
    return Date.now() / 1000 > expireTime;
  }

  static formatExpireTime(expireTime: number): string {
    const expireDate = new Date(expireTime * 1000);
    const now = new Date();
    const lang = typeof window !== 'undefined' ? (localStorage.getItem('app_locale') || 'zh') : 'zh';
    const isEn = lang === 'en';
    
    if (expireDate < now) {
      return isEn ? 'Expired' : '已过期';
    }
    
    const diffMs = expireDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 1) {
      return isEn ? `Expires in ${diffDays} days` : `${diffDays}天后过期`;
    } else {
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      return isEn ? `Expires in ${diffHours} hours` : `${diffHours}小时后过期`;
    }
  }
}