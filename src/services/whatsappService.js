export function normalizeTurkeyWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '90' + digits.slice(1);
  if (digits.length === 10) return '90' + digits;
  return digits;
}

export function buildWhatsAppUrl(phone, message) {
  const number = normalizeTurkeyWhatsAppNumber(phone);
  if (!number) return '';
  return `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message || '')}`;
}

export function openWhatsApp(phone, message) {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
