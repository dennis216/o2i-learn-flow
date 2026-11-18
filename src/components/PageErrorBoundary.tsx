import { Component, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

export function PageError() {
  const { t } = useLanguage();
  return <div role="alert" className="mx-auto max-w-lg space-y-4 px-6 py-16 text-center">
    <h1 className="text-2xl">{t('This page could not be loaded', '页面暂时无法打开', 'No se pudo cargar esta página')}</h1>
    <p className="text-muted-foreground">{t('Reload to get the latest version. Your saved account data will remain available.', '请重新加载最新版本，你已保存的账号数据不会丢失。', 'Recarga la versión más reciente. Los datos guardados de tu cuenta se conservan.')}</p>
    <Button onClick={() => window.location.reload()}>{t('Reload page', '重新加载页面', 'Recargar página')}</Button>
  </div>;
}

export default class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PageError /> : this.props.children; }
}
