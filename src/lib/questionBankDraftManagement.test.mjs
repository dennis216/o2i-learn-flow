import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { draftSnapshotSheets, draftSourcePage, validateDraftMetadata, loadQuestionBankDraft,
  updateQuestionBankDraft, deleteQuestionBankDraft } from './questionBankDraftManagement.ts';
import { applyQuestionFieldEdit, getQuestionEditChanges, revertQuestionEdits } from './questionBankPreviewEdits.ts';

const snapshot = () => ({question:{id:'q',external_id:'SYNTHETIC',status:'draft',current_version_id:null},
  version:{id:'v',question_id:'q',status:'draft',version_number:2,stem:'Synthetic \\(x^2\\)',solution:'Synthetic \\[2x\\]',
    difficulty:'easy',course_scope:'AB',calculator_policy:null,representation_type:'analytical',source_document:'SYNTHETIC.pdf',
    source_page:12,source_reference:'12-13',source_locator:'p012-item01',source_question_number:null,requires_figure:false,image_url:null,
    import_evidence:{human_review_status:'pending',ai_flags:['ANSWER_AI_INFERRED'],human_review_notes:'Original note',review_gates:{math_review_status:'pending'}}},
  options:[{id:'oa',option_key:'A',option_text:'Synthetic correct',is_correct:true,import_evidence:{option_explanation:'Original choice note'}},
    {id:'ob',option_key:'B',option_text:'Synthetic wrong',is_correct:false,import_evidence:{}}],
  topic_code:'1.1',skill_codes:['1.A'],fingerprint:'snapshot-token',delete_scope:'question'});
const refs={topics:[{id:'t1',topic_code:'1.1',title:'Synthetic'},{id:'t2',topic_code:'1.2',title:'Synthetic 2'}],
  skills:[{id:'s1',skill_code:'1.A',description:'Synthetic A'},{id:'s2',skill_code:'1.B',description:'Synthetic B'}],existingExternalIds:new Set(['SYNTHETIC'])};
const client = (data, error=null) => ({calls:[],async rpc(name,args){this.calls.push([name,args]);return {data,error};}});

test('saved source range round-trips while unrelated reference text is not mistaken for pages',()=>{
  assert.equal(draftSourcePage(snapshot().version),'12-13');
  assert.equal(draftSourcePage({source_page:12,source_reference:'14-15'}),'12');
  assert.equal(draftSourcePage({source_page:12,source_reference:'Source evidence'}),'12');
});
test('saved draft reuses intake validation; pending, notes, flags and own external ID do not block valid metadata',()=>{
  const sheets=draftSnapshotSheets(snapshot()), validated=validateDraftMetadata(sheets,refs);
  assert.equal(validated.plan.canSave,true,JSON.stringify(validated.plan.batchReasons));
  assert.equal(validated.report.questions[0].sourcePage,'12-13');
  assert.equal(validated.report.questions[0].humanReviewStatus,'pending');
  assert.deepEqual(validated.report.questions[0].aiFlags,['ANSWER_AI_INFERRED']);
  assert.equal(validated.report.questions[0].options[0].explanation,'Original choice note');
});
test('canonical errors, locator mismatch and unavailable references block save immediately',()=>{
  const original=draftSnapshotSheets(snapshot());
  for(const [field,value] of [['primary_topic_code','9.9'],['practice_skill_codes','9.Z'],['source_page','14'],['difficulty','fictional']]) {
    const result=validateDraftMetadata(applyQuestionFieldEdit(original,2,field,value),refs);
    assert.equal(result.plan.canSave,false,field);
  }
  assert.equal(validateDraftMetadata(original,null).plan.canSave,false);
});
test('save sends only eight final metadata fields with expected association-aware fingerprint, never client audit claims',async()=>{
  const s=snapshot(),c=client('v');let sheets=draftSnapshotSheets(s);
  for(const [field,value] of [['difficulty','hard'],['source_page','14-15'],['source_locator','p014-item02'],['practice_skill_codes','1.A|1.B']])
    sheets=applyQuestionFieldEdit(sheets,2,field,value);
  await updateQuestionBankDraft(c,s,sheets,refs);
  const [name,args]=c.calls[0];assert.equal(name,'update_question_bank_draft_metadata');
  assert.equal(args._expected_fingerprint,'snapshot-token');assert.equal(args._metadata.source_page,'14-15');
  assert.deepEqual(args._metadata.practice_skill_codes,['1.A','1.B']);
  assert.equal(Object.keys(args._metadata).length,8);assert.equal(args._metadata.import_evidence,undefined);
  assert.equal(args._metadata.stem,undefined);assert.equal(s.version.import_evidence.humanReviewStatus,undefined);
});
test('open, validation, undo and Cancel path cause no write calls; read errors are not fabricated snapshots',async()=>{
  const s=snapshot(),c=client(s);const loaded=await loadQuestionBankDraft(c,'q','v');
  const original=draftSnapshotSheets(loaded),changed=applyQuestionFieldEdit(original,2,'difficulty','hard');
  const undone=revertQuestionEdits(original,changed,2);assert.deepEqual(getQuestionEditChanges(original,undone),[]);
  validateDraftMetadata(undone,refs);assert.deepEqual(c.calls.map(x=>x[0]),['get_question_bank_draft']);
  await assert.rejects(loadQuestionBankDraft(client(null,{message:'permission denied'}),'q','v'),/permission denied/);
  const editor=readFileSync(new URL('../components/admin/QuestionBankDraftEditor.tsx',import.meta.url),'utf8');
  assert.match(editor,/onClick=\{onClose\}>Cancel/);assert.match(editor,/writing\.current/);
  assert.match(editor,/await loadQuestionBankDraft[\s\S]*Changes saved and read back/);
});
test('RPC failure retains input and never claims success; review target cannot save/delete directly',async()=>{
  const s=snapshot(),sheets=draftSnapshotSheets(s),before=structuredClone(sheets),c=client(null,{message:'Draft changed since it was opened'});
  await assert.rejects(updateQuestionBankDraft(c,s,sheets,refs),/not saved.*changed/);assert.deepEqual(sheets,before);
  s.version.status='review';const noCalls=client(null);
  await assert.rejects(updateQuestionBankDraft(noCalls,s,sheets,refs),/Resolve/);
  await assert.rejects(deleteQuestionBankDraft(noCalls,s),/Return/);assert.equal(noCalls.calls.length,0);
});
test('deletion sends explicit scope and exact IDs; malformed response never becomes success',async()=>{
  const s=snapshot(),c=client({question_id:'q',version_id:'v',deleted_question:true});await deleteQuestionBankDraft(c,s);
  assert.equal(c.calls[0][1]._delete_question,true);s.delete_scope='revision';
  const revisionClient=client({question_id:'q',version_id:'v',deleted_question:false});await deleteQuestionBankDraft(revisionClient,s);
  assert.equal(revisionClient.calls[0][1]._delete_question,false);
  await assert.rejects(deleteQuestionBankDraft(client({}),s),/could not be verified/);
});
test('both editor entrances use identical metadata controls, no publication or content editor is added',()=>{
  for(const file of ['QuestionBankPreview.tsx','QuestionBankDraftEditor.tsx']) {
    const source=readFileSync(new URL(`../components/admin/${file}`,import.meta.url),'utf8');
    assert.match(source,/<QuestionBankMetadataFields/);
  }
  const editor=readFileSync(new URL('../components/admin/QuestionBankDraftEditor.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(editor,/approve_question|create_question_revision|\.from\(/);
});
