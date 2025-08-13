// FHE 消息加密工具

import { handleError } from './error-handlers';
import { logInfo, logError, logWarn, logDebug } from './unified-logger';


interface DecryptionResult {
  content: string;
  isComplete: boolean;
}

class DecryptionCache {
  private cache = new Map<string, { result: DecryptionResult; timestamp: number }>();
  private readonly maxSize = 1000;
  private readonly ttl = 5 * 60 * 1000;

  getCached(handles: string[]): DecryptionResult | null {
    const key = handles.sort().join('|');
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      logInfo(` 解密缓存命中: ${handles.length} 个句柄`);
      return cached.result;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }

  setCached(handles: string[], result: DecryptionResult): void {
    if (this.cache.size >= this.maxSize) {

      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    const key = handles.sort().join('|');
    this.cache.set(key, { result, timestamp: Date.now() });
    logInfo(` 解密结果已缓存: ${handles.length} 个句柄`);
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

const fheDecryptionCache = new DecryptionCache();

// 轻量本地加密缓存，替代外部 fhe-cache 依赖
class EncryptionCache {
  private cache = new Map<string, { encryptedHandle: string; inputProof: string; timestamp: number }>();
  private readonly maxSize = 2000;
  private readonly ttl = 10 * 60 * 1000;

  private buildKey(value: number, contractAddress: string, senderAddress: string): string {
    return `${value}|${contractAddress}|${senderAddress}`;
  }

  getCached(value: number, contractAddress: string, senderAddress: string): { encryptedHandle: string; inputProof: string } | null {
    const key = this.buildKey(value, contractAddress, senderAddress);
    const rec = this.cache.get(key);
    if (rec && Date.now() - rec.timestamp < this.ttl) {
      return { encryptedHandle: rec.encryptedHandle, inputProof: rec.inputProof };
    }
    if (rec) this.cache.delete(key);
    return null;
  }

  setCached(value: number, contractAddress: string, senderAddress: string, encryptedHandle: string, inputProof: string): void {
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    const key = this.buildKey(value, contractAddress, senderAddress);
    this.cache.set(key, { encryptedHandle, inputProof, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats() {
    return { size: this.cache.size, maxSize: this.maxSize };
  }
}

const fheEncryptionCache = new EncryptionCache();


async function encryptChunksNonBlocking(
  toEncryptValues: Array<{value: number | bigint; index: number}>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fheInstance: Record<string, any>,
  contractAddress: string,
  senderAddress: string
): Promise<Array<{handle: string; proof: string; index: number}>> {
  const results: Array<{handle: string; proof: string; index: number}> = [];
  

  logInfo(`一次性加密: ${toEncryptValues.length} 个值`);
  

  const input = fheInstance.createEncryptedInput(contractAddress, senderAddress);
  

  toEncryptValues.forEach(({value}) => {
    const valueForEncryption = typeof value === 'bigint' ? value : BigInt(value);
    input.add64(valueForEncryption);
  });
  
  try {
    const enc = await input.encrypt();
    

    if (!enc.handles || enc.handles.length !== toEncryptValues.length) {
      throw new Error(`加密失败：句柄数量不匹配，期望 ${toEncryptValues.length}，实际 ${enc.handles?.length || 0}`);
    }
    
    if (!enc.inputProof) {
      throw new Error('加密失败：未生成证明');
    }
    
  
    toEncryptValues.forEach(({value, index}, i) => {
      const handle = enc.handles[i];
      if (!handle) {
        throw new Error(`值 ${i} 句柄生成失败`);
      }
      

      const valueForCache = typeof value === 'bigint' ? Number(value) : value;
      fheEncryptionCache.setCached(
        valueForCache,
        contractAddress,
        senderAddress,
        handle,
        enc.inputProof
      );
      
      results.push({
        handle,
        proof: enc.inputProof,
        index
      });
    });
    
    logInfo(`一次性加密完成: ${results.length} 个值`);
    
  } catch (error) {
    logError('一次性加密失败', error);
    throw new Error(`加密失败: ${(error as Error).message}`);
  }
  
  logInfo(`加密完成: ${results.length} 个句柄`);
  return results;
}

// 将文本转换为字节数组
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// 将字节数组分割成固定大小的块
export function splitMessageIntoChunks(bytes: Uint8Array, chunkSize: number = 4): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize));
  }
  return chunks;
}

// 将字节数组转换回文本
export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * 多块版：使用euint64加密消息 - 平衡gas与容量
 * 每个块7字节数据+1字节长度，支持任意长度消息，使用64位加密平衡优化
 */
export async function encryptMessageOptimized(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fheInstance: Record<string, any>,
  contractAddress: string,
  senderAddress: string
): Promise<{
  encryptedHandles: string[];
  inputProofs: string[];
}> {
  try {
    logInfo('开始优化加密消息 (euint64 + 并行加速)...');
    const messageBytes = textToBytes(message);
    // 统一euint64优化：保持合约兼容性
    const chunkSize = 8; // euint64: 8字节数据，不使用长度前缀
    const maxChunks = Math.min(64, Math.ceil(messageBytes.length / chunkSize));
    const chunks = splitMessageIntoChunks(messageBytes, chunkSize);
    
    if (chunks.length > maxChunks) {
      logWarn(`消息过长，截断至 ${maxChunks} 个块以确保性能`);
      chunks.splice(maxChunks);
    }
    
    // 验证地址格式
    if (!senderAddress || senderAddress.length !== 42 || !senderAddress.startsWith('0x')) {
      throw new Error(`发送者地址格式错误: ${senderAddress}`);
    }
    
    logInfo(`消息分块: ${chunks.length} 个块，每块8字节数据 (euint64)`);
    
    // 非阻塞加密优化 - 避免UI卡顿
    logInfo(`启用非阻塞加密，处理 ${chunks.length} 个块...`);
    
    // 准备所有块的数据
    const chunkValues: (number | bigint)[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // euint64简化方案 - 直接8字节存储（使用BigInt避免溢出）
      let chunkValue = 0n;
      
      // euint64支持8字节数据，从低位开始填充
      for (let j = 0; j < Math.min(chunk.length, 8); j++) {
        chunkValue |= (BigInt(chunk[j]) << BigInt(j * 8)); // 低位在前
      }
      
      // 转回数字（如果可能的话）
      const finalValue = chunkValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(chunkValue) : chunkValue;
      
      chunkValues.push(finalValue);
      logInfo(`块 ${i}: [${Array.from(chunk).join(', ')}] -> ${finalValue}`);
    }
    

    const encryptedHandles: string[] = [];
    const inputProofs: string[] = [];
    

    const cachedResults: Array<{handle: string; proof: string; index: number}> = [];
    const toEncryptValues: Array<{value: number | bigint; index: number}> = [];
    
    for (let i = 0; i < chunkValues.length; i++) {
      const chunkValue = chunkValues[i];
      const valueForCache = typeof chunkValue === 'bigint' ? Number(chunkValue) : chunkValue;
      const cached = fheEncryptionCache.getCached(valueForCache, contractAddress, senderAddress);
      
      if (cached) {
        cachedResults.push({
          handle: cached.encryptedHandle,
          proof: cached.inputProof,
          index: i
        });
      } else {
        toEncryptValues.push({ value: chunkValue, index: i });
      }
    }
    
    logInfo(`缓存优化: ${cachedResults.length}/${chunkValues.length} 块命中缓存`);
    

    if (toEncryptValues.length > 0) {
      const encryptionResults = await encryptChunksNonBlocking(
        toEncryptValues, 
        fheInstance, 
        contractAddress, 
        senderAddress
      );
      cachedResults.push(...encryptionResults);
    }
    
    // 按原顺序组织结果
    cachedResults.sort((a, b) => a.index - b.index);
    for (const result of cachedResults) {
      encryptedHandles.push(result.handle);
      inputProofs.push(result.proof);
    }
    
    const encCacheStats = fheEncryptionCache.getStats();
    const decCacheStats = fheDecryptionCache.getStats();
    logInfo(`多块加密完成: ${encryptedHandles.length} 个块`);
    logInfo(`缓存状态 - 加密: ${encCacheStats.size}/${encCacheStats.maxSize}, 解密: ${decCacheStats.size}/${decCacheStats.maxSize}`);

    return { 
      encryptedHandles,
      inputProofs
    };
  } catch (error) {
    handleError('优化消息加密失败', error);
    throw error;
  }
}

/**
 * 使用FHE加密消息（兼容版本 - 重定向到优化版本）
 * 保持向后兼容，统一使用优化的euint32加密
 */
export async function encryptMessage(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fheInstance: Record<string, any>,
  contractAddress: string,
  senderAddress: string
): Promise<{
  encryptedHandles: string[];
  inputProofs: string[];
}> {

  return encryptMessageOptimized(message, fheInstance, contractAddress, senderAddress);
}


export function decryptMessage(decryptedChunks: number[]): string {
  try {
    // 1. 将每个chunk转换回字节
    const bytes: number[] = [];
    for (const chunk of decryptedChunks) {
      for (let i = 0; i < 8; i++) {
        const byte = (chunk >> (i * 8)) & 0xFF;
        if (byte !== 0) {
          bytes.push(byte);
        }
      }
    }

    // 2. 将字节数组转换回文本
    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(bytes));
  } catch (error) {
    logError('消息解密失败', error);
    throw error;
  }
} 

/**
 * 解析FHE解密后的值为文本
 * 根据Zama合约的加密/解密方式优化
 * @param decryptedValues 解密后的数值数组
 * @returns 解析后的文本消息
 */
export function parseDecryptedValues(decryptedValues: (string | number | bigint)[]): string {
  try {
    logInfo(' 解析解密值...');
    // 将数字值转换为字节数组
    const bytes: number[] = [];
    
    for (const value of decryptedValues) {
      logDebug(`处理解密值: ${value} (类型: ${typeof value})`);
      
      // 检查是否超过JavaScript安全整数范围
      if (typeof value === 'bigint' || (typeof value === 'number' && value > Number.MAX_SAFE_INTEGER)) {
        logDebug('检测到超大值，使用BigInt处理');
        // 对于超大值，直接使用BigInt进行位操作
        const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);
        
        // euint64：简化方案，类似euint32逻辑（BigInt版本）
        logDebug(`BigInt原值: ${bigIntValue} (0x${bigIntValue.toString(16)})`);
        
        const currentBytes: number[] = [];
        
        // 从低位开始提取8个字节，类似euint32的处理方式
        for (let i = 0; i < 8; i++) {
          const byte = Number((bigIntValue >> BigInt(i * 8)) & 0xFFn);
          logDebug(`字节 ${i}: ${byte} (从低位移: ${i * 8})`);
          if (byte !== 0) { // 忽略零字节
            currentBytes.push(byte);
          }
        }
        
        logDebug(`从BigInt值 ${bigIntValue} 提取字节: [${currentBytes.join(', ')}]`);
        bytes.push(...currentBytes);
      } else {
        // 对于安全范围内的数值，使用常规方法
        const tempValue = typeof value === 'number' ? value : Number(value);
        logDebug(`处理安全范围值: ${tempValue}`);
        
        // euint64：简化方案，类似euint32逻辑（数学运算版本）
        logDebug(`数学运算原值: ${tempValue} (0x${tempValue.toString(16)})`);
        
        const currentBytes: number[] = [];
        
        // 从低位开始提取8个字节，类似euint32的处理方式
        for (let i = 0; i < 8; i++) {
          const byte = Math.floor(tempValue / Math.pow(2, i * 8)) & 0xFF;
          logDebug(`字节 ${i}: ${byte} (从低位移: ${i * 8})`);
          if (byte !== 0) { // 忽略零字节
            currentBytes.push(byte);
          }
        }
        
        logDebug(`从值 ${tempValue} 提取字节: [${currentBytes.join(', ')}]`);
        bytes.push(...currentBytes);
      }
    }
    
    logDebug(`待解码字节数组: [${bytes.join(', ')}] (共${bytes.length}字节)`);
    
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(new Uint8Array(bytes));
      
      logDebug(`UTF-8解析完成: "${text}"`);
      
      // 简化处理，不再使用复杂的分片系统
      logDebug('解析完成，返回消息内容');
      return text.trim();
    } catch (decodeError) {
      logError('UTF-8解码失败，尝试其他方式', decodeError);
      
      // 备用方案：直接转换为字符
      try {
        const fallbackText = bytes
          .filter(byte => byte > 0 && byte < 256) // 过滤有效字节
          .map(byte => String.fromCharCode(byte))
          .join('');
        
        logDebug(`备用解析完成: "${fallbackText}"`);
        return fallbackText.trim();
      } catch (fallbackError) {
        logError('备用解码也失败', fallbackError);
        return '解码失败';
      }
    }
  } catch (error) {
    logError('解析解密值失败', error);
    // 尝试简单转换方法
    try {
      // 确保BigInt转换为Number
      return decryptedValues.map(val => {
        const numVal = typeof val === 'bigint' ? Number(val) : (typeof val === 'string' ? parseFloat(val) : Number(val));
        // 确保值在有效的字符码范围内
        if (numVal > 0 && numVal <= 0x10FFFF) {
          return String.fromCharCode(numVal);
        }
        // 如果值太大，尝试提取可能的字符
        let charStr = '';
        let tempVal = Math.floor(numVal);
        while (tempVal > 0) {
          const charCode = tempVal & 0xFF;
          if (charCode >= 32 && charCode <= 126) { // 可打印ASCII范围
            charStr = String.fromCharCode(charCode) + charStr;
          }
          tempVal = Math.floor(tempVal / 256);
        }
        return charStr || '?';
      }).join('');
    } catch (fallbackError) {
      logError('备用解析也失败', fallbackError);
      return '解密失败，无法解析数据';
    }
  }
}

