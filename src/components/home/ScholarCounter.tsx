import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

  // One quiet line on the blue hero: numbers in white, labels dimmed. The student count is left out if it failed to load.
  if (loading) return <div aria-hidden="true" className="h-9 w-72 max-w-full animate-pulse rounded-md bg-white/15" />;

  const stats = [
    ...(count !== null ? [{ value: displayCount.toLocaleString(), label: t('students', '名同学') }] : []),
    { value: '50+', label: t('experts', '位专家') },
  ];
  return (
    <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
      {stats.map(stat => (
        <div key={stat.label} className="flex items-baseline gap-2">
          <dd className="text-2xl font-bold tabular-nums sm:text-3xl">{stat.value}</dd>
          <dt className="text-base text-primary-foreground/75">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
};

export default ScholarCounter;
