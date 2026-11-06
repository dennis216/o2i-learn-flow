import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';
import { NO_ADMIN_ACCESS, parseAdminAccess, type AdminAccess } from './adminAccess.ts';

function missingRpc(error: { code?: string; message: string } | null, name: string): boolean {
  return error?.code === 'PGRST202' && error.message.includes(`public.${name}(`);
}

async function loadLegacyAccess(client: SupabaseClient<Database>, userId: string): Promise<AdminAccess> {
  const [owner, admin] = await Promise.all([
    client.rpc('is_super_admin', { _user_id: userId }),
    client.rpc('has_role', { _user_id: userId, _role: 'admin' }),
  ]);
  if (owner.error) throw new Error(owner.error.message);
  if (admin.error) throw new Error(admin.error.message);
  if (typeof owner.data !== 'boolean' || typeof admin.data !== 'boolean') throw new Error('Invalid administrator permission response');
  const content = owner.data || admin.data;
  return { courses: content, questions: content, playground: content, team: content, users: owner.data };
}

export async function loadAdminAccess(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client.rpc('get_admin_access');
  // Only a missing new RPC may use the old server-side checks; other failures must remain visible.
  if (missingRpc(error, 'get_admin_access')) return { access: await loadLegacyAccess(client, userId), legacy: true };
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || Object.keys(NO_ADMIN_ACCESS).some(key => typeof (data as Record<string, unknown>)[key] !== 'boolean')) {
    throw new Error('Invalid administrator permission response');
  }
  return { access: parseAdminAccess(data), legacy: false };
}

export async function hasAdminModule(client: SupabaseClient<Database>, module: keyof AdminAccess, userId: string): Promise<boolean> {
  const { data, error } = await client.rpc('has_admin_module', { _module: module });
  if (missingRpc(error, 'has_admin_module')) return (await loadLegacyAccess(client, userId))[module];
  if (error) throw new Error(`Could not verify administrator access: ${error.message}`);
  if (typeof data !== 'boolean') throw new Error('Invalid administrator permission response');
  return data;
}
