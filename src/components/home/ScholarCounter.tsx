 import { useEffect, useState } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { Users } from 'lucide-react';
 
 const ScholarCounter = () => {
   const [count, setCount] = useState<number | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     const fetchRealUserCount = async () => {
       try {
         // Count profiles where is_zombie is false
         const { count, error } = await supabase
           .from('profiles')
           .select('*', { count: 'exact', head: true })
           .eq('is_zombie', false);
 
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
 
     fetchRealUserCount();
 
     // Subscribe to realtime changes on profiles table
     const channel = supabase
       .channel('profiles-count')
       .on(
         'postgres_changes',
         { event: '*', schema: 'public', table: 'profiles' },
         () => {
           // Refetch count when profiles change
           fetchRealUserCount();
         }
       )
       .subscribe();
 
     return () => {
       supabase.removeChannel(channel);
     };
   }, []);
 
   if (loading) {
     return (
       <div className="flex items-center justify-center gap-2 text-lg text-muted-foreground animate-pulse">
         <Users className="h-5 w-5" />
         <span>Loading scholars...</span>
       </div>
     );
   }
 
   return (
     <div className="flex items-center justify-center gap-3 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-full px-6 py-3 border border-primary/20 shadow-sm">
       <Users className="h-5 w-5 text-primary" />
       <span className="text-lg font-medium text-foreground">
         Join <span className="font-bold text-primary">{count?.toLocaleString()}</span> Scholars at O2I Institute
       </span>
     </div>
   );
 };
 
 export default ScholarCounter;