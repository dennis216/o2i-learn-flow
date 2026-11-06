import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeReviews } from './prepare-reviewed.mjs';
const fixture=()=>({input:{items:[{review_id:'opaque',display_overflow:[]}]},key:{items:[{review_id:'opaque',source_id:'synthetic',expected_correct_label:'C'}]},
 reviews:[{review_id:'opaque',correct_labels:['C'],conversion_matches:true,issues:[],publication_solution:'Synthetic independent solution',primary_topic_code:'1.1',practice_skill_codes:['1.A'],difficulty:'easy',course_scope:'BOTH',calculator_policy:'no_calculator',human_review_status:'pending'}],
 conversion:{snapshot_sha256:'a'.repeat(64),conversion_version:'v1',items:[{source_id:'synthetic',source_sha256:'b'.repeat(64),status:'converted_unreviewed',stem:'Synthetic $x$',solution:'Synthetic solution',options:['One','Two','Three','Four']}]},
 snapshot:{rows:[{source:{id:'synthetic',stem:'Synthetic',explanation:'Synthetic',options:['One','Two','Three','Four']},source_sha256:'b'.repeat(64)}],topics:[{id:'t',topic_code:'1.1',title:'Synthetic',is_bc_only:false}],skills:[{id:'s',skill_code:'1.A',description:'Synthetic'}]},batchId:'synthetic',base:'/private/tmp'});
test('blind match prepares pending drafts, preserves original option order and never promotes review claims',()=>{
 const f=fixture(),batch=mergeReviews(f);assert.equal(batch.questions.length,1);assert.equal(batch.questions[0].correct_option_key,'A');
 assert.equal(batch.questions[0].human_review_status,'pending');assert.deepEqual(batch.options.map(o=>o.option_text),['One','Two','Three','Four']);
 f.reviews[0].human_review_status='approved';assert.throws(()=>mergeReviews(f));
});
test('any ambiguity, mismatch, conversion doubt or overflow excludes the question; incomplete review stops',()=>{
 for(const mutate of [f=>f.reviews[0].issues=['Domain ambiguity'],f=>f.reviews[0].correct_labels=['B'],f=>f.reviews[0].conversion_matches=false,f=>f.input.items[0].display_overflow=['source'],f=>f.snapshot.rows[0].source.stem='<use href="#MJX-TEX-S3-7B"/>',f=>f.reviews[0].calculator_policy='calculator_required']){
  const f=fixture();mutate(f);const batch=mergeReviews(f);assert.equal(batch.questions.length,0);assert.equal(batch.excluded.length,1);
 }
 const f=fixture();f.reviews=[];assert.throws(()=>mergeReviews(f),/Incomplete/);
});
