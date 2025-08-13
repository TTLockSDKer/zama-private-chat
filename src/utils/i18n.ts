import enMessages from '../locales/en.json'
import zhMessages from '../locales/zh.json'

type Locale = 'zh' | 'en'

type Messages = Record<string, string>

let currentLocale: Locale | null = null
const cache: Record<Locale, Messages> = { zh: {}, en: {} }

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  const saved = window.localStorage.getItem('app_locale')
  return saved === 'en' ? 'en' : 'zh'
}

function loadMessages(locale: Locale): Messages {
  try {
    return (locale === 'en' ? (enMessages as Messages) : (zhMessages as Messages))
  } catch {
    return {}
  }
}

function ensureLoaded(locale: Locale): void {
  if (!cache[locale] || Object.keys(cache[locale]).length === 0) {
    cache[locale] = loadMessages(locale)
  }
}

export function getLocale(): Locale {
  currentLocale = detectLocale()
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  if (typeof window !== 'undefined') window.localStorage.setItem('app_locale', locale)
  ensureLoaded(locale)
}

export function t(key: string, fallback = ''): string {
  const locale = getLocale()
  ensureLoaded(locale)
  const messages = cache[locale]
  return messages[key] ?? fallback ?? key
}

ensureLoaded(getLocale())

export type { Locale, Messages }


