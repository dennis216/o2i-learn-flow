import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';

const ScholarCounter = () => {
  const { t } = useLanguage();
  const [count, setCount] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchTotalUserCount = async () => {
      try {
        // Count ALL profiles (including zombie users for social proof)
        const { data: rpcCount, error: rpcError } = await supabase.rpc('count_all_profiles');

        console.log('[ScholarCounter] RPC result:', { rpcCount, rpcError });

        if (!rpcError && typeof rpcCount === 'number') {
          setCount(rpcCount);
          return;
        }

        if (rpcError) {
          console.warn('[ScholarCounter] count_all_profiles RPC failed, falling back to direct profile count:', rpcError);
        }

        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        console.log('[ScholarCounter] Fallback select count result:', { count, error });

        if (error) {
          console.error('[ScholarCounter] Error fetching user count fallback:', error);
          return;
        }

        setCount(count ?? 0);
      } catch (error) {
        console.error('[ScholarCounter] Error fetching user count:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTotalUserCount();

    const channel = supabase
      .channel('profiles-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchTotalUserCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Animated counter effect (odometer)
  useEffect(() => {
    if (count === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayCount(count);
      return;
    }

    const duration = 1800;
    const startTime = performance.now();
    const endValue = count;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const currentValue = Math.floor(endValue * easeOutQuart);
      
      setDisplayCount(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [count]);

  if (loading) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-pulse">
        {/* heights match the loaded badges so the buttons below don't jump */}
        <div className="h-[72px] sm:h-[77px] w-64 bg-muted rounded-full" />
        <div className="h-20 sm:h-[52px] w-72 max-w-full bg-muted rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      {/* Scholar Counter - Main Trust Badge; hidden if the count failed to load rather than showing "Join 0" */}
      {count !== null && <div className="flex items-center gap-3 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 rounded-full px-8 py-4 border-2 border-primary/30 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <Users className="h-7 w-7 text-primary" />
        <span className="text-xl sm:text-2xl font-bold text-foreground">
          {t('Join', '和')}{' '}
          <span className="text-3xl sm:text-4xl font-extrabold text-primary tabular-nums">
            {displayCount.toLocaleString()}
          </span>{' '}
          {t('Scholars', '名同学一起学')}
        </span>
      </div>}

      {/* Expert Tutors Badge */}
      <Badge 
        variant="secondary" 
        className="flex flex-wrap items-center justify-center gap-2 px-5 py-3 text-center text-base font-semibold bg-gradient-to-r from-accent/20 to-accent/10 border-2 border-accent/40 text-foreground hover:bg-accent/30 transition-colors duration-300"
      >
        <Award className="h-5 w-5 text-accent" />
        <span>{t('10+ Expert Tutors', '10+ 位资深导师')}</span>
        <span className="text-muted-foreground">•</span>
        <span className="text-sm font-medium text-muted-foreground">{t('Euclid Honor Roll & AMC Top 1%', 'Euclid 荣誉榜 & AMC 前 1%')}</span>
      </Badge>
    </div>
  );
};

export default ScholarCounter;
