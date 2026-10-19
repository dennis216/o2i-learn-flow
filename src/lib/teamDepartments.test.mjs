import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRICULUM_GROUPS, TEAM_DEPARTMENTS, TEAM_ROLES, groupTeamMembers } from './teamDepartments.ts';

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
  assert.deepEqual(groupTeamMembers([]), { leadership: [], departments: [] });
});
