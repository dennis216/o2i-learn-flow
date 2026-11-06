// Synthetic auth and database only; this fixture never connects to Supabase.
import { createContext, useContext } from 'react';
export const FixtureAuth = createContext<Record<string, unknown>>({});
export const useAuth = () => useContext(FixtureAuth);
export const SUPABASE_URL = 'http://127.0.0.1:0';
const identity = { id: 'b0000000-0000-4000-8000-000000000001' };
const query = () => {
  const result = { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = { then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
  for (const name of ['select','eq','neq','in','or','order','range','limit','insert','update','delete']) chain[name] = () => chain;
  chain.single = chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return chain;
};
export const supabase = {
  auth: { getUser: async () => ({ data: { user: identity }, error: null }) },
  from: query,
  rpc: async (name: string) => ({ data: name === 'has_admin_module' ? true : [], error: null }),
};
