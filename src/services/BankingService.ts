import { parseEther, formatEther } from 'viem';
import { BANKING_ADDRESS, UNIFIED_CONFIG } from '../config/contracts';
import ConfidentialBankingABI from '../abi/ConfidentialBanking.json';
import { logInfo, logError } from '../utils/unified-logger';
import { t } from '../utils/i18n';
import { createPublicClient, createWalletClient, custom, http } from 'viem';
import { sepolia } from 'viem/chains';
import { decodeEventLog } from 'viem';

export interface BankingResult {
  success: boolean;
  txHash?: string;
  balance?: string;
  message?: string;
  error?: string;
  requestId?: number;
  decryptedAmount?: string;
  amountEth?: string;
}

export class BankingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private walletClient: any;

  constructor() {
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
  
  private async verifyWalletAccount(expectedAddress: string): Promise<boolean> {
    try {
      const walletClient = await this.initWalletClient();
      if (!walletClient) return false;
      
      const accounts = await walletClient.getAddresses();
      const currentAccount = accounts[0];
      
      logInfo('期望地址与当前地址', { expected: expectedAddress, current: currentAccount });
      
      const isMatch = currentAccount.toLowerCase() === expectedAddress.toLowerCase();
      if (!isMatch) {
        logError('地址不匹配', { expected: expectedAddress, actual: currentAccount });
      }
      
      return isMatch;
    } catch (error) {
      logError('验证钱包账户失败:', error);
      return false;
    }
  }

  async deposit(
    amount: string,
    userAddress: string
  ): Promise<BankingResult> {
    try {
      logInfo('开始存款流程...');
      
      const isAccountValid = await this.verifyWalletAccount(userAddress);
      if (!isAccountValid) {
         throw new Error(t('wallet_mismatch', '钱包账户与传入地址不匹配，请确认钱包连接正确或刷新页面重试'));
      }
      
      const walletClient = await this.initWalletClient();
      if (!walletClient) {
        throw new Error(t('wallet_client_init_failed', '无法初始化钱包客户端'));
      }

      const amountWei = parseEther(amount);
      logInfo(`存款金额: ${amount} ETH (${amountWei.toString()} wei)`);
      
      logInfo('准备调用存款合约...');
      
      const txHash = await walletClient.writeContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'deposit',
        args: [],
        account: userAddress as `0x${string}`,
        value: amountWei,
      });

       logInfo(t('deposit_tx_submitted', '存款交易已提交') + `: ${txHash}`);

      try {
        logInfo('正在等待交易确认...');
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 90000
        });

        logInfo('交易确认完成，状态:', receipt.status);
        
        if (receipt.status === 'success') {
          logInfo('存款成功!');
          return {
            success: true,
            txHash,
            message: `成功存款 ${amount} ETH`
          };
        } else {
           logError('存款交易被链上拒绝');
           throw new Error(t('deposit_tx_failed_with_status', '存款交易失败 - 交易状态') + `: ${receipt.status}`);
        }
      } catch (waitError: unknown) {
        const waitMsg = waitError instanceof Error ? waitError.message : String(waitError);
        logError('等待交易确认时出错:', waitMsg);
        
        try {
      const tx = await this.publicClient.getTransaction({ hash: txHash });
      const diag = {
        status: 'pending' in (tx as unknown as Record<string, unknown>) ? 'pending' : 'unknown',
        gasPrice: (tx as unknown as { gasPrice?: bigint }).gasPrice?.toString(),
        gasLimit: (tx as unknown as { gas?: bigint }).gas?.toString()
      };
      logInfo('交易状态诊断', diag);
        } catch (diagError) {
          logError('无法获取交易详情:', diagError);
        }
        
         throw new Error(t('tx_confirm_timeout_or_failed', '交易确认超时或失败') + `: ${waitMsg}`);
      }

    } catch (error: unknown) {
      logError('存款失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('deposit_operation_failed', '存款操作失败')
      };
    }
  }

  async withdraw(
    amount: string,
    userAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fheInstance: any
  ): Promise<BankingResult> {
    try {
      logInfo('开始隐私提取流程...');
      
      const isAccountValid = await this.verifyWalletAccount(userAddress);
      if (!isAccountValid) {
         throw new Error(t('wallet_mismatch', '钱包账户与传入地址不匹配，请确认钱包连接正确或刷新页面重试'));
      }
      
      const walletClient = await this.initWalletClient();
      if (!walletClient) {
        throw new Error(t('wallet_client_init_failed', '无法初始化钱包客户端'));
      }

      const amountWei = parseEther(amount);
      logInfo(`提取金额: ${amount} ETH (${amountWei.toString()} wei)`);

      const input = fheInstance.createEncryptedInput(BANKING_ADDRESS, userAddress);
      input.add64(amountWei);
      
      logInfo('正在加密提取金额...');
      const encryptedInput = await input.encrypt();
      
      logInfo('准备提交加密提取请求...');
      
      const handle = encryptedInput.handles[0];
      const proof = encryptedInput.inputProof;
      
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
        functionName: 'withdraw',
        args: [handleHex, proofHex],
        account: userAddress as `0x${string}`,
      });

      logInfo(t('withdraw_tx_submitted', '提取请求已提交') + `: ${txHash}`);

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash
      });

      if (receipt.status === 'success') {
        const requestId = await this.extractRequestIdFromReceipt(receipt);
        
        logInfo(`提取请求创建成功! RequestID: ${requestId}`);
        return {
          success: true,
          txHash,
          requestId, 
          message: `提取请求已提交成功！系统将自动处理解密和转账，无需进一步操作。RequestID: ${requestId}`
        };
      } else {
        throw new Error(t('withdraw_tx_failed', '提取请求交易失败'));
      }

    } catch (error: unknown) {
      logError('提取请求失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('withdraw_operation_failed', '提取请求操作失败')
      };
    }
  }



  private async extractRequestIdFromReceipt(receipt: { logs?: Array<{ data: `0x${string}`; topics: readonly `0x${string}`[] }> }): Promise<number> {
    try {
      const withdrawEvent = receipt.logs?.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: ConfidentialBankingABI.abi,
            data: log.data,
            topics: [log.topics[0] as `0x${string}`]
          });
          return decoded.eventName === 'WithdrawRequested';
        } catch {
          return false;
        }
      });

      if (withdrawEvent) {
        const decoded = decodeEventLog({
          abi: ConfidentialBankingABI.abi,
          data: withdrawEvent.data,
          topics: [withdrawEvent.topics[0] as `0x${string}`]
        });
        const args = (decoded as unknown as { args?: { requestId?: bigint | number | string } }).args;
        const reqIdVal = args?.requestId;
        if (typeof reqIdVal === 'bigint' || typeof reqIdVal === 'number' || typeof reqIdVal === 'string') {
          return Number(reqIdVal);
        }
      }

      throw new Error('无法从交易收据中找到 RequestID');
    } catch (error) {
      logError('提取RequestID失败:', error);
      throw new Error('无法获取 RequestID，请检查交易状态');
    }
  }

  async getBalance(
    userAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fheInstance: any
  ): Promise<BankingResult> {
    try {
       logInfo(t('querying_balance', '开始查询余额...'));
      
      const walletClient = await this.initWalletClient();
      if (!walletClient) {
         throw new Error(t('wallet_client_init_failed', '无法初始化钱包客户端'));
      }

       logInfo(t('fetching_encrypted_balance', '正在获取加密余额...'));
      const encryptedBalance = await this.publicClient.readContract({
        address: BANKING_ADDRESS,
        abi: ConfidentialBankingABI.abi,
        functionName: 'getBalanceHandle',
        args: [userAddress],
      });

       logInfo(t('decrypting_balance', '正在解密余额...'));
      
      const result = await this.decryptBalance(
        encryptedBalance,
        fheInstance,
        walletClient,
        userAddress
      );

      if (result.success) {
        logInfo(`余额查询成功: ${result.balance} ETH`);
        return result;
      } else {
         throw new Error(result.error || t('balance_decrypt_failed', '余额解密失败'));
      }

    } catch (error: unknown) {
      logError('余额查询失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : t('balance_query_failed', '余额查询失败')
      };
    }
  }

  private async decryptBalance(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    encryptedBalance: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fheInstance: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletClient: any,
    userAddress: string
  ): Promise<BankingResult> {
    try {
      const handleStr = encryptedBalance.toString();
      logInfo(`获取到的余额句柄: ${handleStr}`);
      
      if (handleStr === '0' || 
          handleStr === '0x0' ||
          handleStr === '0x0000000000000000000000000000000000000000000000000000000000000000' ||
          !handleStr || 
          handleStr === 'undefined' ||
          handleStr === 'null') {
        logInfo('用户没有余额记录或余额未初始化，返回0余额');
        return {
          success: true,
          balance: '0.000000'
        };
      }

      const keypair = fheInstance.generateKeypair();
      
      const handleContractPairs = [{
        handle: encryptedBalance.toString(),
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

       logInfo(t('creating_user_decrypt_signature', '创建用户解密签名...'));
      const signature = await walletClient.signTypedData({
        ...eip712,
        account: userAddress
      });

       logInfo(t('executing_user_decrypt', '执行用户解密...'));
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

      const decryptedValue = decryptResult[encryptedBalance.toString()];
      if (decryptedValue !== undefined) {
        const balanceETH = formatEther(BigInt(decryptedValue));
        return {
          success: true,
          balance: parseFloat(balanceETH).toFixed(6)
        };
      } else {
         throw new Error(t('decrypt_result_empty', '解密结果为空'));
      }

    } catch (error: unknown) {
       logError('余额解密失败:', error);
      
      try {
         logInfo(t('trying_public_decrypt', '尝试公共解密...'));
        const publicDecryptResult = await fheInstance.publicDecrypt([encryptedBalance]);
        const decryptedValue = publicDecryptResult[encryptedBalance.toString()];
        
        if (decryptedValue !== undefined) {
          const balanceETH = formatEther(BigInt(decryptedValue));
          return {
            success: true,
            balance: parseFloat(balanceETH).toFixed(6)
          };
        }
      } catch (publicDecryptError) {
        logError('公共解密也失败:', publicDecryptError);
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : t('balance_decrypt_failed', '余额解密失败')
      };
    }
  }
} 