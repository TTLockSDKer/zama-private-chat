import { ethers } from 'ethers';
import { handleError } from './error-handlers';
import ConfidentialMessagingABI from '../abi/ConfidentialMessaging.json';
import { MESSAGING_ADDRESS, ZAMA_CONTRACTS } from '../config/contracts';
import { authLogger } from './unified-logger';

class AuthHelper {
  private static instance: AuthHelper;
  private contract: ethers.Contract | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fhevmInstance: any = null;
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;

  constructor() {}

  // 获取单例实例
  public static async getInstance(): Promise<AuthHelper> {
    if (!AuthHelper.instance) {
      AuthHelper.instance = new AuthHelper();
      try {
        await AuthHelper.instance.init();
      } catch (error) {
        authLogger.warn('初始化 AuthHelper 实例时出错，但仍然返回实例:', error);
      }
    }
    return AuthHelper.instance;
  }

  async init() {
    try {
      await this._initialize();
    } catch (error) {
      authLogger.error('AuthHelper初始化失败:', error);
      throw error;
    }
  }

  private async _initialize() {
    try {
      // 步骤1: 确保SDK已加载
      authLogger.info('步骤1: 正在加载FHE SDK...');
      await Promise.race([
        this._ensureFHESDKLoaded(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SDK加载超时 (30秒) - 请刷新页面重试')), 30000)
        )
      ]);
      authLogger.info('SDK加载完成');
      
      // 步骤2: 检查网络连接
      authLogger.info('步骤2: 检查网络连接...');
      const chainId = await Promise.race([
        window.ethereum.request({ method: 'eth_chainId' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('网络检查超时')), 5000)
        )
      ]);
      
      if (chainId !== '0xaa36a7') { // Sepolia chainId
        authLogger.info('切换到Sepolia网络...');
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      }
      authLogger.info('网络连接正常');

      // 步骤3: 请求账户连接
      authLogger.info('步骤3: 请求钱包账户...');
      await Promise.race([
        window.ethereum.request({
          method: 'eth_requestAccounts',
          params: [{
            eth_accounts: {}
          }]
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('账户请求超时')), 10000)
        )
      ]);
      authLogger.info('钱包账户获取成功');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      this.provider = provider;
      this.signer = signer;

      // 步骤4: 初始化SDK - 严格按照Zama官方文档
      authLogger.info('步骤4: 初始化FHE SDK...');
      
