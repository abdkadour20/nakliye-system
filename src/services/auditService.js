const AUDIT_KEY = 'seyitogullari_enterprise_audit_v1';

export function readAuditLogs() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY)) || []; } catch { return []; }
}

export function writeAuditLog({ user = 'Sistem', action, entity = '', detail = '' }) {
  const logs = readAuditLogs();
  const item = { id: Date.now(), date: new Date().toLocaleString('tr-TR'), user, action, entity, detail };
  localStorage.setItem(AUDIT_KEY, JSON.stringify([item, ...logs].slice(0, 1000)));
  return item;
}