// 导出缓存控制函数
export function clearDecryptionCache(): void {
  fheDecryptionCache.clear();
  logInfo(' 解密缓存已清除');
}

export function getDecryptionCacheStats() {
  return fheDecryptionCache.getStats();
}

export function clearAllFHECaches(): void {
  fheEncryptionCache.clear();
  fheDecryptionCache.clear();
  logInfo(' 所有FHE缓存已清除');
} 

/**
 * 使用Zama最新标准解密消息块
 * 按照官方文档实现，使用客户端解密，无需支付gas
 * @param handles 消息块句柄数组
 * @param fhevmInstance Zama FHE实例
 * @param contractAddress 合约地址
 * @param walletClient 钱包客户端
 * @returns 解密结果
 */
export async function decryptChunksToMessage(
  handles: string[] | Uint8Array[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fhevmInstance: Record<string, any>,
  contractAddress: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: Record<string, any>
): Promise<{content: string; isComplete: boolean}> {
  try {
    logInfo(`开始高性能解密: ${handles.length} 个句柄...`);
    if (!handles || handles.length === 0) {
      throw new Error('没有提供可解密的句柄');
    }

    // 步骤0: 检查解密缓存
    const handleStrings = handles.map(h => h.toString());
    const cachedResult = fheDecryptionCache.getCached(handleStrings);
    if (cachedResult) {
      logInfo(' 解密缓存命中，直接返回结果');
      return cachedResult;
    }

    // 调试信息: 检查句柄格式
      logInfo(` 句柄类型: ${typeof handles[0]}, 句柄数量: ${handles.length}`);

    // 步骤1: 准备用户解密所需的数据
    logInfo(' 准备用户解密数据...');
    
    try {
      // 使用用户解密方式 - 根据Zama官方文档
      const keypair = fhevmInstance.generateKeypair();
      const handleContractPairs = handles.map((handle: string | Uint8Array) => ({
        handle: handle.toString(),
        contractAddress: contractAddress,
      }));
      
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = "10"; // 解密权限持续10天
      const contractAddresses = [contractAddress];

      // 创建EIP712签名数据
      const eip712 = fhevmInstance.createEIP712(
        keypair.publicKey, 
        contractAddresses, 
        startTimeStamp, 
        durationDays
      );

      logInfo(' 创建用户解密签名...');
      const signature = await walletClient.signTypedData({
        domain: eip712.domain,
        types: eip712.types,
        primaryType: eip712.primaryType,
        message: eip712.message,
        account: walletClient.account?.address,
      });

      logInfo(` 执行批量用户解密 (${handleContractPairs.length} 个句柄)...`);
      const startTime = performance.now();
      
      const userDecryptResult = await fhevmInstance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        contractAddresses,
        walletClient.account.address,
        startTimeStamp,
        durationDays
      );
      
      const endTime = performance.now();
      logInfo(` 批量解密完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);

      logInfo(' 用户解密成功');
      
      // 步骤2: 从结果中提取解密值
      const decryptedValues: bigint[] = [];
      let successCount = 0;
      
      for (const handle of handles) {
        const handleStr = handle.toString();
        const value = userDecryptResult[handleStr];
        if (value !== undefined) {
          decryptedValues.push(BigInt(value));
          successCount++;
          logDebug(`句柄解密成功: ${handleStr.substring(0, 8)}...`);
        } else {
          logWarn(`句柄解密失败: ${handleStr.substring(0, 8)}...`);
        }
      }
      
      logInfo(`解密结果统计: 成功 ${successCount}/${handles.length} 个`);
      
      if (decryptedValues.length === 0) {
        throw new Error('所有句柄解密都失败，请检查权限设置');
      }
      
      // 步骤3: 解析解密后的值为文本
      const content = parseDecryptedValues(decryptedValues);
      const userResult = { 
        content, 
        isComplete: successCount === handles.length 
      };
      
      // 缓存成功的解密结果
      if (successCount > 0) {
        fheDecryptionCache.setCached(handleStrings, userResult);
      }
      
      return userResult;
      
    } catch (userDecryptError) {
      logError('用户解密失败，尝试Gateway异步解密', userDecryptError);
      
      try {
        // 优先尝试Gateway异步解密（生产环境推荐）
        logInfo(' 尝试Gateway异步解密...');
        const decryptedResults = await fhevmInstance.awaitAllDecryptionResults(handles);
        
        if (decryptedResults && Object.keys(decryptedResults).length > 0) {
          logInfo(' Gateway异步解密成功');
          const decryptedValues: bigint[] = [];
          let successCount = 0;
          
          for (const handle of handles) {
            const handleStr = handle.toString();
            const value = decryptedResults[handleStr];
            if (value !== undefined) {
              decryptedValues.push(BigInt(value));
              successCount++;
            }
          }
          
          if (decryptedValues.length > 0) {
            const content = parseDecryptedValues(decryptedValues);
            const gatewayResult = { content, isComplete: successCount === handles.length };
            
            // 缓存Gateway解密结果
            fheDecryptionCache.setCached(handleStrings, gatewayResult);
            return gatewayResult;
          }
        }
      } catch (gatewayError) {
        logError('Gateway解密也失败，使用公共解密', gatewayError);
      }
      
      // Fallback: 尝试使用公共解密（如果Gateway解密失败）
      const decryptedResults = await fhevmInstance.publicDecrypt(handles);
      logInfo(' 公共解密成功获取结果字典');
      
      // 从结果字典中提取解密值
    const decryptedValues: bigint[] = [];
    let successCount = 0;
    
    for (const handle of handles) {
      const handleStr = handle.toString();
      const value = decryptedResults[handleStr];
      if (value !== undefined) {
        decryptedValues.push(value);
        successCount++;
        }
      }
    
    if (decryptedValues.length === 0) {
        throw new Error('解密失败：无法获取任何有效数据');
    }
    
    const content = parseDecryptedValues(decryptedValues);
    const publicResult = { 
      content, 
      isComplete: successCount === handles.length 
    };
    
    // 缓存公共解密结果
    if (successCount > 0) {
      fheDecryptionCache.setCached(handleStrings, publicResult);
    }
    
    return publicResult;
    }
    
  } catch (error: unknown) {
    logError('解密失败', error);
    
    // 提供更详细的错误信息
    const errorMessage = String(error);
    if (errorMessage.includes('not authorized') || errorMessage.includes('ACL')) {
      return { 
        content: '解密失败: 权限不足。您可能没有权限访问此消息，或者预授权已过期。', 
        isComplete: false 
      };
    }
    
    return { 
      content: '解密失败: ' + ((error as Error).message || errorMessage || '未知错误'), 
      isComplete: false 
    };
  }
} 