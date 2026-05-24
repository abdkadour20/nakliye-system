import React from "react";
import { getSupabaseStatus, getSavedSupabaseConfig, saveSupabaseConfig } from "../../services/supabaseClient";
import { getSyncMeta } from "../../services/supabaseSyncService";

function statusLabel(status) {
  return {
    synced: "Senkronize",
    syncing: "Senkronize ediliyor",
    checking: "Kontrol ediliyor",
    offline: "Offline",
    error: "Hata",
    local: "Yerel Mod",
  }[status] || "Yerel Mod";
}

export default function CloudSyncPanel({ cloudSyncState = {}, onManualSync }) {
  const supabase = getSupabaseStatus();
  const savedConfig = getSavedSupabaseConfig();
  const [setupUrl, setSetupUrl] = React.useState(savedConfig.url || "https://odclahiilyhfdbttywxw.supabase.co");
  const [setupKey, setSetupKey] = React.useState(savedConfig.anonKey || "");
  const saveSetup = () => {
    if (!String(setupKey || "").trim()) {
      alert("Lütfen Supabase Publishable key değerini yapıştırın.");
      return;
    }
    saveSupabaseConfig({ url: setupUrl, anonKey: setupKey });
    alert("Supabase bilgileri kaydedildi. Program yeniden yüklenecek.");
    window.location.reload();
  };
  const meta = cloudSyncState.meta || getSyncMeta();
  const status = cloudSyncState.status || meta.status || (supabase.configured ? "checking" : "local");
  const counts = cloudSyncState.counts || meta.counts || {};
  const backupMeta = cloudSyncState.backupMeta || {};

  return (
    <main className="panel full cloud-sync-page">
      <div className="cloud-hero">
        <div>
          <span className="section-kicker">Supabase Phase 3</span>
          <h2>☁️ Offline Sync + Otomatik Backup</h2>
          <p>Program internet yokken localStorage ile çalışır; internet geldiğinde verileri Supabase ile eşitler ve günlük cloud backup oluşturur.</p>
        </div>
        <div className={`cloud-status-pill ${supabase.configured ? "ready" : "local"}`}>
          {supabase.configured ? statusLabel(status) : "Supabase ayarsız"}
        </div>
      </div>

      <div className="cloud-grid">
        <div className="cloud-card"><b>🚛 Seferler</b><span>{counts.trips ?? "—"} kayıt cloud tarafına hazır.</span></div>
        <div className="cloud-card"><b>🚚 Şoförler</b><span>{counts.drivers ?? "—"} kayıt senkronize edilir.</span></div>
        <div className="cloud-card"><b>🚗 Araçlar</b><span>{counts.vehicles ?? "—"} kayıt senkronize edilir.</span></div>
        <div className="cloud-card"><b>🧾 Tahsilatlar</b><span>{counts.receipts ?? "—"} kayıt senkronize edilir.</span></div>
        <div className="cloud-card"><b>🛟 Cloud Backup</b><span>{backupMeta.lastBackupAt ? new Date(backupMeta.lastBackupAt).toLocaleString("tr-TR") : "Henüz yok"}</span></div>
      </div>

      <div className="cloud-setup-box">
        <h3>Durum</h3>
        <p><b>Bağlantı:</b> {supabase.message}</p>
        <p><b>Son durum:</b> {cloudSyncState.message || meta.error || statusLabel(status)}</p>
        {meta.lastSyncAt && <p><b>Son senkronizasyon:</b> {new Date(meta.lastSyncAt).toLocaleString("tr-TR")}</p>}
        {meta.pending && <p><b>Bekleyen veri:</b> Var. İnternet/Supabase hazır olunca tekrar gönderilecek.</p>}
        {backupMeta.status && <p><b>Backup durumu:</b> {backupMeta.status}{backupMeta.error ? ` - ${backupMeta.error}` : ""}</p>}
        <div className="buttons compact"><button className="btn" onClick={onManualSync}>🔄 Manuel Senkronize Et</button></div>
      </div>

      <div className="cloud-setup-box">
        <h3>Supabase Bağlantı Ayarları</h3>
        <p>Artık dosya açıp düzenlemenize gerek yok. Supabase sayfasındaki <b>Publishable key</b> değerini buraya yapıştırın.</p>
        <label className="field-block">
          <span>Project URL</span>
          <input value={setupUrl} onChange={(e)=>setSetupUrl(e.target.value)} placeholder="https://...supabase.co" />
        </label>
        <label className="field-block">
          <span>Publishable key</span>
          <input value={setupKey} onChange={(e)=>setSetupKey(e.target.value)} placeholder="sb_publishable_..." />
        </label>
        <div className="buttons compact"><button className="btn primary" onClick={saveSetup}>💾 Kaydet ve Bağlan</button></div>
        <p><b>مهم:</b> لا تضع Secret key هنا، ضع فقط Publishable key العلوي.</p>
      </div>

      <div className="cloud-setup-box">
        <h3>Kurulum</h3>
        <ol>
          <li>Supabase SQL Editor içinde <code>db/00_RUN_THIS_IN_SUPABASE.sql</code> dosyasını çalıştırın.</li>
          <li>Cloud sayfasına Publishable key yapıştırın.</li>
          <li>Program yeniden yüklendikten sonra <b>Manuel Senkronize Et</b> düğmesine basın.</li>
        </ol>
      </div>
    </main>
  );
}
