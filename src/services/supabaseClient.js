// Supabase connection foundation with easy browser setup
// يمكن ضبط الاتصال من ملف .env.local أو من صفحة Cloud داخل البرنامج.
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://odclahiilyhfdbttywxw.supabase.co';
const LOCAL_URL_KEY = 'nakliye_supabase_url_v1';
const LOCAL_ANON_KEY = 'nakliye_supabase_anon_key_v1';

function readLocal(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function getSavedSupabaseConfig() {
  return {
    url: process.env.REACT_APP_SUPABASE_URL || readLocal(LOCAL_URL_KEY) || DEFAULT_SUPABASE_URL,
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || readLocal(LOCAL_ANON_KEY) || '',
  };
}

export function saveSupabaseConfig({ url, anonKey }) {
  try {
    window.localStorage.setItem(LOCAL_URL_KEY, String(url || DEFAULT_SUPABASE_URL).trim());
    window.localStorage.setItem(LOCAL_ANON_KEY, String(anonKey || '').trim());
    return true;
  } catch {
    return false;
  }
}

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getSavedSupabaseConfig();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    })
  : null;

export function getSupabaseStatus() {
  const cfg = getSavedSupabaseConfig();
  return {
    configured: Boolean(cfg.url && cfg.anonKey),
    url: cfg.url,
    hasKey: Boolean(cfg.anonKey),
    message: Boolean(cfg.url && cfg.anonKey)
      ? 'Supabase hazır: online veritabanı bağlantısı ayarlanmış.'
      : 'Supabase anahtarı girilmedi: sistem localStorage modunda çalışıyor. Cloud sayfasından Publishable key yapıştırın.',
  };
}
