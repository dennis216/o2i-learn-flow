import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_SECRET = Deno.env.get('ZOMBIE_USERS_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== ZOMBIE COMMENT PROCESSOR STARTED ===');

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Get pending comments that are due (scheduled_at <= now)
    const now = new Date().toISOString();
    
    const { data: pendingComments, error: fetchError } = await supabase
      .from('pending_zombie_comments')
      .select('*')
      .eq('executed', false)
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('Error fetching pending comments:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingComments?.length) {
      console.log('No pending comments to process');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending comments', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${pendingComments.length} pending comments`);

    let processedCount = 0;
    const results = [];

    for (const pending of pendingComments) {
      // Check if post still exists
      const { data: post } = await supabase
        .from('forum_posts')
        .select('id')
        .eq('id', pending.post_id)
        .single();

      if (!post) {
        await supabase
          .from('pending_zombie_comments')
          .update({ executed: true })
          .eq('id', pending.id);
        continue;
      }

      // Check current comment count for this post
      const { count: currentComments } = await supabase
        .from('post_replies')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', pending.post_id);

      if ((currentComments || 0) >= 6) {
        console.log(`Post ${pending.post_id} already has ${currentComments} comments, skipping`);
        await supabase
          .from('pending_zombie_comments')
          .update({ executed: true })
          .eq('id', pending.id);
        continue;
      }

      // Create the comment using profile_id instead of user_id
      const { data: newReply, error: replyError } = await supabase
        .from('post_replies')
        .insert({
          post_id: pending.post_id,
          user_id: pending.zombie_user_id, // Using profile_id as user_id
          profile_id: pending.zombie_user_id,
          content: pending.comment_content
        })
        .select()
        .single();

      if (replyError) {
        console.error(`Error creating reply for post ${pending.post_id}:`, replyError);
        results.push({ pending_id: pending.id, success: false, error: replyError.message });
      } else {
        await supabase
          .from('pending_zombie_comments')
          .update({ executed: true })
          .eq('id', pending.id);
        
        processedCount++;
        results.push({ pending_id: pending.id, success: true, reply_id: newReply.id });
        console.log(`Created reply ${newReply.id} for post ${pending.post_id}`);
      }
    }

    console.log(`=== PROCESSED ${processedCount} COMMENTS ===`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processedCount} comments`,
        processed: processedCount,
        results 
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