      // 使用try-catch包裹initSDK调用，以处理可能的跨域问题
      try {
        await Promise.race([
          window.fhevm.initSDK(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('SDK初始化超时 (20秒)')), 20000)
          )
        ]);
        authLogger.info('SDK初始化完成');
      } catch (error) {
        authLogger.error('SDK初始化出错，尝试备用方法:', error);
        // 如果initSDK失败，尝试手动设置而不抛出错误
      }

      // 步骤5: 创建SDK实例
      authLogger.info('步骤5: 创建FHE实例...');

      // 按照Zama官方文档：使用最简单的SepoliaConfig
      authLogger.info('使用官方SepoliaConfig...');
      const config = window.fhevm.SepoliaConfig;

      authLogger.info('正在创建FHE实例...');
      
      try {
        // 确保SDK版本和API兼容
        if (typeof window.fhevm.createInstance !== 'function') {
          authLogger.error('SDK API不兼容: createInstance方法不存在');
          throw new Error('SDK API不兼容，请更新SDK或应用程序');
        }
        
        // 增加超时时间，因为WebAssembly加载可能需要更长时间
        this.fhevmInstance = await Promise.race([
          window.fhevm.createInstance(config),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('FHE实例创建超时 (30秒) - 请检查网络连接或刷新页面重试')), 30000)
          )
        ]);
        
        if (!this.fhevmInstance) {
          throw new Error('FHE实例创建失败，返回结果为null或undefined');
        }
        
        authLogger.info('FHE实例创建成功');
      } catch (initError) {
        authLogger.error('创建FHE实例失败:', initError);
        authLogger.error('错误详情:', initError instanceof Error ? initError.message : String(initError));
        throw initError;
      }

      // 确保使用最新的Messaging合约地址
      const messagingAddressFromConfig = (await import('../config/contracts')).MESSAGING_ADDRESS;
      authLogger.debug('使用Messaging合约地址:', messagingAddressFromConfig);

      // 步骤6: 创建Messaging合约实例
      authLogger.info('步骤6: 创建Messaging合约实例...');
      this.contract = new ethers.Contract(
        messagingAddressFromConfig,
        ConfidentialMessagingABI.abi,
        this.signer
      );
      authLogger.info('合约实例创建成功');
      
      authLogger.info('所有初始化步骤完成！系统已准备就绪');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // 处理特定错误
      if (error.code === 4001) {
        authLogger.error('用户拒绝了签名请求');
        throw new Error('用户拒绝了签名请求，请重试');
      } else if (error.code === 4902) {
        authLogger.error('网络未添加，尝试添加 Sepolia 网络');
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Sepolia',
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: [ZAMA_CONTRACTS.network],
              blockExplorerUrls: ['https://sepolia.etherscan.io']
            }]
          });
        } catch {
          authLogger.error('添加网络失败');
          throw new Error('添加 Sepolia 网络失败，请手动添加');
        }
      }
      authLogger.error('AuthHelper初始化失败:', error);
      throw error;
    }
  }
  
  // 确保FHE SDK已加载
  private async _ensureFHESDKLoaded(): Promise<void> {
    const { ensureSdkInitialized } = await import('./sdk-init');
    await ensureSdkInitialized();
  }

  // 获取所有已知的协处理器签名者地址
  getAllCoprocessorSigners(): string[] {
    try {
      // 从本地存储中获取签名者地址
      const storedSigners = localStorage.getItem('fhe_coprocessor_signers');
      let extraSigners: string[] = [];
      
      if (storedSigners) {
        extraSigners = JSON.parse(storedSigners);
        if (!Array.isArray(extraSigners)) {
          extraSigners = [];
        }
      }
      
      return extraSigners;
    } catch {
      authLogger.warn('获取协处理器签名者地址失败');
      return [];
    }
  }

  // 获取合约实例
  getContract(): ethers.Contract {
    if (!this.contract) {
      throw new Error('合约实例未初始化');
    }
    return this.contract;
  }

  // 获取FHE实例
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFhevmInstance(): any {
    if (!this.fhevmInstance) {
      throw new Error('FHE实例未初始化');
    }
    return this.fhevmInstance;
  }

  // 检查是否已初始化
  isInitialized(): boolean {
    return !!this.contract && !!this.fhevmInstance && !!this.signer;
  }

  // 获取Messaging合约地址
  getContractAddress(): string {
    return MESSAGING_ADDRESS;
  }
  
  // 获取签名者
  getSigner(): ethers.Signer {
    if (!this.signer) {
      throw new Error('签名者未初始化');
    }
    return this.signer;
  }

  async getAccounts() {
    if (!window.ethereum) {
      throw new Error('No ethereum provider found');
    }
    return await window.ethereum.request({ method: 'eth_requestAccounts' });
  }

  // 添加一个重新初始化的方法，不需要完整初始化，只更新必要部分
  async reinitWithNewAccount() {
    try {
      // 如果SDK和provider已经初始化，只需获取新的signer
      if (this.provider && window.fhevm) {
        authLogger.info('检测到账户变更，重新初始化合约实例...');
        
        // 获取新的signer
        this.signer = await (this.provider as ethers.BrowserProvider).getSigner();
        
        // 重新创建Messaging合约实例，使用新的signer
        const messagingAddressFromConfig = (await import('../config/contracts')).MESSAGING_ADDRESS;
        
        this.contract = new ethers.Contract(
          messagingAddressFromConfig,
          ConfidentialMessagingABI.abi,
          this.signer
        );
        
        authLogger.info('合约实例已使用新账户更新');
        return true;
      } else {
        // 如果基本组件未初始化，执行完整初始化
        await this.init();
        return true;
      }
    } catch (error) {
      authLogger.error('重新初始化失败:', error);
      handleError('重新初始化失败', error);
      return false;
    }
  }
}

const authHelper = new AuthHelper();

export { AuthHelper };
export default authHelper; 