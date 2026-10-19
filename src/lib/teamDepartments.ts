export const TEAM_DEPARTMENTS: readonly string[] = [
  "Publicity & Marketing",
  "Web Development & Management",
  "Curriculum Content & Media Production",
];

export const CURRICULUM_GROUPS: readonly string[] = [
  "Math Group",
  "Chemistry Group",
  "Physics Group",
  "Biology Group",
];

export const TEAM_ROLES: readonly string[] = [
  "Founder",
  "Co-founder",
  "Team Leader",
  "Team Member",
  "Website Developer",
];

export function groupTeamMembers<T extends { roles: string[]; departments: string[]; order_index: number }>(members: readonly T[]) {
  const byOrder = (left: T, right: T) => left.order_index - right.order_index;
  const leadership = members
    .filter(member => member.roles.includes("Founder") || member.roles.includes("Co-founder"))
    .sort((left, right) => Number(right.roles.includes("Founder")) - Number(left.roles.includes("Founder")) || byOrder(left, right));

  const departments = TEAM_DEPARTMENTS.map(department => ({
    department,
    members: members.filter(member => member.departments.includes(department)).sort(byOrder),
    groups: department === TEAM_DEPARTMENTS[2]
      ? CURRICULUM_GROUPS.map(group => ({
          group,
          members: members.filter(member => member.departments.includes(group)).sort(byOrder),
        })).filter(group => group.members.length > 0)
      : [],
  })).filter(department => department.members.length > 0 || department.groups.length > 0);

  return { leadership, departments };
}
