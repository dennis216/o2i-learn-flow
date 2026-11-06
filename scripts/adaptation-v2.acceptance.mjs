// Runs only inside the disposable student-practice test environment.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadPracticeAnalysis, loadAdminPracticeStatistics } from '../src/lib/practiceAnalysis.ts';
export async function verifyAdaptationV2({ db, fixture, topics, start, student, other, visitor, admin, rpc, safe, check, precheck, publish }) {
  const tid = code => topics.find(t => t.topic_code === code).id;
  const uid = (await student.auth.getUser()).data.user.id;
  const send = (s,q,seconds,correct=true,complete=true,trajectory) => rpc(student,'submit_question_practice_v2',{
    _session_id:s.id,_question_id:q.question_id,_option_id:q.options.find(o=>o.key===(correct?'A':'B')).id,
    _elapsed_seconds:seconds,_timing_complete:complete,
    _selection_trajectory:trajectory??[{option_id:q.options.find(o=>o.key===(correct?'A':'B')).id,elapsed_seconds:Math.floor(seconds/2)}],
  });
  const errors=[];for(let i=0;i<5;i++) errors.push(await fixture('3.1',true,'medium'));
  const wrong=await start(student,tid('3.1')), q=wrong.questions[0];
  const trace=[{option_id:q.options.find(o=>o.key==='A').id,elapsed_seconds:18},{option_id:q.options.find(o=>o.key==='B').id,elapsed_seconds:35}];
  const saved=await send(wrong,q,60,false,true,trace);
  assert.deepEqual(saved.questions[0].attempt.selection_trajectory,trace);assert.equal(saved.questions[0].attempt.timing_complete,true);
  const retry=await send(wrong,q,999,false,false,[{option_id:trace[1].option_id,elapsed_seconds:1}]);
  assert.deepEqual(retry.questions[0].attempt,saved.questions[0].attempt,'A retry cannot overwrite telemetry');
  await assert.rejects(send(wrong,q,60,true,true),/already saved/);
  const bad=wrong.questions[1];
  for(const payload of [null,[],{},[{option_id:bad.options[0].id,elapsed_seconds:0,untrusted:'extra'}],[{option_id:randomUUID(),elapsed_seconds:0}],[{option_id:bad.options[0].id,elapsed_seconds:80}],[{option_id:bad.options[1].id,elapsed_seconds:20},{option_id:bad.options[0].id,elapsed_seconds:10}],[{option_id:bad.options[0].id,elapsed_seconds:10},{option_id:bad.options[0].id,elapsed_seconds:11}],[{option_id:bad.options[1].id,elapsed_seconds:10}]]) {
    const result=await student.rpc('submit_question_practice_v2',{_session_id:wrong.id,_question_id:bad.question_id,_option_id:bad.options[0].id,_elapsed_seconds:60,_timing_complete:true,_selection_trajectory:payload});
    assert.ok(result.error,JSON.stringify(payload));
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM public.question_practice_attempts WHERE session_id=$1',[wrong.id])).rows[0].n,1);
  await assert.rejects(rpc(other,'submit_question_practice_v2',{_session_id:wrong.id,_question_id:bad.question_id,_option_id:bad.options[0].id}),/not issued/);
  safe(await start(other,tid('3.1')));
  check('Adaptation v2: full selection trajectory, server grading, frozen telemetry retries, invalid/foreign trajectories rejected and unsubmitted projection safe');

  for(let i=0;i<5;i++)await fixture('3.1',true,'medium');
  const reinforced=await start(student,tid('3.1'));
  assert.equal(reinforced.adaptation_summary.error_count,1);assert.equal(reinforced.adaptation_summary.slow_count,0);
  assert.ok(reinforced.questions.every(q=>q.topic.id===tid('3.1')));assert.ok(!reinforced.questions.some(x=>x.question_id===q.question_id));
  for(let i=0;i<5;i++)await fixture('3.2',true,'medium',{representation_type:'graphical'});
  const slow=await start(student,tid('3.2'));await send(slow,slow.questions[0],289);
  for(let i=0;i<5;i++)await fixture('3.2',true,'medium',{representation_type:'graphical'});
  for(let i=0;i<5;i++)await fixture('3.1',true,'medium');
  const quick=await start(student);
  assert.equal(quick.adaptation_summary.error_count,1);assert.equal(quick.adaptation_summary.slow_count,1);
  assert.equal(quick.adaptation_summary.items[0].kind,'error');assert.equal(quick.adaptation_summary.items[0].topic_code,'3.1');
  assert.equal(quick.adaptation_summary.items[1].kind,'slow');assert.equal(quick.adaptation_summary.items[1].topic_code,'3.2');
  assert.equal(quick.adaptation_summary.items.filter(i=>i.kind==='regular').length,3);
  assert.equal(new Set(quick.questions.map(q=>q.question_id)).size,5);safe(quick);
  assert.deepEqual(await rpc(student,'get_question_practice',{_session_id:quick.id}),quick);
  await start(student,tid('3.2'));
  const exhausted=await start(student,tid('3.2'));assert.equal(exhausted.adaptation_summary.slow_count,0);
  check('Adaptation v2: Topic isolation, Quick cross-Topic 1 error + 1 slow + 3 regular, unseen distinct alternatives, missing reinforcement fallback and immutable summary');

  for(const [code,difficulty,threshold] of [['3.3','easy',144],['3.4','medium',288],['3.5','hard',432]]) {
    await fixture(code,true,difficulty);
    let s=await start(student,tid(code));await send(s,s.questions[0],threshold);
    let a=await loadPracticeAnalysis(student,{});assert.ok(!a.signals.some(g=>g.topic_id===tid(code)));
    s=await start(student,tid(code));await send(s,s.questions[0],threshold+1);
    a=await loadPracticeAnalysis(student,{});assert.equal(a.signals.filter(g=>g.topic_id===tid(code)&&g.kind==='slow').length,1);
    s=await start(student,tid(code));await send(s,s.questions[0],threshold+100,true,false);
    a=await loadPracticeAnalysis(student,{});assert.ok(!a.signals.some(g=>g.topic_id===tid(code)),'Incomplete latest capture does not manufacture slow signals');
    s=await start(student,tid(code));await send(s,s.questions[0],threshold+1,false);
    a=await loadPracticeAnalysis(student,{});assert.equal(a.signals.filter(g=>g.topic_id===tid(code)&&g.kind==='error')[0].signal_count,1);
    assert.ok(!a.signals.some(g=>g.topic_id===tid(code)&&g.kind==='slow'));
    s=await start(student,tid(code));await send(s,s.questions[0],1);
    a=await loadPracticeAnalysis(student,{});assert.ok(!a.signals.some(g=>g.topic_id===tid(code)),'Latest correct fast answer resolves the signal');
  }
  check('Adaptation v2: exact 144/288/432 boundaries, correct-only slow signals, incomplete timing excluded, deduplication and latest-result resolution');

  const analysis=await loadPracticeAnalysis(student,{});
  const totals=(await db.query('SELECT count(*)::int n,count(DISTINCT question_id)::int distinct_n,count(*) FILTER(WHERE is_correct)::int correct,count(*) FILTER(WHERE timing_complete)::int timed,avg(elapsed_seconds) FILTER(WHERE timing_complete)::float avg FROM public.question_practice_attempts WHERE user_id=$1',[uid])).rows[0];
  assert.equal(analysis.totals.attempt_count,totals.n);assert.equal(analysis.totals.distinct_count,totals.distinct_n);assert.equal(analysis.totals.correct_count,totals.correct);assert.equal(analysis.totals.timing_count,totals.timed);assert.ok(Math.abs(analysis.totals.average_seconds-totals.avg)<1e-9);
  assert.equal(analysis.units.reduce((n,u)=>n+u.attempt_count,0),totals.n);
  assert.equal(analysis.topics.reduce((n,t)=>n+t.correct_count,0),totals.correct);
  await db.query("UPDATE public.question_practice_attempts SET submitted_at='2020-01-01T00:00:00Z' WHERE session_id=$1 AND question_id=$2",[wrong.id,q.question_id]);
  const bounded=await loadPracticeAnalysis(student,{_from:'2020-01-01T00:00:00Z',_to:'2020-01-01T00:00:01Z'});
  assert.equal(bounded.totals.attempt_count,1);assert.equal(bounded.totals.correct_count,0);
  assert.equal((await loadPracticeAnalysis(student,{_from:'2020-01-01T00:00:01Z',_to:'2020-01-01T00:00:02Z'})).totals.attempt_count,0);
  await assert.rejects(loadPracticeAnalysis(student,{_from:'2020-01-02T00:00:00Z',_to:'2020-01-01T00:00:00Z'}),/valid time period/);
  await assert.rejects(loadPracticeAnalysis(visitor,{}),/permission|Sign in/);
  await assert.rejects(loadAdminPracticeStatistics(student,q.question_id,undefined,{}),/Administrator/);
  await assert.rejects(loadAdminPracticeStatistics(visitor,q.question_id,undefined,{}),/permission|Sign in/);
  const stats=await loadAdminPracticeStatistics(admin,q.question_id,undefined,{});
  assert.equal(stats.attempt_count,1);assert.equal(stats.correct_count,0);assert.equal(stats.average_seconds,60);assert.equal(stats.median_seconds,60);assert.equal(stats.student_count,1);
  const otherAnalysis=await loadPracticeAnalysis(other,{});assert.ok(!otherAnalysis.signals.some(g=>g.topic_id===tid('3.1')));
  // Publish a new version; the current default must not mix the retained old-version attempt.
  const original=errors.find(x=>x.question_id===q.question_id), state=await precheck(original);
  const rev=await rpc(admin,'save_question_bank_revision',{_question_id:q.question_id,_source_version_id:q.version_id,_expected_fingerprint:state.fingerprint,_metadata:{difficulty:'hard',primary_topic_code:'3.1',practice_skill_codes:['1.A'],representation_type:'graphical',course_scope:'AB',calculator_policy:null,source_page:'1',source_locator:'p001-item01'}});
  await publish({question_id:q.question_id,version_id:rev.version_id??rev.id});
  assert.equal((await loadAdminPracticeStatistics(admin,q.question_id,undefined,{})).attempt_count,0);
  assert.equal((await loadAdminPracticeStatistics(admin,q.question_id,q.version_id,{})).attempt_count,1);
  await assert.rejects(loadAdminPracticeStatistics(admin,q.question_id,quick.questions[1].version_id,{}),/existing version/);
  assert.equal((await rpc(student,'get_question_practice',{_session_id:wrong.id})).questions[0].version_id,q.version_id);
  check('Adaptation v2: exact full-history/Unit/Topic aggregates, half-open date filters, legacy timing exclusion, account isolation, admin-only version-specific average/median and retained history');
  return {questionId:q.question_id,externalId:(await db.query('SELECT external_id FROM public.questions WHERE id=$1',[q.question_id])).rows[0].external_id};
}
