export const TEAM_DEPARTMENTS: readonly string[] = [
  "Publicity & Marketing",
  "Web Development & Management",
  "Curriculum Content & Media Production",
];

/** Only known aliases are canonicalized; unknown values keep their original identity. */
export function normalizeTeamDepartment(value: string | null | undefined): string {
  const department = value ?? "";
  const trimmed = department.trim();
  if (!trimmed) return "";
  if (trimmed === "Publicity") return TEAM_DEPARTMENTS[0];
  if (trimmed === "Curriculum Content & Production") return TEAM_DEPARTMENTS[2];
  return TEAM_DEPARTMENTS.find(department => department === trimmed) ?? department;
}

export function groupTeamMembers<T extends { department: string | null }>(members: readonly T[]) {
  return [...TEAM_DEPARTMENTS, "Team Members"].map(department => ({
    department,
    label: department === "Team Members" ? department : department + " Team",
    members: members.filter(member => {
      const normalized = normalizeTeamDepartment(member.department);
      const group = TEAM_DEPARTMENTS.some(known => known === normalized) ? normalized : "Team Members";
      return group === department;
    }),
  })).filter(group => group.members.length > 0);
}
