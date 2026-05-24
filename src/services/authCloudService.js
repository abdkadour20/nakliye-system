// Cloud Ready Auth Service
// Gerçek Firebase Auth için hazır yapı. Şimdilik güvenli demo/fallback mod.

const SESSION_KEY = "nakliye_cloud_session_v1";

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    ...user,
    loginAt: new Date().toISOString()
  }));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function cloudLogin(username, password, users = []) {
  const user = users.find(u => u.username === username && u.password === password && u.active);
  if (!user) return { ok: false, error: "Kullanıcı adı veya şifre hatalı." };
  saveSession(user);
  return { ok: true, user, mode: "local-auth" };
}
