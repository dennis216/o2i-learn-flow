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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== ZOMBIE DAILY POST STARTED ===');

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

    // Decide if we post today (50% chance for 0-1 posts)
    const shouldPost = Math.random() < 0.5;
    
    if (!shouldPost) {
      console.log('No post scheduled for today (random decision)');
      return new Response(
        JSON.stringify({ success: true, message: 'No post scheduled today', posted: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get a random zombie user (using profile id)
    const { data: zombieUsers, error: zombieError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_zombie', true);

    if (zombieError || !zombieUsers?.length) {
      console.error('No zombie users available:', zombieError);
      return new Response(
        JSON.stringify({ error: 'No zombie users available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const randomZombie = zombieUsers[Math.floor(Math.random() * zombieUsers.length)];
    console.log('Selected zombie user:', randomZombie.full_name, 'profile_id:', randomZombie.id);

    // Get a random topic that hasn't been used much
    const { data: topics, error: topicError } = await supabase
      .from('zombie_topics')
      .select('*')
      .order('used_count', { ascending: true })
      .limit(5);

    if (topicError || !topics?.length) {
      return new Response(
        JSON.stringify({ error: 'No topics available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    console.log('Selected topic:', randomTopic.title);

    // Create the forum post using profile_id (user_id will be null for zombie posts)
    // We need a valid user_id for the FK constraint, so we'll use a workaround:
    // Insert directly with profile_id and set user_id to a placeholder or handle it differently
    
    // First, let's check if there's at least one real user we can use as a "system" user
    // Or we make user_id nullable - let's check the constraint
    
    const { data: newPost, error: postError } = await supabase
      .from('forum_posts')
      .insert({
        user_id: randomZombie.id, // Use profile id as user_id (they're both UUIDs)
        profile_id: randomZombie.id,
        title: randomTopic.title,
        content: randomTopic.content,
        category: randomTopic.category,
        tags: randomTopic.tags
      })
      .select()
      .single();

    if (postError) {
      console.error('Error creating post:', postError);
      
      // If the error is FK violation, we need to handle it differently
      if (postError.code === '23503') {
        console.log('FK constraint violation - zombie profile id not valid as user_id');
        return new Response(
          JSON.stringify({ 
            error: 'Cannot create zombie post: FK constraint on user_id',
            hint: 'Need to make user_id nullable or create auth records for zombies'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: postError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update topic used count
    await supabase
      .from('zombie_topics')
      .update({ used_count: randomTopic.used_count + 1 })
      .eq('id', randomTopic.id);

    // Schedule 3-6 comments for this post over the next 3 days
    const numComments = Math.floor(Math.random() * 4) + 3;
    console.log(`Scheduling ${numComments} comments for the new post`);

    // Get available zombie users for commenting (exclude the poster)
    const { data: commenters } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_zombie', true)
      .neq('id', randomZombie.id);

    // Get random comments
    const { data: comments } = await supabase
      .from('zombie_comments')
      .select('*');

    if (commenters?.length && comments?.length) {
      const pendingComments = [];
      const now = new Date();
      
      for (let i = 0; i < numComments; i++) {
        const commenter = commenters[Math.floor(Math.random() * commenters.length)];
        const comment = comments[Math.floor(Math.random() * comments.length)];
        
        // Schedule randomly within 3 days using normal distribution
        const meanDelay = 1.5 * 24 * 60 * 60 * 1000;
        const stdDevDelay = 0.8 * 24 * 60 * 60 * 1000;
        let randomDelay = normalRandom(meanDelay, stdDevDelay);
        randomDelay = Math.max(60 * 60 * 1000, Math.min(3 * 24 * 60 * 60 * 1000, randomDelay));
        
        const scheduledTime = new Date(now.getTime() + randomDelay);
        
        pendingComments.push({
          post_id: newPost.id,
          zombie_user_id: commenter.id, // This is profile_id now
          comment_content: comment.content,
          scheduled_at: scheduledTime.toISOString()
        });
      }

      const { error: scheduleError } = await supabase
        .from('pending_zombie_comments')
        .insert(pendingComments);

      if (scheduleError) {
        console.error('Error scheduling comments:', scheduleError);
      } else {
        console.log(`Scheduled ${pendingComments.length} comments`);
      }
    }

    console.log('=== POST CREATED SUCCESSFULLY ===');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Post created successfully',
        posted: true,
        post: {
          id: newPost.id,
          title: newPost.title,
          author: randomZombie.full_name,
          scheduledComments: numComments
        }
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
