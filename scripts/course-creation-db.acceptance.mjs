import assert from 'node:assert/strict';
export function verifyManagedCreation({sql,asUser,admin,student}) {
 const details={title:'Managed AB',description:'Synthetic',level:'advanced',subject:'AP Calc',category:'High School',price:0,is_published:false};
 const call=(id,d,scope)=>asUser(id,`SELECT public.create_managed_course('${JSON.stringify(d).replaceAll("'","''")}','${scope}')`).trim().split('\n').at(-1);
 assert.throws(()=>call(student,details,'AB'));
 assert.throws(()=>call(admin,{...details,subject:'Missing'},'AB'));
 assert.throws(()=>call(admin,{...details,price:-1},'AB'));
 assert.throws(()=>call(admin,details,'BOTH'));
 const cid=call(admin,details,'AB');assert.equal(sql(`SELECT practice_course_scope FROM public.courses WHERE id='${cid}'`).trim(),'AB');
 assert.equal(sql(`SELECT count(*) FROM public.course_outline_entries WHERE course_id='${cid}'`).trim(),'2');
 assert.equal(sql(`SELECT is_published FROM public.courses WHERE id='${cid}'`).trim(),'f');
 console.log('PASS managed course creation: administrator boundary, existing subject, nonnegative price, AB/BC template, atomic complete outline and draft default');
}
