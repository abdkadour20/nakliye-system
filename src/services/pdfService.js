export function printHtmlDocument({ title = 'Belge', html = '', delay = 700 }) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, delay);
  return true;
}


export function downloadHtmlDocument({ html = '', filename = 'document.html' }) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function tryExportElementToPdf(payload) {
  try {
    const mod = await import('./pdfEngine');
    return await mod.exportElementToPdf(payload);
  } catch (error) {
    alert(error?.message || 'PDF oluşturulamadı.');
    return false;
  }
}
