import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ScholarCounter = () => {
  const [count, setCount] = useState<number | null>(null);
  const [displayCount, setDisplayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchTotalUserCount = async () => {
      try {
        // Count ALL profiles (including zombie users for social proof)
        const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.error('Error fetching user count:', error);
          return;
        }

        setCount(count || 0);
      } catch (error) {
        console.error('Error fetching user count:', error);
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
        <div className="h-14 w-64 bg-muted rounded-full" />
        <div className="h-10 w-72 bg-muted rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      {/* Scholar Counter - Main Trust Badge */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 rounded-full px-8 py-4 border-2 border-primary/30 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <Users className="h-7 w-7 text-primary" />
        <span className="text-xl sm:text-2xl font-bold text-foreground">
          Join{' '}
          <span className="text-3xl sm:text-4xl font-extrabold text-primary tabular-nums">
            {displayCount.toLocaleString()}
          </span>{' '}
          Scholars
        </span>
      </div>

      {/* Expert Tutors Badge */}
      <Badge 
        variant="secondary" 
        className="flex items-center gap-2 px-5 py-3 text-base font-semibold bg-gradient-to-r from-accent/20 to-accent/10 border-2 border-accent/40 text-foreground hover:bg-accent/30 transition-colors duration-300"
      >
        <Award className="h-5 w-5 text-accent" />
        <span>10+ Expert Tutors</span>
        <span className="text-muted-foreground">•</span>
        <span className="text-sm font-medium text-muted-foreground">Euclid Honor Roll & AMC Top 1%</span>
      </Badge>
    </div>
  );
};

export default ScholarCounter;