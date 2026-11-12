// Runs the Solution Requests migration against a disposable local PostgreSQL database.
// It drops and recreates the public, auth and storage schemas, so never point it at a shared database.
// SR_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/srtest npm run test:solution-requests:db
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const url = process.env.SR_TEST_DATABASE_URL;
assert.ok(url, 'Set SR_TEST_DATABASE_URL to a disposable local database.');
assert.match(url, /127\.0\.0\.1|localhost/, 'Refusing to run against a non-local database.');

const psql = sql => execFileSync('psql', [url, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const file = path => execFileSync('psql', [url, '-qX', '-v', 'ON_ERROR_STOP=1', '-f', new URL(path, import.meta.url).pathname], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const asRole = (role, uid, sql) => psql(`
  BEGIN;
  SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', true);
  SELECT set_config('request.jwt.claim.role', '${role}', true);
  SET LOCAL ROLE ${role};
  ${sql};
  COMMIT;`).split('\n').pop();
const call = (uid, sql) => {
  const out = asRole(uid ? 'authenticated' : 'anon', uid, `SELECT to_jsonb(r)->'x' FROM (SELECT ${sql} AS x) r`);
  return out === '' ? null : JSON.parse(out);
};
const refused = (uid, sql, pattern) => assert.throws(
  () => asRole(uid ? 'authenticated' : 'anon', uid, `SELECT ${sql}`), e => pattern.test(String(e.stderr)),
  `expected ${pattern} from ${sql}`);
const q = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const arr = values => `ARRAY[${values.map(q).join(',')}]::text[]`;

const alice = randomUUID(), bob = randomUUID(), cara = randomUUID();
const admins = { super_admin: randomUUID(), admin: randomUUID(), course_admin: randomUUID(), question_admin: randomUUID() };
const qa = admins.question_admin;
const users = { alice, bob, cara, ...admins };

psql('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;');
file('./fixtures/solution_requests_baseline.sql');
psql(`
  INSERT INTO auth.users(id) SELECT unnest(${arr(Object.values(users))}::uuid[]);
  INSERT INTO public.profiles(user_id, full_name) VALUES
    ('${alice}', 'Alice Real'), ('${bob}', 'Bob Real'), ('${cara}', 'Cara Real'),
    ('${admins.super_admin}', 'Sam Super'), ('${admins.admin}', 'Ada Admin'), ('${admins.course_admin}', 'Cody Course'), ('${qa}', 'Quinn Question');
  INSERT INTO public.user_roles(user_id, role) VALUES ('${alice}', 'student'), ('${bob}', 'student'), ('${cara}', 'student'),
    ('${admins.super_admin}', 'super_admin'), ('${admins.admin}', 'admin'), ('${admins.course_admin}', 'course_admin'), ('${qa}', 'question_admin');
  -- Rows written by the old frontend before the migration.
  INSERT INTO public.solution_requests(id, user_id, title, image_url, status, is_public, created_at) VALUES
    ('00000000-0000-0000-0000-00000000a001', '${alice}', 'Old public', 'https://x.supabase.co/storage/v1/object/public/solution-images/${alice}/old.png', 'pending', true, now() - interval '3 days'),
    ('00000000-0000-0000-0000-00000000a002', '${bob}', 'Old done', NULL, 'completed', NULL, now() - interval '3 days');
  INSERT INTO storage.objects(bucket_id, name) VALUES ('solution-images', '${alice}/old.png');
`);
file('../migrations/20261111000000_solution_request_threads.sql');

let imageCounter = 0;
// Uploads as the Storage API does: through the bucket policies, with the uploader recorded as owner_id.
const upload = owner => {
  const name = `r/${randomUUID()}.png`;
  asRole('authenticated', owner, `INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('solution-images', '${name}', '${owner}')`);
  imageCounter++;
  return name;
};
// Quota rows are cleared between scenarios so each test starts with a fresh daily limit.
const resetQuota = () => psql('DELETE FROM public.solution_request_quota');
const create = (uid, { title = 'Limit question', description = 'Why is this $0$?', type = 'calculus', images = [], pub = true, anon = true } = {}) =>
  call(uid, `public.sr_create(${q(title)}, ${q(description)}, ${q(type)}, ${arr(images)}, ${pub}, ${anon})`);
const reply = (uid, id, body, { image = null, anon = false, quote = null } = {}) =>
  call(uid, `public.sr_reply(${q(id)}, ${q(body)}, ${q(image)}, ${anon}, ${q(quote)})`);
const get = (uid, id) => call(uid, `public.sr_get(${q(id)})`);
const statusOf = id => psql(`SELECT status FROM public.solution_requests WHERE id = ${q(id)}`);

test('existing rows are migrated to the new status set and image paths', () => {
  assert.equal(statusOf('00000000-0000-0000-0000-00000000a001'), 'awaiting');
  assert.equal(statusOf('00000000-0000-0000-0000-00000000a002'), 'answered');
  assert.equal(psql(`SELECT is_public FROM public.solution_requests WHERE id = '00000000-0000-0000-0000-00000000a002'`), 'f');
  assert.equal(psql(`SELECT image_paths[1] FROM public.solution_requests WHERE id = '00000000-0000-0000-0000-00000000a001'`), `${alice}/old.png`);
});

test('every admin account type gets the answers module; students do not', () => {
  for (const [role, uid] of Object.entries(admins)) {
    assert.equal(call(uid, `public.has_admin_module('answers')`), true, role);
    assert.equal(call(uid, 'public.get_admin_access()').answers, true, role);
  }
  assert.equal(call(alice, `public.has_admin_module('answers')`), false);
  assert.equal(call(admins.course_admin, `public.has_admin_module('questions')`), false, 'other modules are unchanged');
  assert.equal(call(admins.admin, `public.has_admin_module('users')`), false, 'users stays Super Admin only');
});

test('the old frontend can still insert and read directly, but cannot set server fields or update', () => {
  resetQuota();
  const row = asRole('authenticated', alice, `INSERT INTO public.solution_requests(user_id, title, description, problem_type, is_public, image_url, status, solution_text)
    VALUES ('${alice}', 'Direct', 'old page', 'algebra', true, 'https://x.supabase.co/storage/v1/object/public/solution-images/${alice}/direct.png', 'completed', 'fake')
    RETURNING id`);
  assert.equal(psql(`SELECT status || '|' || coalesce(solution_text, 'null') || '|' || image_paths[1] || '|' || is_anonymous FROM public.solution_requests WHERE id = '${row}'`),
    `awaiting|null|${alice}/direct.png|true`);
  assert.match(asRole('authenticated', bob, `SELECT string_agg(title, ',') FROM public.solution_requests`), /Direct/);
  asRole('authenticated', alice, `UPDATE public.solution_requests SET status = 'solved', solution_text = 'mine' WHERE id = '${row}'`);
  assert.equal(statusOf(row), 'awaiting', 'direct updates are no longer allowed');
  assert.throws(() => asRole('authenticated', alice, `INSERT INTO public.solution_requests(user_id, title) VALUES ('${bob}', 'spoof')`), /row-level security/);
});

test('reply, report and quota tables are not readable or writable directly', () => {
  for (const uid of [null, alice, qa]) {
    for (const table of ['solution_request_replies', 'solution_request_reports', 'solution_request_quota']) {
      assert.throws(() => asRole(uid ? 'authenticated' : 'anon', uid, `SELECT count(*) FROM public.${table}`), /permission denied/);
    }
  }
  refused(null, `public.sr_create('t', '', 'other', '{}', true, true)`, /permission denied/);
  refused(null, `public.sr_reply('${randomUUID()}', 'x', NULL, false, NULL)`, /permission denied/);
  refused(alice, 'public.sr_admin_summary()', /SR_FORBIDDEN/);
  refused(alice, `public.sr_list('admin')`, /SR_FORBIDDEN/);
});

test('anonymous authors are hidden from students and visitors, not from answer admins', () => {
  resetQuota();
  const id = create(alice, { anon: true, images: [upload(alice)] });
  const bobReply = reply(bob, id, 'Try L\'Hôpital', { anon: true, image: upload(bob) });
  for (const viewer of [null, bob, cara]) {
    const thread = get(viewer, id);
    const listed = call(viewer, `public.sr_list('public')`).items.find(item => item.id === id);
    const text = JSON.stringify(thread) + JSON.stringify(listed);
    assert.ok(!text.includes(alice) && !text.includes(bob), 'no user ids are returned');
    assert.ok(!text.includes('Alice Real') && !text.includes('Bob Real'), 'no names of anonymous authors');
    assert.equal(thread.request.author.anonymous, true);
  }
  const named = reply(cara, id, 'Named reply', { anon: false });
  assert.equal(get(bob, id).replies.find(r => r.id === named).author.name, 'Cara Real');
  const asAdmin = get(qa, id);
  assert.equal(asAdmin.request.author.name, 'Alice Real');
  assert.equal(asAdmin.replies.find(r => r.id === bobReply).author.name, 'Bob Real');
  assert.equal(get(alice, id).request.author.is_mine, true);
});

test('status follows the thread: awaiting, replied, answered, solved', () => {
  resetQuota();
  const id = create(alice);
  assert.equal(statusOf(id), 'awaiting');
  reply(alice, id, 'More context from me');
  assert.equal(statusOf(id), 'awaiting', 'the author replying does not count');
  const fromBob = reply(bob, id, 'Factor first');
  assert.equal(statusOf(id), 'replied');
  const official = reply(qa, id, 'Official answer', { anon: true });
  assert.equal(statusOf(id), 'answered');
  const thread = get(bob, id);
  const o = thread.replies.find(r => r.id === official);
  assert.deepEqual([o.author.official, o.author.anonymous, o.author.name], [true, false, 'Quinn Question'], 'official replies are never anonymous');
  assert.deepEqual(thread.replies.map(r => r.floor), [1, 2, 3]);
  assert.equal(thread.replies[0].is_op, true);

  refused(bob, `public.sr_set_solved('${id}', true, NULL)`, /SR_FORBIDDEN/);
  call(alice, `public.sr_set_solved('${id}', true, '${fromBob}')`);
  assert.equal(statusOf(id), 'solved');
  assert.equal(get(cara, id).replies.find(r => r.id === fromBob).is_accepted, true);
  assert.equal(get(cara, id).request.is_closed, false, 'solving does not close');
  call(qa, `public.sr_set_solved('${id}', false, NULL)`);
  assert.equal(statusOf(id), 'answered');

  call(qa, `public.sr_hide_reply('${official}', true)`);
  assert.equal(statusOf(id), 'replied', 'a hidden official reply no longer counts');
  const hidden = get(bob, id).replies.find(r => r.id === official);
  assert.deepEqual([hidden.is_hidden, hidden.body], [true, null]);
  assert.equal(get(qa, id).replies.find(r => r.id === official).body, 'Official answer');
  refused(alice, `public.sr_hide_reply('${fromBob}', true)`, /SR_FORBIDDEN/);
});

test('closed threads take no replies until reopened; only author or admin can close', () => {
  resetQuota();
  const id = create(alice);
  refused(bob, `public.sr_set_closed('${id}', true)`, /SR_FORBIDDEN/);
  call(alice, `public.sr_set_closed('${id}', true)`);
  refused(bob, `public.sr_reply('${id}', 'late', NULL, false, NULL)`, /SR_CLOSED/);
  refused(qa, `public.sr_reply('${id}', 'late', NULL, false, NULL)`, /SR_CLOSED/);
  assert.equal(get(bob, id).request.can_reply, false);
  call(admins.course_admin, `public.sr_set_closed('${id}', false)`);
  assert.ok(reply(bob, id, 'now open'));
});

test('floors never renumber and quotes survive deletion as "missing"', () => {
  resetQuota();
  const id = create(alice);
  const one = reply(bob, id, 'first');
  const two = reply(cara, id, 'second', { quote: one });
  assert.deepEqual(get(alice, id).replies[1].quote, { floor: 1, excerpt: 'first', missing: false });
  refused(cara, `public.sr_delete_reply('${one}')`, /SR_FORBIDDEN/);
  call(bob, `public.sr_delete_reply('${one}')`);
  call(cara, `public.sr_delete_reply('${two}')`);
  const three = reply(bob, id, 'third');
  const thread = get(alice, id);
  assert.deepEqual(thread.replies.map(r => r.floor), [3]);
  assert.equal(thread.replies[0].id, three);
  const four = reply(cara, id, 'quoting', { quote: three });
  call(bob, `public.sr_delete_reply('${three}')`);
  assert.deepEqual(get(alice, id).replies.find(r => r.id === four).quote, { floor: 3, excerpt: null, missing: true });
  const other = create(bob);
  refused(cara, `public.sr_reply('${other}', 'x', NULL, false, '${four}')`, /SR_NOT_FOUND/);
});

test('editing marks content as edited; only authors edit', () => {
  resetQuota();
  const id = create(alice, { title: 'Before' });
  call(alice, `public.sr_update('${id}', 'Before', 'Why is this $0$?', 'calculus', '{}', true, false)`);
  assert.equal(get(bob, id).request.edited_at, null, 'visibility and anonymity changes are not edits');
  assert.equal(get(bob, id).request.author.name, 'Alice Real');
  call(alice, `public.sr_update('${id}', 'After', 'new', 'algebra', '{}', true, true)`);
  const req = get(bob, id).request;
  assert.deepEqual([req.title, req.problem_type, req.author.name], ['After', 'algebra', null]);
  assert.ok(req.edited_at);
  refused(bob, `public.sr_update('${id}', 'Hijack', '', 'other', '{}', true, true)`, /SR_FORBIDDEN/);
  const r = reply(bob, id, 'v1');
  refused(cara, `public.sr_edit_reply('${r}', 'x', NULL, NULL)`, /SR_FORBIDDEN/);
  call(bob, `public.sr_edit_reply('${r}', 'v2', NULL, NULL)`);
  const edited = get(alice, id).replies[0];
  assert.deepEqual([edited.body, Boolean(edited.edited_at)], ['v2', true]);
  refused(alice, `public.sr_update('${id}', '   ', '', 'other', '{}', true, true)`, /SR_REQUIRED/);
  refused(alice, `public.sr_update('${id}', '${'x'.repeat(121)}', '', 'other', '{}', true, true)`, /SR_TOO_LONG/);
});

test('admin-only questions are invisible to other students, also after switching from public', () => {
  resetQuota();
  const priv = create(alice, { pub: false });
  refused(bob, `public.sr_get('${priv}')`, /SR_NOT_FOUND/);
  refused(null, `public.sr_get('${priv}')`, /SR_NOT_FOUND/);
  refused(bob, `public.sr_reply('${priv}', 'x', NULL, false, NULL)`, /SR_NOT_FOUND/);
  assert.ok(!JSON.stringify(call(bob, `public.sr_list('public')`)).includes(priv));
  assert.ok(JSON.stringify(call(qa, `public.sr_list('admin', 'needs_answer')`)).includes(priv));
  assert.ok(reply(admins.admin, priv, 'Here is how'));

  const pub = create(alice, { pub: true });
  const fromBob = reply(bob, pub, 'public answer');
  call(alice, `public.sr_update('${pub}', 'Limit question', 'Why is this $0$?', 'calculus', '{}', false, true)`);
  refused(bob, `public.sr_get('${pub}')`, /SR_NOT_FOUND/);
  assert.equal(get(qa, pub).replies[0].id, fromBob, 'existing replies are kept');
  assert.equal(get(alice, pub).replies[0].body, 'public answer');
});

test('five questions per 24 hours, withdrawn ones still count, admins unlimited', () => {
  resetQuota();
  const ids = Array.from({ length: 5 }, () => create(cara));
  assert.deepEqual(call(cara, 'public.sr_quota()'), { limit: 5, used: 5, unlimited: false });
  refused(cara, `public.sr_create('sixth', '', 'other', '{}', true, true)`, /SR_DAILY_LIMIT/);
  call(cara, `public.sr_withdraw('${ids[0]}')`);
  refused(cara, `public.sr_create('sixth', '', 'other', '{}', true, true)`, /SR_DAILY_LIMIT/);
  assert.throws(() => asRole('authenticated', cara, `INSERT INTO public.solution_requests(user_id, title) VALUES ('${cara}', 'direct sixth')`), /SR_DAILY_LIMIT/);
  psql(`UPDATE public.solution_request_quota SET created_at = now() - interval '25 hours' WHERE user_id = '${cara}'`);
  assert.ok(create(cara));
  for (let i = 0; i < 7; i++) assert.ok(create(qa));
});

test('withdrawing deletes the whole thread and returns only the author\'s own files', () => {
  resetQuota();
  const img = upload(alice);
  const id = create(alice, { images: [img] });
  const bobImg = upload(bob);
  const r = reply(bob, id, 'with picture', { image: bobImg });
  const mine = upload(alice);
  reply(alice, id, 'my picture', { image: mine });
  call(bob, `public.sr_report('${id}', NULL, 'spam')`);
  call(alice, `public.sr_set_solved('${id}', true, '${r}')`);
  refused(bob, `public.sr_withdraw('${id}')`, /SR_FORBIDDEN/);
  const out = call(alice, `public.sr_withdraw('${id}')`);
  assert.deepEqual(out.removed_images.sort(), [img, mine].sort());
  assert.equal(psql(`SELECT count(*) FROM public.solution_requests WHERE id = '${id}'`), '0');
  assert.equal(psql(`SELECT count(*) FROM public.solution_request_replies WHERE request_id = '${id}'`), '0');
  assert.equal(psql(`SELECT count(*) FROM public.solution_request_reports WHERE request_id = '${id}'`), '0');
  refused(bob, `public.sr_get('${id}')`, /SR_NOT_FOUND/);
});

test('images: own folder only, existing upload only, visibility follows the thread', () => {
  resetQuota();
  const bobImg = upload(bob);
  refused(alice, `public.sr_create('t', '', 'other', ${arr([bobImg])}, true, true)`, /SR_IMAGE/);
  refused(alice, `public.sr_create('t', '', 'other', ${arr([`r/${randomUUID()}.png`])}, true, true)`, /SR_IMAGE/);
  assert.throws(() => asRole('authenticated', alice,
    `INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES ('solution-images', 'r/../${bob}/x.png', '${alice}')`), /row-level security/);
  assert.ok(create(alice, { images: [`${alice}/old.png`] }), 'older <user id>/ paths stay valid');
  const gone = upload(alice);
  const remove = uid => asRole('authenticated', uid, `WITH d AS (DELETE FROM storage.objects WHERE name = '${gone}' RETURNING 1) SELECT count(*) FROM d`);
  assert.equal(remove(bob), '0', 'others cannot delete');
  assert.equal(remove(alice), '1');
  refused(alice, `public.sr_create('t', '', 'other', ${arr([upload(alice), upload(alice), upload(alice), upload(alice)])}, true, true)`, /SR_IMAGE_COUNT/);
  const seen = (uid, name) => asRole(uid ? 'authenticated' : 'anon', uid,
    `SELECT count(*) FROM storage.objects WHERE bucket_id = 'solution-images' AND name = '${name}'`) === '1';

  const pubImg = upload(alice), privImg = upload(alice);
  const pub = create(alice, { images: [pubImg] });
  create(alice, { images: [privImg], pub: false });
  assert.deepEqual([seen(null, pubImg), seen(bob, pubImg), seen(bob, privImg), seen(alice, privImg), seen(qa, privImg)], [true, true, false, true, true]);

  const replyImg = upload(bob);
  const r = reply(bob, pub, '', { image: replyImg });
  assert.equal(seen(cara, replyImg), true);
  call(qa, `public.sr_hide_reply('${r}', true)`);
  assert.equal(seen(cara, replyImg), false, 'hidden reply images are not served');
  assert.equal(seen(qa, replyImg), true);
  refused(bob, `public.sr_reply('${pub}', '', NULL, false, NULL)`, /SR_REQUIRED/);
});

test('reports: once per person, not on own posts, resolved when hidden', () => {
  resetQuota();
  const id = create(alice);
  const r = reply(bob, id, 'rude');
  assert.equal(call(cara, `public.sr_report('${id}', '${r}', 'not kind')`).status, 'reported');
  assert.equal(call(cara, `public.sr_report('${id}', '${r}', 'again')`).status, 'already_reported');
  assert.equal(call(alice, `public.sr_report('${id}', '${r}', 'me too')`).status, 'reported');
  refused(bob, `public.sr_report('${id}', '${r}', 'self')`, /SR_INVALID/);
  assert.equal(call(cara, `public.sr_report('${id}', NULL, 'off topic')`).status, 'reported');
  const before = call(qa, 'public.sr_admin_summary()').open_reports;
  assert.ok(before >= 3);
  assert.equal(get(qa, id).reports.length, 3);
  assert.equal(get(bob, id).reports, null, 'students do not see reports');
  call(qa, `public.sr_hide_reply('${r}', true)`);
  assert.equal(call(qa, 'public.sr_admin_summary()').open_reports, before - 2);
  const left = call(qa, 'public.sr_list_reports()').find(x => x.request_id === id);
  call(qa, `public.sr_resolve_report('${left.id}')`);
  assert.equal(call(qa, 'public.sr_admin_summary()').open_reports, before - 3);
  call(qa, `public.sr_hide_request('${id}', true)`);
  refused(bob, `public.sr_get('${id}')`, /SR_NOT_FOUND/);
  assert.ok(get(alice, id), 'the author still sees a hidden question');
  assert.ok(!asRole('authenticated', bob, 'SELECT string_agg(id::text, \',\') FROM public.solution_requests')?.includes(id));
});

test('lists: scopes, filters, paging and the admin queue order', () => {
  resetQuota();
  psql('DELETE FROM public.solution_requests');
  const first = create(bob, { type: 'geometry' });
  const second = create(bob, { type: 'algebra', pub: false });
  const third = create(cara, { type: 'algebra' });
  reply(alice, third, 'activity');
  const pub = call(null, `public.sr_list('public')`);
  assert.deepEqual(pub.items.map(i => i.id), [third, first], 'public: latest activity first, no private rows');
  assert.deepEqual(call(bob, `public.sr_list('mine')`).items.map(i => i.id).sort(), [first, second].sort());
  refused(null, `public.sr_list('mine')`, /SR_AUTH/);
  assert.deepEqual(call(null, `public.sr_list('public', NULL, 'algebra')`).items.map(i => i.id), [third]);
  assert.deepEqual(call(null, `public.sr_list('public', 'replied')`).items.map(i => i.id), [third]);
  assert.deepEqual(call(qa, `public.sr_list('admin', 'needs_answer')`).items.map(i => i.id), [first, second, third], 'queue: oldest first');
  assert.deepEqual(call(qa, `public.sr_list('admin', NULL, NULL, true, 'private')`).items.map(i => i.id), [second]);
  const page = call(null, `public.sr_list('public', NULL, NULL, true, NULL, 0, 1)`);
  assert.deepEqual([page.items.length, page.has_more], [1, true]);
  assert.deepEqual(call(null, `public.sr_list('public', NULL, NULL, true, NULL, 1, 1)`).has_more, false);
  call(cara, `public.sr_set_closed('${third}', true)`);
  assert.deepEqual(call(null, `public.sr_list('public', NULL, NULL, false)`).items.map(i => i.id), [first]);
  refused(null, `public.sr_list('public', 'pending')`, /SR_INVALID/);
});

test('closing direct table access keeps every sr_* path working and stops id leaks', () => {
  resetQuota();
  file('../migrations/20261112000000_solution_requests_close_direct_access.sql');
  for (const uid of [null, alice]) {
    const role = uid ? 'authenticated' : 'anon';
    assert.throws(() => asRole(role, uid, 'SELECT user_id FROM public.solution_requests'), /permission denied/);
    assert.throws(() => asRole(role, uid, `INSERT INTO public.solution_requests(user_id, title) VALUES ('${alice}', 'direct')`), /permission denied/);
  }
  assert.throws(() => asRole('authenticated', alice, `UPDATE public.solution_requests SET title = 'x'`), /permission denied/);
  const img = upload(alice);
  const id = create(alice, { images: [img] });
  const r = reply(bob, id, 'still works');
  assert.equal(get(null, id).replies[0].id, r);
  assert.ok(call(null, `public.sr_list('public')`).items.some(item => item.id === id));
  assert.ok(call(alice, `public.sr_list('mine')`).items.some(item => item.id === id));
  assert.equal(asRole('anon', null, `SELECT count(*) FROM storage.objects WHERE name = '${img}'`), '1', 'public images still load');
  call(alice, `public.sr_set_solved('${id}', true, '${r}')`);
  assert.equal(statusOf(id), 'solved');
  assert.ok(call(alice, `public.sr_withdraw('${id}')`));
});
