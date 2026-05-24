import { COMPANY_SETTINGS_KEY } from './appKeys';

export const DEFAULT_COMPANY = 'SEYİTOĞULLARI KILIÇBEY OTO TRANSFER';
export const DEFAULT_PHONE = '0535-207-8649';

export function getCompanySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANY_SETTINGS_KEY));
    return { name: saved?.name || DEFAULT_COMPANY, phone: saved?.phone || DEFAULT_PHONE };
  } catch {
    return { name: DEFAULT_COMPANY, phone: DEFAULT_PHONE };
  }
}
