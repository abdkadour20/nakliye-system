import { supabase, isSupabaseConfigured } from './supabaseClient';

export const EVRAK_BUCKET = 'evrak';

function safePart(value, fallback = 'genel') {
  const raw = String(value || fallback).trim();
  const trMap = {
    'ğ':'g','Ğ':'G','ü':'u','Ü':'U','ş':'s','Ş':'S','ı':'i','İ':'I','ö':'o','Ö':'O','ç':'c','Ç':'C'
  };
  const ascii = raw.replace(/[ğĞüÜşŞıİöÖçÇ]/g, ch => trMap[ch] || ch);
  return ascii
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function safeFileBase(fileName = 'evrak') {
  const clean = String(fileName || 'evrak').split('?')[0].replace(/\.[^/.]+$/, '');
  return safePart(clean, 'evrak');
}

function extensionOf(fileName = '') {
  const clean = String(fileName).split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : 'bin';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}


function storagePathFromPublicUrl(url, bucket = EVRAK_BUCKET) {
  if (!url) return '';
  try {
    const u = new URL(String(url));
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx >= 0) return decodeURIComponent(u.pathname.slice(idx + marker.length));
    const marker2 = `/storage/v1/object/sign/${bucket}/`;
    const idx2 = u.pathname.indexOf(marker2);
    if (idx2 >= 0) return decodeURIComponent(u.pathname.slice(idx2 + marker2.length));
  } catch (_) {}
  const raw = String(url);
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(raw.slice(idx + marker.length).split('?')[0]);
  return '';
}

export function resolveEvrakStoragePath(record) {
  if (!record) return '';
  const bucket = record.bucket || EVRAK_BUCKET;
  let p = record.storage_path || record.cloudPath || record.path || storagePathFromPublicUrl(record.public_url || record.cloudUrl || record.fileData, bucket);
  p = String(p || '').trim().replace(/^\/+/, '');
  p = p.replace(/^evrak\//, '');
  try { p = decodeURIComponent(p); } catch (_) {}
  return p;
}

function isSafeStorageKey(path) {
return Boolean(path) && /^[A-Za-z0-9_.*/()-]+$/.test(path);
}

export function isEvrakCloudReady() {
  return Boolean(isSupabaseConfigured && supabase);
}

export async function uploadTripEvrakToCloud({ file, trip, docType, note, user }) {
  if (!file) throw new Error('Dosya seçilmedi.');
  if (!supabase) throw new Error('Supabase bağlantısı hazır değil. Cloud sayfasından Publishable key kaydedin.');

  const tripLocalId = String(trip?.local_id || trip?.id || trip?.serial || Date.now());
  const serial = safePart(trip?.serial || tripLocalId, 'sefer');
  const ext = extensionOf(file.name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const storagePath = `trips/${serial}/${stamp}-${safeFileBase(file.name)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(EVRAK_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(EVRAK_BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData?.publicUrl || '';

  const record = {
    local_id: `evrak_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    trip_id: trip?.id || null,
    trip_local_id: tripLocalId,
    trip_serial: trip?.serial || null,
    company_local_id: trip?.company_id || trip?.companyLocalId || null,
    doc_type: docType || 'Evrak',
    note: note || null,
    file_name: file.name,
    file_type: file.type || null,
    file_size: file.size || 0,
    bucket: EVRAK_BUCKET,
    storage_path: storagePath,
    public_url: publicUrl,
    uploaded_by: user?.username || user?.full_name || 'local-user',
    payload: {
      tripSerial: trip?.serial,
      musteri: trip?.musteri,
      nereden: trip?.nereden,
      nereye: trip?.nereye,
    },
    created_at: new Date().toISOString(),
  };

  const { data, error: insertError } = await supabase
    .from('evrak_files')
    .insert(record)
    .select()
    .single();

  if (insertError) throw insertError;

  return {
    ...record,
    ...(data || {}),
    fileData: publicUrl,
    cloudUrl: publicUrl,
    cloudPath: storagePath,
    cloudStatus: 'uploaded',
  };
}


export async function deleteTripEvrakFromCloud(record) {
  if (!record) throw new Error('Silinecek evrak bulunamadı.');
  if (!supabase) throw new Error('Supabase bağlantısı hazır değil.');

  const bucket = record.bucket || EVRAK_BUCKET;
  const storagePath = resolveEvrakStoragePath(record);

  if (storagePath) {
    if (!isSafeStorageKey(storagePath)) {
      // Eski sürümlerde Türkçe karakterli dosya adları Storage API tarafından silinemeyebilir.
      // Bu durumda veritabanı kaydını sileriz; dosya Storage panelinden manuel temizlenebilir.
      console.warn('Unsafe storage key skipped during delete:', storagePath);
    } else {
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([storagePath]);
      if (storageError) throw new Error(`Storage dosyası silinemedi: ${storageError.message}`);
    }
  }

  let query = supabase.from('evrak_files').delete();
  if (record.id && isUuid(record.id)) query = query.eq('id', record.id);
  else if (record.local_id || record.id) query = query.eq('local_id', record.local_id || record.id);
  else if (storagePath) query = query.eq('storage_path', storagePath);
  else throw new Error('Evrak kaydı silinemedi: kayıt kimliği yok.');

  const { error: deleteError } = await query;
  if (deleteError) throw new Error(`Evrak kaydı silinemedi: ${deleteError.message}`);

  return true;
}


export async function listTripEvrakFromCloud(trip) {
  if (!supabase) return [];
  const tripLocalId = String(trip?.local_id || trip?.id || trip?.serial || '');
  if (!tripLocalId && !trip?.serial) return [];

  let query = supabase.from('evrak_files').select('*').order('created_at', { ascending: false });
  if (tripLocalId) query = query.eq('trip_local_id', tripLocalId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
