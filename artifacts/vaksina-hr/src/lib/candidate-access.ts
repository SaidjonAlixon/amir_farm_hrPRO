import { HR_ROLES, isHrManager as isHrManagerRole, userRoleLabel } from './roles';

/** HR suhbatni shu rollarga o'tkaza oladi */
export const ASSIGNABLE_ROLES = [
  'admin',
  ...HR_ROLES,
  'recruiter',
  'trainer',
  'director',
  'department_head',
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function roleLabel(role?: string | null): string {
  if (!role) return '';
  return userRoleLabel(role);
}

export function isHrManager(role?: string | null): boolean {
  return isHrManagerRole(role);
}

/** Rekruter faqat o'ziga biriktirilgan ishlarni ko'radi */
export function isRecruiterScoped(role?: string | null): boolean {
  return role === 'recruiter';
}

/** Faqat mas'ul yoki HR/Admin o'zgartira oladi */
export function canManageCandidate(
  user?: { id: number; role: string } | null,
  assigneeId?: number | null,
): boolean {
  if (!user) return false;
  if (isHrManager(user.role)) return true;
  if (assigneeId != null && user.id === assigneeId) return true;
  return false;
}

/** Ko'rish: rekruter — faqat o'ziga biriktirilgan */
export function canViewCandidate(
  user?: { id: number; role: string } | null,
  assigneeId?: number | null,
): boolean {
  if (!user) return false;
  if (!isRecruiterScoped(user.role)) return true;
  return assigneeId != null && user.id === assigneeId;
}

export function canReassignCandidate(user?: { role: string } | null): boolean {
  return isHrManager(user?.role);
}

export function isAssignableRole(role?: string | null): boolean {
  return !!role && ASSIGNABLE_ROLES.includes(role as AssignableRole);
}
