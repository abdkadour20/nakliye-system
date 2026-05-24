import { supabase, isSupabaseConfigured } from './supabaseClient';

const BUCKET = 'evrak';

function safePart(value) {
  return String(value || 'genel')
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'genel';
}

function extFromName(name = '') {
  const found = String(name).split('.').pop();
  return found && found !== name ? found : 'bin';
}

export async function uploadEvrakFile(file, meta = {}) {
  if (!file) return { ok: false, mode: 'empty', message: 'Dosya seçilmedi.' };
  if (!isSupabaseConfigured || !supabase || !navigator.onLine) {
    return { ok: false, mode: 'local', message: 'Supabase/Internet yok; dosya local önizleme olarak kaldı.' };
  }

  try {
    const ownerType = safePart(meta.ownerType || 'genel');
    const ownerName = safePart(meta.ownerName || meta.tripSerial || 'evrak');
    const extension = extFromName(file.name);
    const path = `${ownerType}/${ownerName}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = publicData?.publicUrl || '';

    let cloudId = '';
    const record = {
      owner_type: meta.ownerType || 'genel',
      owner_id: String(meta.ownerId || ''),
      owner_name: meta.ownerName || meta.tripSerial || 'Genel',
      category: meta.category || 'Evrak',
      title: meta.title || file.name,
      file_name: file.name,
      file_type: file.type || 'file',
      file_size: file.size || 0,
      storage_bucket: BUCKET,
      storage_path: path,
      public_url: publicUrl,
      note: meta.note || '',
      expire_date: meta.expireDate || null,
      payload: meta || {},
    };
    const { data, error: insertError } = await supabase
      .from('evrak_files')
      .insert(record)
      .select('id')
      .single();
    if (insertError) throw insertError;
    cloudId = data?.id || '';

    return { ok: true, mode: 'cloud', url: publicUrl, path, bucket: BUCKET, cloudId };
  } catch (error) {
    return { ok: false, mode: 'error', message: error.message };
  }
}
