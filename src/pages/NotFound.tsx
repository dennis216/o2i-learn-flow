import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import PixelOwl from "@/components/PixelOwl";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center break-keep px-4 py-16 text-center [overflow-wrap:anywhere]">
      <PixelOwl scale={5} className="mb-8" />
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("This page doesn't exist", '这个页面不存在')}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t('The link may be old or mistyped. Dr. Owler looked everywhere.', '链接可能过期了，或者地址输错了。欧鸮博士到处都找过了。')}</p>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <Button size="lg" asChild><Link to="/">{t('Back to home', '回到首页')}</Link></Button>
        <Button size="lg" variant="outline" asChild><Link to="/courses">{t('Browse courses', '浏览课程')}</Link></Button>
      </div>
    </main>
  );
};

export default NotFound;
