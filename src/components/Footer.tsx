import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';

const links = [
  { to: '/courses', label: ['Courses', '课程'] },
  { to: '/practice', label: ['Practice', '练习'] },
  { to: '/solution-requests', label: ['Solution Requests', '答疑'] },
  { to: '/team', label: ['Team', '团队'] },
] as const;

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="space-y-2">
          <Link to="/" className="flex items-center gap-2">
            <img src="/o2i-logo.jpg" alt="" className="h-7 w-7 rounded-full object-cover" />
            <span className="font-bold text-primary">O2I Institute</span>
            <span className="text-sm font-medium text-muted-foreground">One to Infinity</span>
          </Link>
          <p className="text-sm text-muted-foreground">{t('Math courses, practice and tutor help, from 1 to ∞.', '数学课程、练习和老师答疑，从 1 到无穷。')}</p>
        </div>
        <nav aria-label={t('Footer', '页脚导航')} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="text-muted-foreground transition-colors hover:text-foreground">{t(link.label[0], link.label[1])}</Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:px-8">© {new Date().getFullYear()} O2I Institute</p>
      </div>
    </footer>
  );
}
