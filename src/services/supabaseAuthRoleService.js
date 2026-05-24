import { supabase, isSupabaseConfigured } from './supabaseClient';

const COMPANY_LOCAL_ID_KEY = 'seyitogullari_supabase_company_local_id_v1';

function getCompanyLocalId() {
  try {
    return localStorage.getItem(COMPANY_LOCAL_ID_KEY) || 'local-company';
  } catch {
    return 'local-company';
  }
}

function safeLocalId(user) {
  return String(user?.id || user?.local_id || user?.username || '').trim();
}

export function rolePreset(role) {
  if (role === 'admin') return { edit: true, delete: true, reports: true, settings: true };
  if (role === 'staff') return { edit: true, delete: false, reports: true, settings: false };
  if (role === 'accounting') return { edit: false, delete: false, reports: true, settings: false };
  if (role === 'driver') return { edit: false, delete: false, reports: false, settings: false };
  return { edit: false, delete: false, reports: false, settings: false };
}

export async function recordCloudLogin(user) {
  if (!isSupabaseConfigured || !supabase || !user) return { ok: false, skipped: true };
  const now = new Date().toISOString();
  const localId = safeLocalId(user);
  const payload = {
    company_local_id: getCompanyLocalId(),
    user_local_id: localId,
    username: user.username || '',
    full_name: user.name || user.full_name || '',
    role: user.role || 'staff',
    action: 'login',
    created_at: now,
    payload: { userAgent: navigator.userAgent, at: now }
  };
  try {
    await supabase.from('auth_activity_logs').insert(payload);
    if (localId) {
      await supabase.from('app_users')
        .update({ last_login_at: now, session_count: (Number(user.sessionCount) || 0) + 1, updated_at: now })
        .eq('local_id', localId);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function recordCloudLogout(user) {
  if (!isSupabaseConfigured || !supabase || !user) return { ok: false, skipped: true };
  const now = new Date().toISOString();
  const localId = safeLocalId(user);
  try {
    await supabase.from('auth_activity_logs').insert({
      company_local_id: getCompanyLocalId(),
      user_local_id: localId,
      username: user.username || '',
      full_name: user.name || user.full_name || '',
      role: user.role || 'staff',
      action: 'logout',
      created_at: now,
      payload: { userAgent: navigator.userAgent, at: now }
    });
    if (localId) {
      await supabase.from('app_users').update({ last_logout_at: now, updated_at: now }).eq('local_id', localId);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
