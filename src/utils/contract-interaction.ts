import { ethers } from 'ethers';
import { encryptMessageOptimized } from './fhe-message-encryption';
import { handleError } from './error-handlers';
import { AuthHelper } from './auth-helper';
import { logInfo } from './unified-logger';

function isValidAddress(address: string): boolean {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

/**
 * 多块版：发送加密消息到合约 - euint64平衡优化
 * @param authHelper AuthHelper实例
 * @param message 要发送的消息（任意长度）
 * @param recipientAddress 接收者地址
 * @returns 交易哈希
 */
export async function sendEncryptedMessageToContractOptimized(
  authHelper: AuthHelper,
  message: string,
  recipientAddress: string
): Promise<string> {
  // 关键修复：在函数开始就标准化地址，确保在整个函数中可用
  if (!isValidAddress(recipientAddress)) {
    throw new Error('接收者地址无效');
  }
  
  // 使用ethers.getAddress确保接收者地址也是标准化格式
  const normalizedRecipientAddress = ethers.getAddress(recipientAddress);

  try {
    logInfo('准备发送优化加密消息');
    
    // 验证消息长度
    const messageBytes = new TextEncoder().encode(message);
    if (messageBytes.length === 0) {
      throw new Error('消息不能为空');
    }

    // 动态导入简洁Messaging合约地址
    const { MESSAGING_ADDRESS: currentContractAddress } = await import('../config/contracts');

    // 获取必要的参数
    const signer = authHelper.getSigner();
    const senderAddress = await signer.getAddress();
    
    // 关键修复：确保加密绑定地址与交易发送者地址格式完全一致
    const normalizedSenderAddress = ethers.getAddress(senderAddress);
    
    // 验证地址格式
    if (!normalizedSenderAddress || !normalizedSenderAddress.startsWith('0x') || normalizedSenderAddress.length !== 42) {
      throw new Error(`发送者地址格式错误: ${normalizedSenderAddress}`);
    }
      
    // 使用优化加密 - 确保地址绑定正确
    const { encryptedHandles, inputProofs } = await encryptMessageOptimized(
      message,
      authHelper.getFhevmInstance(),
      currentContractAddress,
      normalizedSenderAddress  // 关键：使用标准化地址进行加密绑定
    );

    // 发送消息到合约
    const contract = authHelper.getContract();
    
    // 检查加密结果
    if (encryptedHandles.length === 0) {
      throw new Error('加密失败，没有生成有效的加密值');
    }
    
    // 验证加密结果
    if (inputProofs.length !== encryptedHandles.length || encryptedHandles.length === 0) {
      throw new Error(`加密结果异常：句柄数量(${encryptedHandles.length})与证明数量(${inputProofs.length})不匹配`);
    }

    // 调用合约sendMessage函数
    // 发送详情调试日志移除，避免控制台噪音
    
    // 直接使用FHE句柄数组，不进行任何转换
    
    // 验证所有句柄存在
    for (let i = 0; i < encryptedHandles.length; i++) {
      if (!encryptedHandles[i]) {
        throw new Error(`FHE句柄 ${i} 无效或不存在`);
      }
    }
    
    // 检查基本条件
    if (normalizedRecipientAddress.toLowerCase() === normalizedSenderAddress.toLowerCase()) {
      throw new Error('不能向自己发送消息');
    }
    
    if (!normalizedRecipientAddress || normalizedRecipientAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('接收者地址无效');
    }
    
    // 验证合约状态
    try {
      const contract = authHelper.getContract();
      
      // 检查合约是否暂停
      const isPaused = await contract.paused();
      if (isPaused) {
        throw new Error('合约当前已暂停，无法发送消息');
      }
      
      // 验证函数存在
      if (typeof contract.sendMessage !== 'function') {
        throw new Error('合约中不存在sendMessage函数');
      }
      
    } catch (contractError) {
      throw new Error(`合约验证失败: ${contractError instanceof Error ? contractError.message : String(contractError)}`);
    }
    
    // 关键修复：使用正确签名者连接合约
    const messageSigner = authHelper.getSigner();
    const signerAddress = await messageSigner.getAddress();
    const normalizedSignerAddress = ethers.getAddress(signerAddress);
    
    // 验证地址匹配
    
    // 确保地址匹配 - 使用标准化地址比较
    if (normalizedSignerAddress !== normalizedSenderAddress) {
      throw new Error(`地址不匹配！签名者: ${normalizedSignerAddress}, 加密绑定: ${normalizedSenderAddress}`);
    }
    
    // 连接正确的签名者
    const connectedContract = contract.connect(messageSigner) as ethers.Contract & { 
      sendMessage: (recipient: string, handles: unknown[], proofs: unknown[]) => Promise<ethers.ContractTransactionResponse>;
    };
    
    const tx = await connectedContract.sendMessage(
      normalizedRecipientAddress,
      encryptedHandles, // 传递整个句柄数组
      inputProofs       // 传递整个证明数组
    );

    // 将成功信息交由上层提示，不在控制台打印
    await tx.wait();
    // 确认区块无需打印
    return tx.hash;
  } catch (error) {
    // 控制台错误改为统一错误处理
    handleError('发送消息失败', error);
    throw error;
  }
}

/**
 * 发送加密消息到合约（兼容版本 - 重定向到优化版本）
 * @param authHelper AuthHelper实例
 * @param message 要发送的消息
 * @param recipientAddress 接收者地址
 * @returns 交易哈希
 */
export async function sendEncryptedMessageToContract(
  authHelper: AuthHelper,
  message: string,
  recipientAddress: string
): Promise<string> {
  // 统一重定向到优化版本，保持向后兼容
  return sendEncryptedMessageToContractOptimized(authHelper, message, recipientAddress);
} 