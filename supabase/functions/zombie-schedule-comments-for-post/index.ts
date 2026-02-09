import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_SECRET = Deno.env.get('ZOMBIE_USERS_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Box-Muller transform for normal distribution
function normalRandom(mean: number, stdDev: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

// This function is triggered when a new forum post is created (by anyone)
// It schedules 3-6 zombie comments over the next 3 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== SCHEDULE COMMENTS FOR POST STARTED ===');

    // Verify secret
    const url = new URL(req.url);
    const providedSecret = url.searchParams.get('secret');
    
    if (!API_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (providedSecret !== API_SECRET) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get post_id from request body
    const { post_id, exclude_profile_id } = await req.json();
    
    if (!post_id) {
      return new Response(
        JSON.stringify({ error: 'post_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scheduling comments for post:', post_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Check if comments are already scheduled for this post
    const { count: existingScheduled } = await supabase
      .from('pending_zombie_comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post_id);

    if ((existingScheduled || 0) > 0) {
      console.log(`Comments already scheduled for post ${post_id}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Comments already scheduled', scheduled: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get available zombie users for commenting (using profile id)
    let query = supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_zombie', true);

    if (exclude_profile_id) {
      query = query.neq('id', exclude_profile_id);
    }

    const { data: commenters, error: commenterError } = await query;

    if (commenterError || !commenters?.length) {
      console.log('No zombie users available for commenting');
      return new Response(
        JSON.stringify({ success: false, message: 'No zombie users available' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get random comments from the pool
    const { data: comments, error: commentError } = await supabase
      .from('zombie_comments')
      .select('*');

    if (commentError || !comments?.length) {
      console.log('No comment templates available');
      return new Response(
        JSON.stringify({ success: false, message: 'No comment templates available' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine number of comments (3-6)
    const numComments = Math.floor(Math.random() * 4) + 3;
    console.log(`Scheduling ${numComments} comments from ${commenters.length} zombie users`);

    const pendingComments = [];
    const now = new Date();
    const usedCommenters = new Set<string>();
    const usedComments = new Set<string>();

    for (let i = 0; i < numComments; i++) {
      // Try to get unique commenters
      let commenter;
      let attempts = 0;
      do {
        commenter = commenters[Math.floor(Math.random() * commenters.length)];
        attempts++;
      } while (usedCommenters.has(commenter.id) && attempts < 10 && commenters.length > numComments);
      
      usedCommenters.add(commenter.id);

      // Try to get unique comments
      let comment;
      attempts = 0;
      do {
        comment = comments[Math.floor(Math.random() * comments.length)];
        attempts++;
      } while (usedComments.has(comment.id) && attempts < 10 && comments.length > numComments);
      
      usedComments.add(comment.id);

      // Schedule using normal distribution (most comments within first 1.5 days)
      const meanDelay = 1.5 * 24 * 60 * 60 * 1000;
      const stdDevDelay = 0.8 * 24 * 60 * 60 * 1000;
      
      let randomDelay = normalRandom(meanDelay, stdDevDelay);
      randomDelay = Math.max(60 * 60 * 1000, Math.min(3 * 24 * 60 * 60 * 1000, randomDelay));
      
      const scheduledTime = new Date(now.getTime() + randomDelay);

      pendingComments.push({
        post_id,
        zombie_user_id: commenter.id, // This is profile_id
        comment_content: comment.content,
        scheduled_at: scheduledTime.toISOString()
      });
    }

    pendingComments.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const { error: insertError } = await supabase
      .from('pending_zombie_comments')
      .insert(pendingComments);

    if (insertError) {
      console.error('Error scheduling comments:', insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update comment used counts
    for (const commentId of usedComments) {
      const comment = comments.find(c => c.id === commentId);
      if (comment) {
        await supabase
          .from('zombie_comments')
          .update({ used_count: (comment.used_count || 0) + 1 })
          .eq('id', commentId);
      }
    }

    console.log(`=== SCHEDULED ${pendingComments.length} COMMENTS ===`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Scheduled ${pendingComments.length} comments`,
        scheduled: pendingComments.length,
        scheduledTimes: pendingComments.map(p => p.scheduled_at)
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
