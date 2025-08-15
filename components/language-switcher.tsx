'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const current = i18n.language || i18n.resolvedLanguage || 'en';

  const onChange = async (lng: string) => {
    if (!lng || lng === current) return;
    await i18n.changeLanguage(lng);
  };

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue placeholder="Lang" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((lng) => (
          <SelectItem key={lng} value={lng}>
            {lng.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
