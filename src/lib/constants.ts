// ============================================
// STRICT SINGLE-SUPER-ADMIN POLICY
// ============================================
// This file defines the immutable Super Admin identity.
// DO NOT MODIFY without proper authorization.

export const SUPER_ADMIN_EMAIL = 'ziquanwang52@gmail.com';

/**
 * Validates if the given email is the designated Super Admin.
 * This is the ONLY valid way to check for super admin privileges.
 * Database roles are secondary - email must match for true super admin access.
 */
export const isDesignatedSuperAdmin = (email: string | undefined | null): boolean => {
  if (!email) return false;
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
};

/**
 * Error message for unauthorized super admin operations
 */
export const SUPER_ADMIN_INTEGRITY_ERROR = 
  'System integrity error: Super Admin role is unique and cannot be reassigned.';
