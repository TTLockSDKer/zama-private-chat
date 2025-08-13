import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { BankingService } from '../services/BankingService';
import { logInfo, logError } from '../utils/unified-logger';
import { useI18n } from '../utils/LanguageContext';

interface BankingModuleProps {
  isOpen: boolean;
  onClose: () => void;
  fheInstance: unknown;
}

type TabType = 'deposit' | 'withdraw' | 'balance';

export const BankingModule: React.FC<BankingModuleProps> = ({
  isOpen,
  onClose,
  fheInstance
}) => {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>('balance');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  
  const bankingService = new BankingService();
  const { t } = useI18n();


  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const queryBalance = async () => {
    if (!address || !fheInstance) {
      setError(t('please_connect_and_init_fhe', '请连接钱包并等待FHE初始化完成'));
      return;
    }

    setIsLoading(true);
    clearMessages();
    
    try {
      logInfo('开始查询余额...');
      const result = await bankingService.getBalance(address, fheInstance);
      
      if (result.success && result.balance) {
        setBalance(result.balance);
        setSuccess(`${t('query_balance_success', '余额查询成功')}: ${result.balance} ETH`);
        logInfo('余额查询完成');
      } else {
        throw new Error(result.error || '余额查询失败');
      }
    } catch (err: unknown) {
       const errorMsg = err instanceof Error ? err.message : t('query_balance_failed', '余额查询失败');
      setError(`${errorMsg}`);
      logError('余额查询失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async () => {
    if (!address || !amount) {
      setError(t('ensure_wallet_and_amount', '请确保钱包已连接并输入金额'));
      return;
    }

    const amountValue = parseFloat(amount);
    if (amountValue <= 0) {
      setError(t('enter_valid_deposit_amount', '请输入有效的存款金额'));
      return;
    }

    setIsLoading(true);
    clearMessages();

    try {
      logInfo('开始存款操作...');

      const result = await bankingService.deposit(
        amountValue.toString(),
        address
      );
      
      if (result.success) {
        setSuccess(`${t('deposit_success', '存款成功! 交易哈希')}: ${result.txHash?.substring(0, 10)}...`);
        setAmount('');
        logInfo('存款操作完成');
      } else {
        throw new Error(result.error || '存款操作失败');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('deposit_failed', '存款操作失败');
      setError(`${errorMsg}`);
      logError('存款操作失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const [withdrawStep, setWithdrawStep] = useState<'input' | 'pending' | 'success'>('input');
  const [withdrawRequestId, setWithdrawRequestId] = useState<number | null>(null);

  const handleWithdraw = async () => {
    if (!address || !fheInstance || !amount) {
      setError(t('ensure_wallet_fhe_amount', '请确保钱包已连接、FHE已初始化并输入金额'));
      return;
    }

    const amountValue = parseFloat(amount);
    if (amountValue <= 0) {
      setError(t('enter_valid_withdraw_amount', '请输入有效的取款金额'));
      return;
    }

    setIsLoading(true);
    clearMessages();
    setWithdrawStep('pending');

    try {
      logInfo('开始隐私提取流程...');
      const result = await bankingService.withdraw(
        amountValue.toString(),
        address,
        fheInstance
      );
      
      if (result.success && typeof result.requestId === 'number') {
        setWithdrawRequestId(result.requestId);
        setWithdrawStep('success');
        setSuccess(`${t('withdraw_request_created', '提取请求已创建')}! RequestID: ${result.requestId}。${t('withdraw_auto_tip', 'Zama系统将自动解密并转账，请稍后查看钱包余额。')}`);
        setAmount(''); // 清空输入
        logInfo(`提取请求创建成功，RequestID: ${result.requestId}`);
      } else {
        throw new Error(result.error || '创建提取请求失败');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('create_withdraw_failed', '创建提取请求失败');
      setError(`${errorMsg}`);
      setWithdrawStep('input');
      logError('创建提取请求失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const resetWithdrawFlow = () => {
    setWithdrawStep('input');
    setWithdrawRequestId(null);
    setAmount('');
    clearMessages();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        style={{
          position: 'relative',
          maxWidth: '480px',
          width: '90%',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 24px 20px 24px',
          borderBottom: '1px solid #f1f3f4',
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: '#1f2937',
            letterSpacing: '-0.025em'
          }}>
            {t('wallet_service', '钱包服务')}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#f3f4f6',
              color: '#6b7280',
              fontSize: '18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            ×
          </button>
        </div>

          <div style={{
          display: 'flex',
          backgroundColor: '#f9fafb',
          margin: '0 16px',
          borderRadius: '12px',
          padding: '4px',
          marginTop: '16px'
        }}>
                  {[
            { key: 'balance', label: t('tab_balance', '余额') },
            { key: 'deposit', label: t('tab_deposit', '存款') },
            { key: 'withdraw', label: t('tab_withdraw', '取款') }
        ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as TabType);
                clearMessages();
              }}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                backgroundColor: activeTab === tab.key ? 'white' : 'transparent',
                color: activeTab === tab.key ? '#1f2937' : '#6b7280',
                boxShadow: activeTab === tab.key ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px' }}>
          {!isConnected && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6b7280'
            }}>
              <div style={{
                fontSize: '16px',
                marginBottom: '16px',
                fontWeight: '600'
              }}>{t('please_connect_wallet', '请先连接钱包')}</div>
              <p style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '500',
                color: '#374151'
              }}>{t('please_connect_wallet', '请先连接钱包')}</p>
            </div>
          )}

          {isConnected && !fheInstance && (
              <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6b7280'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #e5e7eb',
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px auto'
              }}></div>
                <p style={{
                margin: 0,
                fontSize: '16px',
                fontWeight: '500',
                color: '#374151'
                }}>{t('initializing_fhe', '正在初始化FHE...（余额查询和取款需要）')}</p>
            </div>
          )}

          {isConnected && (
            <>
              {activeTab === 'balance' && !fheInstance && (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#6b7280'
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>{t('balance_need_fhe', '余额查询需要FHE初始化...')}</p>
                  <p style={{
                    margin: '8px 0 0 0',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>{t('wait_fhe', '请等待FHE加载完成')}</p>
                </div>
              )}

              {activeTab === 'withdraw' && !fheInstance && (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: '#6b7280'
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>{t('withdraw_need_fhe', '取款功能需要FHE初始化...')}</p>
                  <p style={{
                    margin: '8px 0 0 0',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>{t('wait_fhe', '请等待FHE加载完成')}</p>
                </div>
              )}

              {activeTab === 'balance' && Boolean(fheInstance) && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '12px',
                    padding: '32px 24px',
                    marginBottom: '24px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{
                      fontSize: '14px',
                      color: '#64748b',
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}>
                    {t('current_balance', '当前余额')}
                    </div>
                    <div style={{
                      fontSize: '32px',
                      fontWeight: '700',
                      color: '#1e293b',
                      letterSpacing: '-0.025em'
                    }}>
                      {balance ? `${balance} ETH` : t('click_to_query', '点击查询')}
                      </div>
                  </div>
                  
                  <button
                    onClick={queryBalance}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      backgroundColor: isLoading ? '#94a3b8' : '#FFD400',
                      color: isLoading ? 'white' : '#111',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: isLoading ? 0.7 : 1
                    }}
                    onMouseOver={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.backgroundColor = '#E6C200';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isLoading) {
                        e.currentTarget.style.backgroundColor = '#FFD400';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    {isLoading ? t('querying', '查询中...') : t('query_balance', '查询余额')}
                  </button>
                </div>
              )}

              {activeTab === 'withdraw' && Boolean(fheInstance) && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '15px',
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#475569'
                      }}>
                         {t('withdraw_flow', '提取流程')}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#64748b',
                        marginTop: '4px',
                        lineHeight: '1.4'
                      }}>
                         {t('auto_process_tip', '系统将自动处理解密和转账，无需额外操作')}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '15px'
                    }}>
                         {[
                         { key: 'input', label: t('step_input_amount', '1.输入金额') },
                         { key: 'pending', label: t('step_submit_request', '2.提交请求') },
                         { key: 'success', label: t('step_auto_process', '3.自动处理') }
                      ].map((step, index) => (
                        <div key={step.key} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: withdrawStep === step.key ? '#ef4444' : 
                                ['input', 'pending', 'success'].indexOf(withdrawStep) > index ? '#10b981' : '#94a3b8',
                          fontWeight: withdrawStep === step.key ? '600' : '400'
                        }}>
                          <span>{step.label}</span>
                          {index < 2 && <span style={{ margin: '0 4px', color: '#d1d5db' }}>→</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {withdrawStep === 'input' && (
                    <>
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '8px'
                        }}>
                           {t('withdraw_amount', '提取金额 (ETH)')}
                        </label>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="0.00"
                          style={{
                            width: '100%',
                            padding: '14px 16px',
                            border: '2px solid #e5e7eb',
                            borderRadius: '10px',
                            fontSize: '16px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            fontFamily: 'inherit'
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#ef4444';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e5e7eb';
                          }}
                        />
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '6px'
                        }}>
                           {t('amount_privacy_tip', '金额加密保护隐私，Zama系统将自动解密并转账到钱包')}
                        </div>
                      </div>

                      <button
                        onClick={handleWithdraw}
                        disabled={isLoading || !amount}
                        style={{
                          width: '100%',
                          padding: '14px 24px',
                          backgroundColor: (isLoading || !amount) ? '#94a3b8' : '#FFD400',
                          color: (isLoading || !amount) ? 'white' : '#111',
                          border: 'none',
                          borderRadius: '10px',
                          fontSize: '15px',
                          fontWeight: '600',
                          cursor: (isLoading || !amount) ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: (isLoading || !amount) ? 0.7 : 1
                        }}
                        onMouseOver={(e) => {
                          if (!isLoading && amount) {
                            e.currentTarget.style.backgroundColor = '#E6C200';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (!isLoading && amount) {
                            e.currentTarget.style.backgroundColor = '#FFD400';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                      >
                        {isLoading ? t('submitting', '提交请求中...') : t('submit_withdraw', '提交提取请求')}
                      </button>
                    </>
                  )}

                  {withdrawStep === 'pending' && (
                    <div style={{
                      textAlign: 'center',
                      padding: '40px 20px'
                    }}>

                      <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                         {t('submitting_withdraw', '正在提交提取请求...')}
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                         {t('submitting_wait', '请稍等，正在将加密请求提交到合约')}
                      </div>
                    </div>
                  )}

                  {withdrawStep === 'success' && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #22c55e',
                        borderRadius: '10px',
                        padding: '20px',
                        marginBottom: '20px'
                      }}>

                        <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                         {t('withdraw_submitted', '提取请求已成功提交！')}
                        </div>
                        {withdrawRequestId && (
                          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '15px' }}>
                            RequestID: {withdrawRequestId}
                          </div>
                        )}
                        <div style={{ fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                           {t('withdraw_auto_processing', 'Zama系统正在自动解密并处理您的提现请求。')}<br/>
                           {t('withdraw_funds_tip', '资金将在几分钟内自动转到您的钱包，完全无需手动操作。')}
                        </div>
                      </div>

                      <button
                        onClick={resetWithdrawFlow}
                        style={{
                          width: '100%',
                          padding: '14px 24px',
                          backgroundColor: '#FFD400',
                          color: '#111',
                          border: 'none',
                          borderRadius: '10px',
                          fontSize: '15px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#E6C200';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#FFD400';
                        }}
                      >
                         {t('new_withdraw', '进行新的提取')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'deposit' && (
                  <div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                       {t('deposit_amount', '存款金额 (ETH)')}
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        border: '2px solid #e5e7eb',
                        borderRadius: '10px',
                        fontSize: '16px',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        fontFamily: 'inherit'
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#10b981';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    />
                  </div>

                  <button
                    onClick={handleDeposit}
                    disabled={isLoading || !amount}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      backgroundColor: (isLoading || !amount) ? '#94a3b8' : '#FFD400',
                      color: (isLoading || !amount) ? 'white' : '#111',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: (isLoading || !amount) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: (isLoading || !amount) ? 0.7 : 1
                    }}
                    onMouseOver={(e) => {
                      if (!isLoading && amount) {
                        e.currentTarget.style.backgroundColor = '#E6C200';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isLoading && amount) {
                        e.currentTarget.style.backgroundColor = '#FFD400';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                  >
                    {isLoading ? t('depositing', '存款中...') : t('confirm_deposit', '确认存款')}
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{
              marginTop: '20px',
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              marginTop: '20px',
              padding: '12px 16px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#16a34a',
              fontSize: '14px'
            }}>
              {success}
            </div>
          )}
        </div>

        {isConnected && (
          <div style={{
            padding: '16px 24px 24px 24px',
            borderTop: '1px solid #f1f3f4',
            backgroundColor: '#fafbfc'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{t('fhe_protection', 'FHE加密保护')}</span>
              <span>{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}</span>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}; 