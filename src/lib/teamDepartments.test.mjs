import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM_DEPARTMENTS, normalizeTeamDepartment, groupTeamMembers } from './teamDepartments.ts';

test('canonical and legacy department names agree, without guessing unknown groups', () => {
  for (const department of TEAM_DEPARTMENTS) assert.equal(normalizeTeamDepartment(department), department);
  assert.equal(normalizeTeamDepartment('Publicity'), TEAM_DEPARTMENTS[0]);
  assert.equal(normalizeTeamDepartment('Curriculum Content & Production'), TEAM_DEPARTMENTS[2]);
  for (const department of ['Math Group', 'Chemistry Group', 'Physics Group', 'Unrecognized']) assert.equal(normalizeTeamDepartment(department), department);
  for (const department of [null, undefined, '', '  ']) assert.equal(normalizeTeamDepartment(department), '');
});

test('every member appears exactly once, preserving member fields and order within each group', () => {
  const departments = [...TEAM_DEPARTMENTS, 'Publicity', 'Curriculum Content & Production', 'Math Group', 'Chemistry Group', 'Physics Group', '', null];
  const members = departments.map((department, index) => ({ id: index, department, name: 'Synthetic '+index, role: 'Member', bio: 'Bio', photo_url: '/photo.png', order_index: index }));
  const before = structuredClone(members), groups = groupTeamMembers(members);
  assert.deepEqual(groups.map(group => group.department), [...TEAM_DEPARTMENTS, 'Team Members']);
  assert.deepEqual(groups.map(group => group.members.map(member => member.id)), [[0,3],[1],[2,4],[5,6,7,8,9]]);
  assert.equal(new Set(groups.flatMap(group => group.members.map(member => member.id))).size, members.length);
  for (const member of groups.flatMap(group => group.members)) assert.equal(member, members[member.id]);
  assert.deepEqual(members, before);
  assert.deepEqual(groupTeamMembers([]), []);
});
