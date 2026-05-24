import { supabase, isSupabaseConfigured } from './supabaseClient';

const REALTIME_TABLES = ['trips', 'drivers', 'vehicles', 'receipts', 'app_users', 'backup_snapshots'];

export function isRealtimeReady() {
  return Boolean(isSupabaseConfigured && supabase && typeof supabase.channel === 'function');
}

export function subscribeCloudRealtime(onChange, onStatus) {
  if (!isRealtimeReady()) {
    onStatus?.({ status: 'local', message: 'Realtime pasif: Supabase bağlantısı yok.' });
    return () => {};
  }

  let lastEventAt = 0;
  const channel = supabase.channel('nakliye-live-sync-v1');

  REALTIME_TABLES.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        const now = Date.now();
        // Çok hızlı ardışık eventlerde ekranı yormamak için hafif debounce.
        if (now - lastEventAt < 350) return;
        lastEventAt = now;
        onChange?.({ table, payload, receivedAt: new Date().toISOString() });
      }
    );
  });

  channel.subscribe((status) => {
    onStatus?.({
      status,
      message: status === 'SUBSCRIBED'
        ? 'Realtime aktif: diğer cihazlardaki değişiklikler otomatik alınacak.'
        : `Realtime durumu: ${status}`,
    });
  });

  return () => {
    try { supabase.removeChannel(channel); } catch {}
  };
}
