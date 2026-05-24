export function fmtTRY(value) {
  const n = Number(value) || 0;
  return n ? '₺' + n.toLocaleString('tr-TR') : '—';
}

export function calcDebt(row) {
  return Math.max((Number(row?.tutar) || 0) - (Number(row?.paidAmount) || 0), 0);
}
