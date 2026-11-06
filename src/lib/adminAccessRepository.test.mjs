import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminAccess, hasAdminModule } from './adminAccessRepository.ts';
import { NO_ADMIN_ACCESS } from './adminAccess.ts';
import { loadQuestionBankReferences } from './questionBankReferences.ts';
import { loadQuestionBankPage } from './questionBankDraftRepository.ts';

const absent = name => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}() in the schema cache` } });
function legacyClient(role) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: 'signed-in-user' } }, error: null }) }, rpc: async (name, args) => {
    calls.push([name, args]);
    if (['get_admin_access', 'has_admin_module'].includes(name)) return absent(name);
    assert.equal(args._user_id, 'signed-in-user');
    if (name === 'is_super_admin') return { data: role === 'super_admin', error: null };
    assert.equal(name, 'has_role'); assert.equal(args._role, 'admin');
    return { data: role === 'admin', error: null };
  } };
}

test('new permission response is authoritative, including denial and scoped roles', async () => {
  for (const access of [NO_ADMIN_ACCESS, { ...NO_ADMIN_ACCESS, courses: true, playground: true }]) {
    const client = { rpc: async name => { assert.equal(name, 'get_admin_access'); return { data: access, error: null }; } };
    assert.deepEqual(await loadAdminAccess(client, 'signed-in-user'), { access, legacy: false });
  }
  assert.equal(await hasAdminModule({ rpc: async () => ({ data: false, error: null }) }, 'questions', 'signed-in-user'), false);
});

test('missing new RPC uses current signed-in user server checks; only Super Admin gets Users', async () => {
  for (const role of ['super_admin', 'admin', 'student', 'instructor']) {
    const client = legacyClient(role);
    const content = ['super_admin', 'admin'].includes(role);
    assert.deepEqual(await loadAdminAccess(client, 'signed-in-user'), { access: { courses: content, questions: content, playground: content, team: content, users: role === 'super_admin' }, legacy: true });
    assert.equal(await hasAdminModule(client, 'questions', 'signed-in-user'), content);
    assert.equal(await hasAdminModule(client, 'users', 'signed-in-user'), role === 'super_admin');
  }
});

test('network, SQL, denied, wrong RPC and malformed responses never fall back', async () => {
  for (const error of [
    { code: 'PGRST202', message: 'Could not find the function public.other_rpc()' },
    { code: '42501', message: 'permission denied' },
    { code: 'PGRST301', message: 'JWT expired' },
    { message: 'network unavailable public.get_admin_access()' },
  ]) {
    const calls = [];
    const client = { rpc: async name => { calls.push(name); return { data: null, error }; } };
    await assert.rejects(loadAdminAccess(client, 'signed-in-user'));
    assert.deepEqual(calls, ['get_admin_access']);
    calls.length = 0;
    await assert.rejects(hasAdminModule(client, 'questions', 'signed-in-user'));
    assert.deepEqual(calls, ['has_admin_module']);
  }
  for (const data of [null, {}, { ...NO_ADMIN_ACCESS, users: 'true' }]) {
    await assert.rejects(loadAdminAccess({ rpc: async () => ({ data, error: null }) }, 'signed-in-user'), /Invalid/);
  }
  await assert.rejects(loadAdminAccess({ rpc: async () => { throw new Error('fetch failed'); } }, 'signed-in-user'), /fetch failed/);
});

test('failed or malformed legacy check cannot grant any permissions', async () => {
  for (const result of [{ data: null, error: { message: 'legacy failed' } }, { data: 'true', error: null }]) {
    const client = { rpc: async name => name === 'get_admin_access' ? absent(name) : result };
    await assert.rejects(loadAdminAccess(client, 'signed-in-user'));
  }
});

test('both question-bank readers work on old DB and still deny non-admins before SELECT', async () => {
  for (const load of [loadQuestionBankReferences, client => loadQuestionBankPage(client, 'drafts', 0)]) {
    const client = legacyClient('admin');
    let reads = 0;
    client.from = () => {
      reads++;
      const query = {};
      for (const name of ['select', 'order', 'range', 'neq', 'or', 'in']) query[name] = () => query;
      query.then = resolve => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
      return query;
    };
    await load(client); assert.ok(reads > 0);
    const student = legacyClient('student');
    student.from = () => { throw new Error('Forbidden SELECT'); };
    await assert.rejects(load(student), /Administrator access is required/);
  }
});
