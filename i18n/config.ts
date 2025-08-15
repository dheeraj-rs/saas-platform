'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Base resources; extend by adding more locale JSON files under public/locales
import enCommon from '../public/locales/en/common.json';
import mlCommon from '../public/locales/ml/common.json';

const resources = {
  en: { common: enCommon },
  ml: { common: mlCommon },
} as const;

export const SUPPORTED_LOCALES = Object.keys(resources);
export const DEFAULT_LOCALE = 'en';

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  i18n.use(initReactI18next).init({
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  initialized = true;
  return i18n;
}

export default i18n;
