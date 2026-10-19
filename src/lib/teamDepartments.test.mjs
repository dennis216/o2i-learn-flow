import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_GROUPS, TEAM_DEPARTMENTS, TEAM_ROLES, groupTeamMembers, normalizeTeamMember, loadTeamMembers } from './teamDepartments.ts';

test('team structure exposes only the approved roles, departments and curriculum groups', () => {
  assert.deepEqual(TEAM_ROLES, ['Founder', 'Co-founder', 'Team Leader', 'Team Member', 'Website Developer']);
  assert.deepEqual(TEAM_DEPARTMENTS, ['Publicity & Marketing', 'Web Development & Management', 'Curriculum Content & Media Production']);
  assert.deepEqual(CURRICULUM_GROUPS, ['Math Group', 'Chemistry Group', 'Physics Group', 'Biology Group']);
});

test('leadership stays first and members repeat in every selected department or group', () => {
  const members = [
    { id: 'member', roles: ['Team Member'], departments: [TEAM_DEPARTMENTS[0]], order_index: 1 },
    { id: 'cofounder', roles: ['Co-founder', 'Team Leader'], departments: [TEAM_DEPARTMENTS[0], CURRICULUM_GROUPS[0]], order_index: 2 },
    { id: 'founder', roles: ['Founder'], departments: [TEAM_DEPARTMENTS[1], CURRICULUM_GROUPS[0], CURRICULUM_GROUPS[1]], order_index: 9 },
  ];
  const before = structuredClone(members), grouped = groupTeamMembers(members);

  assert.deepEqual(grouped.leadership.map(member => member.id), ['founder', 'cofounder']);
  assert.deepEqual(grouped.departments.map(group => group.department), TEAM_DEPARTMENTS);
  assert.deepEqual(grouped.departments[0].members.map(member => member.id), ['member', 'cofounder']);
  assert.deepEqual(grouped.departments[1].members.map(member => member.id), ['founder']);
  assert.deepEqual(grouped.departments[2].groups.map(group => group.group), [CURRICULUM_GROUPS[0], CURRICULUM_GROUPS[1]]);
  assert.deepEqual(grouped.departments[2].groups[0].members.map(member => member.id), ['cofounder', 'founder']);
  assert.deepEqual(members, before);
  assert.deepEqual(groupTeamMembers([]), { leadership: [], departments: [], fallback: [] });
});

test('legacy compound roles and department aliases preserve the whole member', () => {
  const row={id:'legacy',name:'Test',role:'Co-founder & Website Developer & Team Leader',department:'Curriculum Content & Production',bio:'Keep biography',photo_url:'photo',order_index:7};
  const member=normalizeTeamMember(row);
  assert.deepEqual(member.roles,['Co-founder','Website Developer','Team Leader']);
  assert.deepEqual(member.departments,[TEAM_DEPARTMENTS[2]]);
  for(const key of Object.keys(row))assert.deepEqual(member[key],row[key]);
  assert.deepEqual(normalizeTeamMember({...row,role:'Co-founder & Leader',department:'Publicity'}).roles,['Co-founder','Team Leader']);
  assert.deepEqual(normalizeTeamMember({...row,department:'Publicity'}).departments,[TEAM_DEPARTMENTS[0]]);
});
test('present arrays win; unknown and blank memberships never hide a member', () => {
  const members=[
    normalizeTeamMember({id:'new',role:'Founder',department:'Publicity',roles:['Advisor'],departments:['Research'],order_index:1}),
    normalizeTeamMember({id:'empty',role:'Founder',department:'Publicity',roles:[],departments:[],order_index:2}),
    normalizeTeamMember({id:'null',role:null,department:null,order_index:3}),
    normalizeTeamMember({id:'mixed',roles:['Team Member',null],departments:['Math Group',null],order_index:4}),
  ];
  assert.deepEqual(members[0].roles,['Advisor']);assert.deepEqual(members[1].roles,[]);
  assert.deepEqual(groupTeamMembers(members).fallback.map(m=>m.id),['new','empty','null']);
  const g=groupTeamMembers(members);const shown=[...g.leadership,...g.fallback,...g.departments.flatMap(d=>[...d.members,...d.groups.flatMap(s=>s.members)])];
  assert.equal(new Set(shown.map(m=>m.id)).size,4);
});
test('shared loader detects actual columns including empty tables; outages never masquerade as legacy schema', async()=>{
  const calls=[];let error={code:'42703',message:'column roles does not exist'};
  const client={from:()=>({select:columns=>{calls.push(columns);return {limit:async()=>({error}),order:async()=>({data:[{id:'old',role:'Team Leader',department:'Math Group'}],error:null})};}})};
  let result=await loadTeamMembers(client);assert.equal(result.canSave,false);assert.deepEqual(result.members[0].roles,['Team Leader']);
  error=null;result=await loadTeamMembers(client);assert.equal(result.canSave,true);assert.ok(calls.includes('roles,departments'));
  error={code:'503',message:'Unavailable'};await assert.rejects(loadTeamMembers(client),e=>e.code==='503');
});
