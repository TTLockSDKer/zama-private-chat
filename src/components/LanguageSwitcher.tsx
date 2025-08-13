import React from 'react';
import { useI18n } from '../utils/LanguageContext';

export const LanguageSwitcher: React.FC = () => {
  const { locale, setLocale } = useI18n();
  const isZh = locale === 'zh';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => setLocale('zh')}
        style={{
          padding: '6px 10px',
          background: isZh ? '#FFD400' : 'rgba(0,0,0,0.08)',
          color: isZh ? '#111' : '#333',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600
        }}
        title="中文"
      >
        中文
      </button>
      <button
        onClick={() => setLocale('en')}
        style={{
          padding: '6px 10px',
          background: !isZh ? '#FFD400' : 'rgba(0,0,0,0.08)',
          color: !isZh ? '#111' : '#333',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600
        }}
        title="English"
      >
        EN
      </button>
    </div>
  );
};


