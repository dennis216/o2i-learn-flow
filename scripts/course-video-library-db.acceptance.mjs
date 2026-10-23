import assert from 'node:assert/strict';
export function verifyCourseVideoLibrary({sql,asUser,admin,student,ab}) {
 const invoke=(uid,fn,args)=>asUser(uid,`SELECT public.${fn}(${args})`).trim().split('\n').at(-1);
 assert.throws(()=>invoke(student,'list_course_video_library',`'${ab}','all'`));
 const list=JSON.parse(invoke(admin,'list_course_video_library',`'${ab}','all'`));assert.ok(list.length>0);
 const video=list.find(v=>v.reference_count>0);assert.ok(video);assert.equal(video.metadata_revision,1);
 const details={title:'Library video',subtitle:'Unit 1',video_url:'https://youtu.be/abcdefghijk',order_index:0,transcript:[{s:0,t:'Hello'}],exam_tips:'Review limits',notes_url:null};
 const save=(uid,revision,data)=>invoke(uid,'save_course_video_metadata',`'${video.id}',${revision},'${JSON.stringify(data).replaceAll("'","''")}'`);
 assert.throws(()=>save(student,1,details));assert.throws(()=>save(admin,1,{...details,transcript:[{s:-1,t:'Bad'}]}));assert.throws(()=>save(admin,1,{...details,video_url:'https://evil.test/'}));
 const before=sql(`SELECT sum(l.revision) FROM public.course_lessons l JOIN public.course_lesson_videos m ON m.lesson_id=l.id WHERE m.video_id='${video.id}'`).trim();
 save(admin,1,details);assert.throws(()=>save(admin,1,details));
 const after=JSON.parse(invoke(admin,'list_course_video_library',`'${ab}','all'`)).find(v=>v.id===video.id);assert.equal(after.metadata_revision,2);assert.equal(after.transcript[0].t,'Hello');
 assert.notEqual(sql(`SELECT sum(l.revision) FROM public.course_lessons l JOIN public.course_lesson_videos m ON m.lesson_id=l.id WHERE m.video_id='${video.id}'`).trim(),before);
 assert.throws(()=>sql(`DELETE FROM public.course_videos WHERE id='${video.id}'`));
 console.log('PASS video library: administrator reads/writes, usage registry, transcript and URL boundary, optimistic metadata conflicts, content revision invalidation, referenced deletion guard');
}
