import { useLanguage } from '@/contexts/LanguageContext';
export default function CloseLabel() {
  const { t } = useLanguage();
  return <span className="sr-only">{t('Close', '关闭', 'Cerrar')}</span>;
}
