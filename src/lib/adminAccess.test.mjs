import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAdminAccess,canAccessAdminTab,defaultAdminTab,NO_ADMIN_ACCESS,ACCOUNT_ROLES} from './adminAccess.ts';
test('permissions fail closed and unknown tabs cannot mount',()=>{
 assert.deepEqual(parseAdminAccess({courses:1,questions:'true',users:true}),{...NO_ADMIN_ACCESS,users:true});
 assert.deepEqual(parseAdminAccess(null),NO_ADMIN_ACCESS);
 assert.equal(canAccessAdminTab({...NO_ADMIN_ACCESS,courses:true},'team'),false);
 assert.equal(canAccessAdminTab({...NO_ADMIN_ACCESS,questions:true},'course-content'),false);
 assert.equal(canAccessAdminTab({...NO_ADMIN_ACCESS,users:true},'unknown'),false);
});
test('scoped admin default pages and course-only nested entries',()=>{
 const course={...NO_ADMIN_ACCESS,courses:true,playground:true},question={...NO_ADMIN_ACCESS,questions:true,playground:true};
 assert.equal(defaultAdminTab(course),'manage-courses');assert.equal(defaultAdminTab(question),'question-bank');
 for(const tab of ['courses','course-content','videos','subjects','manage'])assert.equal(canAccessAdminTab(course,tab),true);
 assert.equal(ACCOUNT_ROLES.includes('instructor'),false);
});
