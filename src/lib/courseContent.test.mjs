import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, courseLocation } from './courseContent.ts';
test('YouTube URL trust boundary and canonical identity', () => {
  for (const url of ['https://www.youtube.com/watch?v=abcdefghijk&t=5','https://youtube.com/watch?list=x&v=abcdefghijk','https://youtu.be/abcdefghijk?si=x','https://m.youtube.com/shorts/abcdefghijk','https://www.youtube.com/embed/abcdefghijk']) assert.equal(youtubeId(url),'abcdefghijk');
  for (const url of ['http://youtu.be/abcdefghijk','https://youtube.com.evil.org/watch?v=abcdefghijk','https://evil.org/abcdefghijk','javascript:alert(1)','https://user@youtube.com/watch?v=abcdefghijk','https://youtube.com/watch?v=short','https://youtu.be/abcdefghijk/extra']) assert.equal(youtubeId(url),null);
});
test('Course links preserve canonical identities',()=>assert.equal(courseLocation('course','topic'),'/courses?course=course&topic=topic'));
