import { isFirebaseConfigured } from "../config/firebaseConfig";

export function getCloudStatus() {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  const configured = isFirebaseConfigured();

  return {
    online,
    configured,
    mode: configured ? "cloud" : "local",
    label: configured ? "Cloud Sync Hazır" : "Yerel Mod",
    description: configured
      ? "Firebase bilgileri girildi. Canlı senkronizasyon etkinleştirilebilir."
      : "Firebase bilgileri girilmediği için sistem localStorage ile güvenli çalışıyor."
  };
}

export function cloudStatusText() {
  const status = getCloudStatus();
  if (!status.online) return "Çevrimdışı";
  return status.configured ? "Cloud Hazır" : "Yerel Mod";
}
