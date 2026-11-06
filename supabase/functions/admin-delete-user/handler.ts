import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function handleDeleteUser(req: Request, userClient: SupabaseClient, adminClient: SupabaseClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'POST is required.' });
  if (!req.headers.get('Authorization')) return reply(401, { error: 'Missing authorization.' });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(401, { error: 'Invalid authorization.' });
  const { data: isSuper, error: roleError } = await userClient.rpc('is_super_admin', { _user_id: user.id });
  if (roleError || isSuper !== true) return reply(403, { error: 'Only Super Admin can delete accounts.' });
  let input;
  try { input = await req.json(); } catch { return reply(400, { error: 'Invalid JSON body.' }); }
  const { userId, action, email } = input ?? {};
  if (typeof userId !== 'string' || !uuid.test(userId) || !['preview', 'delete'].includes(action)) return reply(400, { error: 'Provide an account ID and preview or delete action.' });
  if (userId === user.id) return reply(403, { error: 'You cannot delete your own account.' });
  if (action === 'delete' && (typeof email !== 'string' || !email.trim())) return reply(400, { error: 'Type the target email address to confirm deletion.' });
  const { data: preview, error } = await userClient.rpc(action === 'preview' ? 'preview_user_deletion' : 'prepare_user_deletion', action === 'preview' ? { _user_id: userId } : { _user_id: userId, _email: email });
  if (error) return reply(error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409, { error: error.message });
  if (action === 'preview') return reply(200, preview);
  let deleteError: { message: string } | null;
  try { ({ error: deleteError } = await adminClient.auth.admin.deleteUser(userId, false)); }
  catch { deleteError = { message: 'Auth deletion response unavailable.' }; }
  if (deleteError) {
    // Remove the short-lived grant even when Auth rejects deletion; never report success on partial failure.
    const results = await Promise.allSettled([
      adminClient.from('admin_user_deletion_requests').delete().eq('target_user_id', userId),
      adminClient.from('admin_user_deletion_audit').insert({ actor_id: user.id, target_user_id: userId, target_email: preview.email, outcome: 'failed', details: { reason: deleteError.message } }),
    ]);
    const auditFailed = results.some(result => result.status === 'rejected' || result.value.error);
    return reply(409, { error: 'Account deletion failed. Refresh the preview before retrying.', auditFailed });
  }
  return reply(200, { success: true });
}
