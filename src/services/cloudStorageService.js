// Cloud Ready Storage Service
// Firebase aktif değilse localStorage kullanır. Böylece program asla durmaz.

export function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function syncCollection(collectionName, data) {
  // Firebase bağlantısı geldiğinde burada Firestore setDoc/addDoc yapılacak.
  writeLocal(`cloud_shadow_${collectionName}`, {
    updatedAt: new Date().toISOString(),
    items: data
  });
  return { ok: true, mode: "local-shadow" };
}

export async function loadCollection(collectionName, fallback = []) {
  const shadow = readLocal(`cloud_shadow_${collectionName}`, null);
  return shadow?.items || fallback;
}
