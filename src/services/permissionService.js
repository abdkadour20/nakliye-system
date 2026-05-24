export function defaultPermissionsFor(role) {
  if (role === 'admin') return { edit: true, delete: true, reports: true, settings: true, accounting: true, vehicles: true };
  if (role === 'staff') return { edit: true, delete: false, reports: true, settings: false, accounting: false, vehicles: true };
  return { edit: false, delete: false, reports: false, settings: false, accounting: false, vehicles: false };
}

export function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const merged = { ...defaultPermissionsFor(user.role), ...(user.permissions || {}) };
  return !!merged[key];
}
