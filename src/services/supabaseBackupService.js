import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getSyncMeta } from './supabaseSyncService';

const BACKUP_META_KEY = 'seyitogullari_supabase_backup_meta_v1';
const COMPANY_LOCAL_ID_KEY = 'seyitogullari_supabase_company_local_id_v1';

function getCompanyLocalId() {
  return localStorage.getItem(COMPANY_LOCAL_ID_KEY) || 'local-company';
}

export function getCloudBackupMeta() {
  try { return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || '{}'); } catch { return {}; }
}

function setCloudBackupMeta(patch) {
  const next = { ...getCloudBackupMeta(), ...patch };
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next));
  return next;
}

export function shouldCreateCloudBackup() {
  const meta = getCloudBackupMeta();
  const today = new Date().toISOString().slice(0, 10);
  return meta.lastBackupDate !== today;
}

export async function createCloudBackup(snapshot = {}, reason = 'auto') {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, mode: 'local', message: 'Supabase ayarlı değil; backup sadece cihazda tutuluyor.' };
  }
  if (!navigator.onLine) {
    setCloudBackupMeta({ pending: true, status: 'offline', updatedAt: new Date().toISOString() });
    return { ok: false, mode: 'offline', message: 'İnternet yok; cloud backup daha sonra alınacak.' };
  }
  try {
    const localId = getCompanyLocalId();
    const payload = {
      company_local_id: localId,
      reason,
      snapshot,
      sync_meta: getSyncMeta(),
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('backup_snapshots')
      .insert(payload)
      .select('id, created_at')
      .single();
    if (error) throw error;
    setCloudBackupMeta({
      status: 'backed_up',
      pending: false,
      lastBackupAt: data.created_at,
      lastBackupDate: new Date().toISOString().slice(0, 10),
      lastBackupId: data.id,
    });
    return { ok: true, mode: 'backed_up', id: data.id, createdAt: data.created_at };
  } catch (error) {
    setCloudBackupMeta({ status: 'error', pending: true, error: error.message, updatedAt: new Date().toISOString() });
    return { ok: false, mode: 'error', message: error.message };
  }
}

export async function listCloudBackups(limit = 10) {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) return { ok: false, backups: [] };
  const { data, error } = await supabase
    .from('backup_snapshots')
    .select('id, reason, created_at')
    .eq('company_local_id', getCompanyLocalId())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, message: error.message, backups: [] };
  return { ok: true, backups: data || [] };
}
