export function parseTRDate(s) {
  if (!s) return null;
  const [d, m, y] = String(s).split('.').map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

export function dateKey(s) {
  const d = parseTRDate(s);
  return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
}
