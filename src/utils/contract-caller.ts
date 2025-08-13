// 合约调用工具

import { UNIFIED_CONFIG, ZAMA_CONTRACTS } from '../config/contracts';
import { logInfo, logError, logDebug, logWarn } from './unified-logger';

export async function getAndDecryptMessage(
  messageId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fhevmInstance: any,
  MESSAGING_ADDRESS: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CONTRACT_ABI: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authHelper: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  account: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any
): Promise<{ content: string; success: boolean; error?: string }> {
  try {
    logInfo(`开始简洁合约解密消息 ${messageId}...`);

    const contract = authHelper.getContract();

    logInfo(' 使用简洁合约获取消息句柄...');
    
    let messageHandles;
    try {

      messageHandles = await contract.getMessageHandles(messageId);
      logInfo(`获取到消息句柄数组，共${messageHandles.length}个块`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`无法获取消息句柄: ${msg}`);
    }

    if (!messageHandles || messageHandles.length === 0) {
      throw new Error('消息句柄数组为空');
    }


    const handles = Array.isArray(messageHandles) ? messageHandles : [messageHandles];


    logInfo(' 开始使用官方用户解密...');
    
    try {

      const keypair = fhevmInstance.generateKeypair();
      logInfo(' 密钥对生成成功');
      

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = "10";
      

      const { ethers } = await import('ethers');
      const businessContractAddress = ethers.getAddress(UNIFIED_CONFIG.CONTRACT_ADDRESS);
      const verifyingContractAddress = ethers.getAddress(ZAMA_CONTRACTS.verifyingContractAddressDecryption);
      

      const handleContractPairs = handles.map((handle: { toString: () => string }) => ({
        handle: handle.toString().startsWith('0x') ? handle.toString().substring(2) : handle.toString(),
        contractAddress: businessContractAddress,
      }));
      logDebug(`构造了 ${handleContractPairs.length} 个句柄-合约对`);
      

      const contractAddresses = [businessContractAddress];
      
      logDebug(' 业务合约地址 (存储数据):', businessContractAddress);
      logDebug(' 解密验证合约地址 (EIP712签名):', verifyingContractAddress);
      logDebug(' 网关链ID:', ZAMA_CONTRACTS.gatewayChainId);
      

      logInfo(' 创建EIP712签名数据...');
      const eip712 = fhevmInstance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      
      logDebug(' EIP712对象:', eip712);
      logDebug(' EIP712 domain:', eip712.domain);
      logDebug(' EIP712 types:', eip712.types);
      logDebug(' EIP712 message:', eip712.message);
      

      logDebug('创建EIP712签名...');
      const signature = await walletClient.signTypedData({
        domain: eip712.domain,
        types: eip712.types,
        primaryType: eip712.primaryType,
        message: eip712.message,
        account,
      });
      logInfo(' EIP712签名成功');


      logInfo(' 执行用户解密...');
      logDebug(' 检查fhevmInstance:', { type: typeof fhevmInstance, keys: Object.keys(fhevmInstance) });
      

      if (!fhevmInstance || typeof fhevmInstance.userDecrypt !== 'function') {
        logError(' 传入的 fhevmInstance 无效或缺少 userDecrypt 方法', { type: typeof fhevmInstance, keys: fhevmInstance ? Object.keys(fhevmInstance) : '实例为空' });
        throw new Error('无效的 FHE 实例：缺少 userDecrypt 方法');
      }

      logInfo(' 找到有效的 userDecrypt 函数');


      const allResults: Record<string, unknown> = {};
      

      const cleanSignature = signature.startsWith('0x') ? signature.replace("0x", "") : signature;
      

      logInfo(` 一次性解密 ${handleContractPairs.length} 个句柄...`);
      logDebug(' userDecrypt 参数');
      logDebug(' handleContractPairs', handleContractPairs);
      logDebug(' privateKey', keypair.privateKey.substring(0, 10) + '...');
      logDebug(' publicKey', keypair.publicKey.substring(0, 10) + '...');
      logDebug(' signature', cleanSignature.substring(0, 10) + '...');
      logDebug(' contractAddresses', contractAddresses);
      logDebug(' account', account);
      logDebug(' startTimeStamp', startTimeStamp);
      logDebug(' durationDays', durationDays);
      
      logDebug(' 开始用户解密...');
      
      try {

        const decryptResult = await fhevmInstance.userDecrypt(
          handleContractPairs,
          keypair.privateKey,
          keypair.publicKey,
          cleanSignature,
          contractAddresses,
          account,
          startTimeStamp,
          durationDays
        );
        Object.assign(allResults, decryptResult);
        logDebug(' 用户解密成功');
        
      } catch (userDecryptError) {
        logWarn(' 用户解密失败，尝试公共解密', userDecryptError);
        logInfo(' 降级到公共解密...');
        

        const handleStrings = handleContractPairs.map(pair => pair.handle);
        const publicDecryptResult = await fhevmInstance.publicDecrypt(handleStrings);
        Object.assign(allResults, publicDecryptResult);
        logDebug(' 公共解密成功');
      }
      
      const result = allResults;
      
      logInfo(' 用户解密成功，结果:', result);
      

      const resultKeys = Object.keys(result);
      logDebug(' 解密结果keys', resultKeys);
      
      const decryptedValues: Array<string | number | bigint> = [];
      
      for (const handle of handles) {
        const handleStr = handle.toString().toLowerCase();
        const handleWithoutPrefix = handleStr.startsWith('0x') ? handleStr.substring(2) : handleStr;
        
        logDebug(`[查找] 查找handle: ${handleStr} (无前缀: ${handleWithoutPrefix})`);
        

        const matchedKey = resultKeys.find(key => {
          const keyLower = key.toLowerCase();
          return keyLower.includes(handleWithoutPrefix) || keyLower.includes(handleStr);
        });
        
        if (matchedKey && result[matchedKey] !== undefined && result[matchedKey] !== null) {
          logDebug(`[成功] 找到匹配的key: ${matchedKey}, 值: ${result[matchedKey]}`);
          decryptedValues.push(result[matchedKey] as string | number | bigint);
        } else {
          logWarn(`[警告] 未找到handle ${handleStr} 对应的解密结果`);
        }
      }
      

      logInfo(' 解析打包的解密值...');
      const { parseDecryptedValues } = await import('./fhe-message-encryption');
      const decryptedMessage = parseDecryptedValues(decryptedValues);
      
      logInfo(' 解密成功！消息内容:', decryptedMessage);
      return {
        content: decryptedMessage,
        success: true
      };

    } catch (userDecryptError: unknown) {
      logError(' 用户解密失败:', userDecryptError);
      const msg = userDecryptError instanceof Error ? userDecryptError.message : String(userDecryptError);
      throw new Error(`用户解密失败: ${msg}`);
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(' 纯客户端解密失败:', msg);
    return {
      content: '',
      success: false,
      error: msg
    };
  }
}
