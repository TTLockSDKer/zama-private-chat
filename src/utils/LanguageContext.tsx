import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Locale = 'zh' | 'en';

type Messages = Record<string, string>;

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function loadMessages(locale: Locale): Messages {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const msgs = locale === 'en' ? require('../locales/en.json') : require('../locales/zh.json');
    return msgs as Messages;
  } catch {
    return {} as Messages;
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('zh');
  const [messages, setMessages] = useState<Messages>(() => loadMessages('zh'));

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('app_locale')) as Locale | null;
    if (saved === 'en' || saved === 'zh') {
      setLocaleState(saved);
      setMessages(loadMessages(saved));
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem('app_locale', l);
    setMessages(loadMessages(l));
  };

  const t = useMemo(() => {
    return (key: string, fallback = ''): string => {
      if (!key) return fallback;
      return messages[key] ?? fallback ?? key;
    };
  }, [messages]);

  const value = useMemo<LanguageContextValue>(() => ({ locale, setLocale, t }), [locale, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider');
  return ctx;
}


