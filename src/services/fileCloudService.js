// Cloud Ready File Service
// Firebase Storage bağlantısı eklenince upload gerçek buluta taşınacak.

export async function prepareFileForCloud(file, meta = {}) {
  if (!file) return null;
  return {
    id: `file_${Date.now()}`,
    name: file.name,
    size: file.size,
    type: file.type,
    meta,
    createdAt: new Date().toISOString(),
    mode: "local-preview"
  };
}
