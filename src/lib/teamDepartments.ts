import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';

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

  const known = [...TEAM_DEPARTMENTS, ...CURRICULUM_GROUPS];
  const fallback = members.filter(member => !member.departments.some(value => known.includes(value))).sort(byOrder);
  return { leadership, departments, fallback };
}

export interface TeamMember {
  id: string; name: string; bio: string | null; photo_url: string | null; order_index: number;
  roles: string[]; departments: string[];
}
type StoredTeamMember = Omit<TeamMember, 'roles' | 'departments'> & {
  roles?: unknown; departments?: unknown; role?: string | null; department?: string | null;
};
export const TEAM_LEGACY_READ_ONLY = 'Team data uses the legacy database schema. Members are visible, but adding and saving edits are disabled until the Team compatibility upgrade is installed.';
const strings = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string' && !!v.trim()))];
export function normalizeTeamMember<T extends StoredTeamMember>(row: T) {
  const roles = Array.isArray(row.roles) ? strings(row.roles)
    : strings((row.role ?? '').split(/\s*&\s*/).map(role => role.trim() === 'Leader' ? 'Team Leader' : role.trim()));
  const department = row.department === 'Publicity' ? 'Publicity & Marketing'
    : row.department === 'Curriculum Content & Production' ? 'Curriculum Content & Media Production' : row.department;
  return { ...row, roles, departments: Array.isArray(row.departments) ? strings(row.departments) : department ? [department] : [] };
}
export async function loadTeamMembers(client: Pick<SupabaseClient<Database>, 'from'>) {
  // Probe even an empty table; row contents alone cannot identify available write columns.
  const probe = await client.from('team_members').select('roles,departments').limit(0);
  if (probe.error && !['42703', 'PGRST204'].includes(probe.error.code)) throw probe.error;
  const { data, error } = await client.from('team_members').select('*').order('order_index', { ascending: true });
  if (error) throw error;
  return { members: (data ?? []).map(normalizeTeamMember), canSave: !probe.error };
}
