import { useState, useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { AuthHelper } from '../utils/auth-helper';
import { authLogger } from '../utils/unified-logger';

export function useAuth() {
  const { address: account, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [fhevmInstance, setFhevmInstance] = useState<unknown | null>(null);
  const [userRequestedConnection, setUserRequestedConnection] = useState(false);
  const [reinitVersion, setReinitVersion] = useState(0);
  
  const authHelperRef = useRef<AuthHelper | null>(null);
  const initializingRef = useRef(false);

  const initializeAuth = async () => {
    if (!isConnected || !account || !walletClient || !publicClient || initializingRef.current) {
      authLogger.warn('钱包未连接或客户端未准备就绪');
      return false;
    }

    try {
      if (!window.ethereum || !window.fhevm) {
        authLogger.warn('等待 SDK 加载...');
        return false;
      }

      if (!authHelperRef.current?.isInitialized()) {
        initializingRef.current = true;
        setInitError(null);
        
        const authHelperInstance = new AuthHelper();
        await authHelperInstance.init();
        authHelperRef.current = authHelperInstance;
        
        const correctFhevmInstance = authHelperInstance.getFhevmInstance();
        setFhevmInstance(correctFhevmInstance);
        
        setIsInitialized(true);
        setUserRequestedConnection(true);
        initializingRef.current = false;
        
        authLogger.info('认证系统初始化成功');
        return true;
      }
      return true;
    } catch (error) {
      authLogger.error('AuthHelper初始化失败:', error);
      setInitError(String(error));
      setIsInitialized(false);
      initializingRef.current = false;
      return false;
    }
  };

  useEffect(() => {
    if (!isConnected) {
      setIsInitialized(false);
      setUserRequestedConnection(false);
      setInitError(null);
      setFhevmInstance(null);
      authHelperRef.current = null;
      initializingRef.current = false;

    }
  }, [isConnected]);

  useEffect(() => {
    if (account && authHelperRef.current) {
      const updateWithNewAccount = async () => {
        try {
          if (authHelperRef.current) {
            const ok = await authHelperRef.current.reinitWithNewAccount();
            if (ok) {
              setIsInitialized(true);
              setReinitVersion((v) => v + 1);
            }
          }
        } catch (error) {
          authLogger.error('更新钱包地址失败:', error);
          setInitError('更新钱包地址失败，请刷新页面重试');
        }
      };
      
      updateWithNewAccount();
    }
  }, [account]);

  return {
    isConnected,
    account,
    isInitialized,
    initError,
    fhevmInstance,
    authHelper: authHelperRef.current,
    publicClient,
    walletClient,
    userRequestedConnection,
    initializeAuth,
    reinitVersion
  };
} 