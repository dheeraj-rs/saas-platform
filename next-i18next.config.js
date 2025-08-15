module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
      'ar', 'he', 'hi', 'th', 'vi', 'pl', 'nl', 'sv', 'da', 'no', 'ml'
    ],
    localeDetection: false,
  },
  reloadOnPrerender: process.env.NODE_ENV === 'development',
};