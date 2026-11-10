import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">{t('Oops! Page not found', '抱歉，页面不存在')}</p>
        <a href="/" className="text-blue-500 underline hover:text-blue-700">
          {t('Return to Home', '返回首页')}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
