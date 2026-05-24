import { supabase, isSupabaseConfigured } from './supabaseClient';

const COMPANY_LOCAL_ID_KEY = 'seyitogullari_supabase_company_local_id_v1';
const META_KEY = 'seyitogullari_supabase_sync_meta_v1';

function getCompanyLocalId() {
  let id = localStorage.getItem(COMPANY_LOCAL_ID_KEY);
  if (!id) {
    id = `company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(COMPANY_LOCAL_ID_KEY, id);
  }
  return id;
}

function safeId(value) {
  return String(value ?? '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getSyncMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}

function setSyncMeta(patch) {
  const next = { ...getSyncMeta(), ...patch };
  localStorage.setItem(META_KEY, JSON.stringify(next));
  return next;
}

async function ensureCompany() {
  if (!isSupabaseConfigured || !supabase) return null;
  const localId = getCompanyLocalId();
  const company = (() => {
    try { return JSON.parse(localStorage.getItem('seyitogullari_company_settings_v1') || '{}'); } catch { return {}; }
  })();
  const payload = {
    local_id: localId,
    name: company?.name || 'SEYİTOĞULLARI KILIÇBEY OTO TRANSFER',
    phone: company?.phone || '0535-207-8649',
  };
  const { data, error } = await supabase.from('companies').upsert(payload, { onConflict: 'local_id' }).select('id').single();
  if (error) throw error;
  return data.id;
}

function tripToDb(row, companyId) {
  return {
    company_id: companyId,
    local_id: safeId(row.id),
    serial: row.serial || null,
    tarih: row.tarih || null,
    musteri: row.musteri || null,
    phone: row.phone || null,
    driver: row.driver || null,
    plaka: row.plaka || null,
    nereden: row.nereden || null,
    nereye: row.nereye || null,
    tutar: Number(row.tutar) || 0,
    paid_amount: Number(row.paidAmount) || 0,
    portif_ucr: Number(row.portifUcr) || 0,
    fuel_cost: Number(row.fuelCost) || 0,
    driver_cost: Number(row.driverCost) || 0,
    toll_cost: Number(row.tollCost) || 0,
    other_cost: Number(row.otherCost) || 0,
    note: row.not || row.note || null,
    trip_status: row.tripStatus || 'new',
    payload: row || {},
    deleted: false,
  };
}

function dbToTrip(row) {
  return {
    ...(row.payload || {}),
    id: row.payload?.id ?? row.local_id,
    serial: row.serial || row.payload?.serial,
    tarih: row.tarih || row.payload?.tarih,
    musteri: row.musteri || row.payload?.musteri,
    phone: row.phone || row.payload?.phone,
    driver: row.driver || row.payload?.driver,
    plaka: row.plaka || row.payload?.plaka,
    nereden: row.nereden || row.payload?.nereden,
    nereye: row.nereye || row.payload?.nereye,
    tutar: Number(row.tutar) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    portifUcr: Number(row.portif_ucr) || 0,
    fuelCost: Number(row.fuel_cost) || 0,
    driverCost: Number(row.driver_cost) || 0,
    tollCost: Number(row.toll_cost) || 0,
    otherCost: Number(row.other_cost) || 0,
    not: row.note || row.payload?.not || '',
    tripStatus: row.trip_status || row.payload?.tripStatus || 'new',
  };
}

function driverToDb(row, companyId) {
  return { company_id: companyId, local_id: safeId(row.id), name: row.name || 'Şoför', phone: row.phone || null, status: row.status || 'available', payload: row || {} };
}
function dbToDriver(row) { return { ...(row.payload || {}), id: row.payload?.id ?? row.local_id, name: row.name, phone: row.phone || '', status: row.status || 'available' }; }

function vehicleToDb(row, companyId) {
  return { company_id: companyId, local_id: safeId(row.id), plate: row.plate || row.plaka || 'PLAKA', brand: row.brand || null, model: row.model || null, status: row.status || 'active', payload: row || {} };
}
function dbToVehicle(row) { return { ...(row.payload || {}), id: row.payload?.id ?? row.local_id, plate: row.plate, brand: row.brand || '', model: row.model || '', status: row.status || 'active' }; }

function genericToDb(row, companyId) { return { company_id: companyId, local_id: safeId(row.id), payload: row || {} }; }
function dbToGeneric(row) { return { ...(row.payload || {}), id: row.payload?.id ?? row.local_id }; }

async function upsertMany(table, rows, mapper, companyId) {
  if (!rows?.length) return 0;
  const batch = rows.map(row => mapper(row, companyId));
  const { error } = await supabase.from(table).upsert(batch, { onConflict: 'local_id' });
  if (error) throw error;
  return batch.length;
}

export async function pushCloudSnapshot(snapshot = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, mode: 'local', message: 'Supabase ayarları yok; veriler localStorage içinde güvenli.' };
  }
  if (!navigator.onLine) {
    setSyncMeta({ status: 'offline', pending: true, updatedAt: new Date().toISOString() });
    return { ok: false, mode: 'offline', message: 'İnternet yok; değişiklikler yerelde bekliyor.' };
  }
  try {
    const companyId = await ensureCompany();
    const counts = {
      trips: await upsertMany('trips', snapshot.data || [], tripToDb, companyId),
      drivers: await upsertMany('drivers', snapshot.drivers || [], driverToDb, companyId),
      vehicles: await upsertMany('vehicles', snapshot.vehicles || [], vehicleToDb, companyId),
      receipts: await upsertMany('receipts', snapshot.receipts || [], genericToDb, companyId),
      users: await upsertMany('app_users', (snapshot.users || []).map(u => ({ ...u, fullName: u.name })), (u, cid) => ({ company_id: cid, local_id: safeId(u.id), username: u.username || safeId(u.id), full_name: u.name || u.fullName || '', role: u.role || 'staff', active: u.active !== false, permissions: u.permissions || {}, payload: u || {} }), companyId),
    };
    setSyncMeta({ status: 'synced', pending: false, lastSyncAt: new Date().toISOString(), counts });
    return { ok: true, mode: 'synced', counts };
  } catch (error) {
    setSyncMeta({ status: 'error', pending: true, error: error.message, updatedAt: new Date().toISOString() });
    return { ok: false, mode: 'error', message: error.message };
  }
}

export async function loadCloudSnapshot() {
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) return { ok: false, mode: 'local' };
  try {
    const companyId = await ensureCompany();
    const [trips, drivers, vehicles, receipts, users] = await Promise.all([
      supabase.from('trips').select('*').eq('company_id', companyId).eq('deleted', false).order('updated_at', { ascending: false }),
      supabase.from('drivers').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      supabase.from('vehicles').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      supabase.from('receipts').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
      supabase.from('app_users').select('*').eq('company_id', companyId).order('updated_at', { ascending: false }),
    ]);
    const firstError = [trips, drivers, vehicles, receipts, users].find(r => r.error)?.error;
    if (firstError) throw firstError;
    return {
      ok: true,
      data: (trips.data || []).map(dbToTrip),
      drivers: (drivers.data || []).map(dbToDriver),
      vehicles: (vehicles.data || []).map(dbToVehicle),
      receipts: (receipts.data || []).map(dbToGeneric),
      users: (users.data || []).map(r => ({ ...(r.payload || {}), id: r.payload?.id ?? r.local_id, username: r.username, name: r.full_name || r.payload?.name, role: r.role, active: r.active, permissions: r.permissions || {} })),
    };
  } catch (error) {
    setSyncMeta({ status: 'error', pending: true, error: error.message, updatedAt: new Date().toISOString() });
    return { ok: false, mode: 'error', message: error.message };
  }
}

export function mergeById(localRows = [], cloudRows = []) {
  const map = new Map();
  localRows.forEach(item => map.set(String(item.id), item));
  cloudRows.forEach(item => map.set(String(item.id), { ...map.get(String(item.id)), ...item }));
  return Array.from(map.values());
}
