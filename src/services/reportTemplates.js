export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildA4PrintShell({ title = 'Belge', body = '', css = '' }) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}
