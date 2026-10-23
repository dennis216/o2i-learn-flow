import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, courseLocation, saveCourseTopic } from './courseContent.ts';
test('YouTube URL trust boundary and canonical identity', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk&t=5','https://youtube.com/watch?list=x&v=abcdefghijk','https://youtu.be/abcdefghijk?si=x','https://m.youtube.com/shorts/abcdefghijk','https://www.youtube.com/embed/abcdefghijk']) assert.equal(youtubeId(url),'abcdefghijk');
  for (const url of ['http://youtu.be/abcdefghijk','https://youtube.com.evil.org/watch?v=abcdefghijk','https://evil.org/abcdefghijk','javascript:alert(1)','https://user@youtube.com/watch?v=abcdefghijk','https://youtube.com/watch?v=short','https://youtu.be/abcdefghijk/extra','https://www.youtube.com/watch?v=abcdefghijk&v=12345678901']) assert.equal(youtubeId(url),null);
});
test('Course links preserve canonical identities',()=>assert.equal(courseLocation('course','topic'),'/courses?course=course&topic=topic'));

test('Save sends a canonical URL and refuses invalid videos before any write',async()=>{
  let call;
  const client={rpc:async(name,args)=>{call={name,args};return {error:null};}};
  await saveCourseTopic(client,'course','topic',false,[{id:'video',title:'Video',video_url:'https://youtu.be/abcdefghijk?t=9'}],null);
  assert.equal(call.args._videos[0].video_url,'https://www.youtube.com/watch?v=abcdefghijk');
  call=undefined;await assert.rejects(saveCourseTopic(client,'course','topic',false,[{title:'Video',video_url:'https://evil.org'}],null));assert.equal(call,undefined);
});

test('Revision-aware editing requires deployed metadata and passes server conflicts back to the editor',async()=>{
  let called=false;
  const missing={course_id:'course',topic_id:'topic',videos:[],is_published:false,game_path:null};
  const client={rpc:async(name,args)=>{called=true;assert.equal(name,'save_course_lesson');assert.equal(args._expected_revision,7);assert.equal(args._expected_lesson_id,'lesson');return {error:{message:'Lesson changed. Reload before saving.'}};}};
  await assert.rejects(saveCourseTopic(client,'course','topic',false,[],null,missing),/migration is required/);assert.equal(called,false);
  await assert.rejects(saveCourseTopic(client,'course','topic',false,[],null,{...missing,lesson_id:'lesson',revision:7,linked_courses:[]}),/Lesson changed/);assert.equal(called,true);
});

test('Custom outline boundary validates response and keeps stable lesson links',async()=>{
  const {loadCustomOutline,loadOutlineEntry,editOutline,entryLocation}=await import('./courseOutline.ts');
  const client={rpc:async(name,args)=>({error:null,data:name==='get_course_outline_v2'?{revision:3,units:[{topics:[{entry_id:'entry',cb_topics:[{id:'topic'}]}]}]}:name==='get_course_outline_entry'?{course_id:args._course_id,entry_id:args._entry_id,videos:[]}:args})};
  assert.equal((await loadCustomOutline(client,'course')).revision,3);
  assert.equal((await loadOutlineEntry(client,'course','entry')).entry_id,'entry');
  assert.equal((await editOutline(client,'course',3,'save',{title:'Limits'}))._expected_revision,3);
  assert.equal(entryLocation('course','entry','topic'),'/courses?course=course&lesson=entry&topic=topic');
  await assert.rejects(loadCustomOutline({rpc:async()=>({data:{revision:0,units:[{topics:[{}]}]},error:null})},'course'),/verify course outline/);
});
