import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleDeleteUser } from './handler.ts';
Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const adminClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } });
    return await handleDeleteUser(req, userClient, adminClient);
  } catch {
    return new Response(JSON.stringify({ error: 'Account service unavailable. Refresh the user list before retrying.' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
  }
});
