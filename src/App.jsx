import React, { useMemo, useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "./App.css";
import CloudSyncPanel from "./modules/cloud/CloudSyncPanel";
import { loadCloudSnapshot, pushCloudSnapshot, mergeById, getSyncMeta } from "./services/supabaseSyncService";
import { createCloudBackup, getCloudBackupMeta, shouldCreateCloudBackup } from "./services/supabaseBackupService";
import { uploadTripEvrakToCloud, listTripEvrakFromCloud, deleteTripEvrakFromCloud, isEvrakCloudReady } from "./services/evrakCloudService";
import { supabase, isSupabaseConfigured } from "./services/supabaseClient";


// Simple password hash for local storage security
function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = ((h << 5) - h) + pw.charCodeAt(i);
    h |= 0;
  }
  return "h_" + Math.abs(h).toString(36) + "_" + pw.length;
}
function checkPassword(stored, input) {
  // Support both legacy plain passwords and hashed ones
  if (stored.startsWith("h_")) return stored === hashPassword(input);
  return stored === input; // legacy plain text
}

const STORAGE_KEY = "seyitogullari_final_v2_full_upgrade";
const USER_KEY = "seyitogullari_users_v2";
const DRIVER_KEY = "seyitogullari_drivers_v2";
const VEHICLE_KEY = "seyitogullari_vehicles_v1";
const DOCUMENT_KEY = "seyitogullari_documents_v1";
const LOG_KEY = "seyitogullari_logs_v2";
const AUTO_BACKUP_KEY = "seyitogullari_auto_backup_v1";
const RECEIPT_KEY = "seyitogullari_receipts_v1";
const BRAND_ASSETS_KEY = "seyitogullari_brand_assets_v1";
const THEME_KEY = "seyitogullari_theme_v1";
const BRANCH_KEY = "seyitogullari_branches_v1";
const SELECTED_BRANCH_KEY = "seyitogullari_selected_branch_v1";
const ENTERPRISE_CONFIG_KEY = "seyitogullari_enterprise_config_v12";
const ENTERPRISE_API_KEYS_KEY = "seyitogullari_enterprise_api_keys_v12";
const COMPANY_SETTINGS_KEY = "seyitogullari_company_settings_v1";
const DEFAULT_COMPANY = "SEYİTOĞULLARI KILIÇBEY OTO TRANSFER";
const DEFAULT_PHONE = "0535-207-8649";
function getCompanySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANY_SETTINGS_KEY));
    return { name: saved?.name || DEFAULT_COMPANY, phone: saved?.phone || DEFAULT_PHONE };
  } catch {
    return { name: DEFAULT_COMPANY, phone: DEFAULT_PHONE };
  }
}
const COMPANY = getCompanySettings().name;
const PHONE = getCompanySettings().phone;

const TRIP_STATUS_FLOW = ["new", "planned", "received", "onRoad", "delivered", "invoiced", "closed"];
const TRIP_DOCUMENT_TYPES = ["Fatura", "Yükleme İzni", "Teslim Fotoğrafı", "CMR", "Masraf Fişi", "Diğer"];
function tripStatusPercent(status) { const i = Math.max(TRIP_STATUS_FLOW.indexOf(status), 0); return Math.round(((i + 1) / TRIP_STATUS_FLOW.length) * 100); }

const initialUsers = [
  { id: 1, username: "admin", password: "1234", name: "Yönetici", role: "admin", active: true, permissions: { edit: true, delete: true, reports: true, settings: true } },
  { id: 2, username: "personel", password: "1234", name: "Personel", role: "staff", active: true, permissions: { edit: true, delete: false, reports: true, settings: false } },
  { id: 3, username: "sofor", password: "1234", name: "Şoför", role: "driver", active: true, permissions: { edit: false, delete: false, reports: false, settings: false } },
];

const initialDrivers = [
  { id: 1, name: "Mehmet", phone: "", status: "available" },
  { id: 2, name: "Ahmet", phone: "", status: "busy" },
];

const initialDocuments = [
  { id: 1, title: "Örnek Teslim Evrakı", category: "Sefer", ownerType: "sefer", ownerName: "SK-2026-0001", fileName: "teslim-evraki.jpg", fileType: "image", fileData: "", note: "Demo kayıt", createdAt: new Date().toLocaleString("tr-TR") },
];

const initialVehicles = [
  { id: 1, plate: "HONDA", brand: "Honda", model: "", inspectionDate: "2026-12-31", insuranceDate: "2026-12-31", status: "active", notes: "" },
  { id: 2, plate: "OPEL", brand: "Opel", model: "", inspectionDate: "2026-11-30", insuranceDate: "2026-11-30", status: "active", notes: "" },
];

const initialBranches = [
  { id: "merkez", name: "Merkez Şube", city: "İstanbul", manager: "Yönetici", phone: DEFAULT_PHONE, active: true, note: "Ana operasyon merkezi" },
  { id: "hatay", name: "Hatay Şube", city: "Hatay", manager: "", phone: "", active: true, note: "Bölgesel operasyon" },
];

const initialData = [
  { id: 1, serial: "SK-2026-0001", tarih: "06.05.2026", musteri: "KAN", phone: "", driver: "Mehmet", plaka: "HONDA", nereden: "İSTANBUL", nereye: "İSKANDARUN", tutar: 14000, paidAmount: 14000, portifUcr: 1400, fuelCost: 1200, driverCost: 800, tollCost: 300, otherCost: 0, not: "", tripStatus: "delivered", image: "" },
  { id: 2, serial: "SK-2026-0002", tarih: "16.05.2026", musteri: "UMİT CEMİL OĞLU", phone: "", driver: "Ahmet", plaka: "OPEL", nereden: "İSTANBUL BAŞAKŞEHİR", nereye: "REYHÂNLI", tutar: 15000, paidAmount: 7500, portifUcr: 1500, fuelCost: 1500, driverCost: 900, tollCost: 400, otherCost: 0, not: "", tripStatus: "onRoad", image: "" },
  { id: 3, serial: "SK-2026-0003", tarih: "16.05.2026", musteri: "İBRAHİM YAĞMUR", phone: "", driver: "Mehmet", plaka: "GLİO", nereden: "İSTANBUL BAŞAKŞEHİR", nereye: "REYHÂNLI", tutar: 15000, paidAmount: 15000, portifUcr: 1500, fuelCost: 1500, driverCost: 900, tollCost: 400, otherCost: 0, not: "", tripStatus: "planned", image: "" },
  { id: 4, serial: "SK-2026-0004", tarih: "16.05.2026", musteri: "ABU YUSUF", phone: "", driver: "", plaka: "ADMİRA", nereden: "İSTANBUL PENDEK", nereye: "REYHÂNLI", tutar: 15000, paidAmount: 0, portifUcr: 1500, fuelCost: 0, driverCost: 0, tollCost: 0, otherCost: 0, not: "", tripStatus: "new", image: "" },
  { id: 5, serial: "SK-2026-0005", tarih: "19.05.2026", musteri: "İBRAHİM YAĞMUR", phone: "", driver: "Ahmet", plaka: "İ20", nereden: "KOCELİ", nereye: "REYHÂNLI", tutar: 14000, paidAmount: 14000, portifUcr: 1400, fuelCost: 1100, driverCost: 700, tollCost: 200, otherCost: 0, not: "2 DAFA ARAÇ GİTTİ", tripStatus: "delivered", image: "" },
  { id: 6, serial: "SK-2026-0006", tarih: "19.05.2026", musteri: "MUSTAFA ERE", phone: "", driver: "Mehmet", plaka: "FOX", nereden: "ANKARA", nereye: "REYHÂNLI", tutar: 11000, paidAmount: 5000, portifUcr: 1100, fuelCost: 900, driverCost: 600, tollCost: 150, otherCost: 0, not: "", tripStatus: "onRoad", image: "" },
  { id: 7, serial: "SK-2026-0007", tarih: "19.05.2026", musteri: "OZAN KARATAŞ", phone: "", driver: "", plaka: "RİHNO", nereden: "İSTANBUL MASLAK", nereye: "KIRIKHAN", tutar: 0, paidAmount: 0, portifUcr: 0, fuelCost: 0, driverCost: 0, tollCost: 0, otherCost: 0, not: "", tripStatus: "new", image: "" },
  { id: 8, serial: "SK-2026-0008", tarih: "19.05.2026", musteri: "OZAN KARATAŞ", phone: "", driver: "", plaka: "LENA", nereden: "İSTANBUL MASLAK ENKA", nereye: "ANTAKYA", tutar: 0, paidAmount: 0, portifUcr: 0, fuelCost: 0, driverCost: 0, tollCost: 0, otherCost: 0, not: "", tripStatus: "new", image: "" },
  { id: 9, serial: "SK-2026-0009", tarih: "19.05.2026", musteri: "ŞUKRU OZAN", phone: "", driver: "", plaka: "EGEA", nereden: "İSTANBUL EKİTELLİ", nereye: "KIRIKHAN", tutar: 0, paidAmount: 0, portifUcr: 0, fuelCost: 0, driverCost: 0, tollCost: 0, otherCost: 0, not: "", tripStatus: "new", image: "" },
];

const emptyRow = { tarih: "", musteri: "", phone: "", driver: "", plaka: "", nereden: "", nereye: "", tutar: "", paidAmount: "", portifUcr: "", fuelCost: "", driverCost: "", tollCost: "", otherCost: "", not: "", tripStatus: "new", image: "", deliveryImage: "", documentImage: "", signature: "" };

function fmt(v) { const n = Number(v) || 0; return n ? "₺" + n.toLocaleString("tr-TR") : "—"; }
function parseTRDate(s) { if (!s) return null; const [d, m, y] = String(s).split(".").map(Number); if (!d || !m || !y) return null; return new Date(y, m - 1, d); }
function trToInputDate(s) { const d = parseTRDate(s); if (!d) return ""; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function inputToTRDate(s) { if (!s) return ""; const [y,m,d] = s.split("-"); return `${d}.${m}.${y}`; }
function dateKey(s) { const d = parseTRDate(s); return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : ""; }
function monthKey(s) { return dateKey(s).slice(0, 7); }
function daysBetween(dateString) { const d = parseTRDate(dateString); if (!d) return 0; return Math.floor((new Date() - d) / 86400000); }
function daysUntil(inputDate) { if (!inputDate) return null; const d = new Date(inputDate + "T00:00:00"); if (Number.isNaN(d.getTime())) return null; const today = new Date(); today.setHours(0,0,0,0); return Math.ceil((d - today) / 86400000); }
function normalizeText(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .split("ı").join("i")
    .split("İ").join("i")
    .split("ğ").join("g")
    .split("Ğ").join("g")
    .split("ü").join("u")
    .split("Ü").join("u")
    .split("ş").join("s")
    .split("Ş").join("s")
    .split("ö").join("o")
    .split("Ö").join("o")
    .split("ç").join("c")
    .split("Ç").join("c")
    .split("أ").join("ا")
    .split("إ").join("ا")
    .split("آ").join("ا")
    .split("ٱ").join("ا")
    .split("ة").join("ه")
    .split("ى").join("ي")
    .split("ئ").join("ي")
    .split("ؤ").join("و")
    .split("ـ").join("")
    .replace(/[^a-z0-9\s\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function universalSearchNormalize(value) {
  return normalizeText(value);
}
function noDotsArabic(s) { return normalizeText(s).replace(/[بنتثيىجخخذزضظغفق]/g, ch => ({"ب":"ٮ","ن":"ٮ","ت":"ٮ","ث":"ٮ","ي":"ى","ى":"ى","ج":"ح","خ":"ح","ذ":"د","ز":"ر","ض":"ص","ظ":"ط","غ":"ع","ف":"ڡ","ق":"ٯ"}[ch] || ch)); }
function levenshtein(a, b) { if (Math.abs(a.length - b.length) > 2) return 3; const dp = Array.from({length:a.length+1}, (_,i)=>[i]); for (let j=1;j<=b.length;j++) dp[0][j]=j; for (let i=1;i<=a.length;i++) for (let j=1;j<=b.length;j++) dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return dp[a.length][b.length]; }
function smartMatch(row, query) { const q = normalizeText(query); if (!q) return true; const text = normalizeText([row.serial,row.tarih,row.musteri,row.phone,row.driver,row.plaka,row.nereden,row.nereye,row.not,row.tripStatus,paymentLabel(paymentStatus(row)),statusLabel(row.tripStatus)].join(" ")); const textNoDots = noDotsArabic(text); return q.split(" ").every(word => { if (text.includes(word) || textNoDots.includes(noDotsArabic(word))) return true; return text.split(" ").some(t => t.length > 2 && word.length > 2 && levenshtein(t, word) <= 1); }); }
function expenses(r) { return (Number(r.fuelCost)||0)+(Number(r.driverCost)||0)+(Number(r.tollCost)||0)+(Number(r.otherCost)||0); }
function realProfit(r) { return (Number(r.tutar)||0) - (Number(r.portifUcr)||0) - expenses(r); }
function paymentStatus(r) { const total = Number(r.tutar)||0, paid = Number(r.paidAmount)||0; if (total > 0 && paid >= total) return "paid"; if (paid > 0) return "partial"; return "unpaid"; }
function paymentLabel(s) { return s === "paid" ? "Ödendi" : s === "partial" ? "Kısmi" : "Ödenmedi"; }
function statusLabel(s) { return { new:"Yeni", pending:"Yeni", planned:"Planlandı", received:"Araç Alındı", onRoad:"Yolda", delivered:"Teslim Edildi", invoiced:"Faturalandı", closed:"Kapandı" }[s] || "Yeni"; }
function driverStatusLabel(s) { return { available:"Müsait", busy:"Meşgul", leave:"İzinli" }[s] || "Müsait"; }
function normalizeRow(r, index = 0) { const status = r.tripStatus === "pending" ? "new" : (r.tripStatus || "new"); const baseTimeline = Array.isArray(r.tripTimeline) && r.tripTimeline.length ? r.tripTimeline : [{ id:`tl-${r.id||index}-created`, date:new Date().toLocaleString("tr-TR"), status:"new", title:"Sefer oluşturuldu", note:r.not || "İlk kayıt" }]; return { ...r, serial: r.serial || `SK-${new Date().getFullYear()}-${String(index + 1).padStart(4,"0")}`, tutar: Number(r.tutar)||0, paidAmount: Number(r.paidAmount)||0, portifUcr: Number(r.portifUcr)||0, fuelCost: Number(r.fuelCost)||0, driverCost: Number(r.driverCost)||0, tollCost: Number(r.tollCost)||0, otherCost: Number(r.otherCost)||0, tripStatus: status, tripTimeline: baseTimeline, tripDocuments: Array.isArray(r.tripDocuments) ? r.tripDocuments : [], tripTasks: Array.isArray(r.tripTasks) ? r.tripTasks : [], tripNotes: Array.isArray(r.tripNotes) ? r.tripNotes : [], image: r.image || "", deliveryImage: r.deliveryImage || "", documentImage: r.documentImage || "", signature: r.signature || "", driver: r.driver || "" }; }
function downloadText(text, name, type="application/json") { const blob = new Blob([text], {type}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function makeQR(text) { return `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(text)}`; }

function normalizeWhatsappNumber(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "90" + p.slice(1);
  else if (p.length === 10) p = "90" + p;
  return p;
}
function whatsappMessage(row, type = "invoice") {
  const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
  const route = `${row.nereden || "-"} → ${row.nereye || "-"}`;
  const templates = {
    payment: `${COMPANY}\nTel: ${PHONE}\nSayın ${row.musteri || "müşterimiz"}, ${row.serial || ""} numaralı sefer için kalan ödemeniz: ${fmt(debt)}.\nGüzergah: ${route}\nTarih: ${row.tarih || "-"}\nTeşekkür ederiz.`,
    received: `${COMPANY}\nTel: ${PHONE}\nSayın ${row.musteri || "müşterimiz"}, aracınız teslim alınmıştır.\nSefer: ${row.serial || "-"}\nGüzergah: ${route}`,
    delivered: `${COMPANY}\nTel: ${PHONE}\nSayın ${row.musteri || "müşterimiz"}, aracınız teslim edilmiştir.\nSefer: ${row.serial || "-"}\nGüzergah: ${route}\nBizi tercih ettiğiniz için teşekkür ederiz.`,
    invoice: `${COMPANY}\nTel: ${PHONE}\nSefer No: ${row.serial || "-"}\nTarih: ${row.tarih || "-"}\nMüşteri: ${row.musteri || "-"}\nGüzergah: ${route}\nTutar: ${fmt(row.tutar)}\nÖdenen: ${fmt(row.paidAmount)}\nKalan: ${fmt(debt)}\nDurum: ${statusLabel(row.tripStatus)}`
  };
  return templates[type] || templates.invoice;
}
function whatsappUrl(row, type = "invoice") {
  const phone = normalizeWhatsappNumber(row.phone);
  if (!phone) return "";
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(whatsappMessage(row, type))}`;
}

function defaultPermissionsFor(role) {
  if (role === "admin") return { edit: true, delete: true, reports: true, settings: true };
  if (role === "staff") return { edit: true, delete: false, reports: true, settings: false };
  return { edit: false, delete: false, reports: false, settings: false };
}
function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const permissions = { ...defaultPermissionsFor(user.role), ...(user.permissions || {}) };
  return !!permissions[key];
}

const ROLE_PAGE_ACCESS = {
  admin: ["dashboard","operations","trips","customers","drivers","fleet","finance","ai","enterprise","notifications","settings","branches","vehicles","documents","map","calendar","accounting","expenses","archive","reports","logs","cloud","pwa","protools","saas","franchise","aibrain","tower","ecosystem","aios","collab","collabpro","ops2","driverpayroll"],
  staff: ["dashboard","operations","trips","customers","drivers","fleet","finance","ai","enterprise","notifications","vehicles","documents","map","calendar","accounting","expenses","archive","reports","aibrain","tower","collab","collabpro","ops2","driverpayroll"],
  driver: ["dashboard","drivers","trips","notifications"]
};
function canOpenPage(user, page) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const allowed = ROLE_PAGE_ACCESS[user.role] || ROLE_PAGE_ACCESS.driver;
  return allowed.includes(page) || (page === "seferler" && allowed.includes("trips"));
}
function roleLabelTR(role) {
  return role === "admin" ? "Yönetici" : role === "staff" ? "Operasyon / Personel" : "Şoför";
}
function safeHtml(v) { return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }


async function exportRealPdfFromHtml({ html, filename, orientation = "portrait" }) {
  let html2canvasModule;
  let jsPdfModule;
  try {
    html2canvasModule = await import("html2canvas");
    jsPdfModule = await import("jspdf");
  } catch (error) {
    alert("PDF için gerekli paketler eksik. Terminalde çalıştırın: npm install jspdf html2canvas");
    throw error;
  }
  const html2canvas = html2canvasModule.default || html2canvasModule;
  const { jsPDF } = jsPdfModule;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = orientation === "landscape" ? "1123px" : "794px";
  host.style.maxWidth = host.style.width;
  host.style.background = "#ffffff";
  host.style.overflow = "visible";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await new Promise(resolve => setTimeout(resolve, 350));
    const canvas = await html2canvas(host, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: host.scrollWidth, windowHeight: host.scrollHeight, width: host.scrollWidth, height: host.scrollHeight, scrollX: 0, scrollY: 0 });
    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgData = canvas.toDataURL("image/png", 0.98);
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight, undefined, "FAST");
    } else {
      let position = 0;
      let remaining = imgHeight;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight, undefined, "FAST");
        remaining -= pageHeight;
        position -= pageHeight;
        if (remaining > 0) pdf.addPage();
      }
    }
    pdf.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}

function invoicePdfHtml(row) {
  const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
  const paidRate = (Number(row.tutar)||0) ? Math.min(Math.round(((Number(row.paidAmount)||0) / (Number(row.tutar)||1)) * 100), 100) : 0;
  const qrText = `${COMPANY}\n${row.serial}\n${row.musteri}\n${row.nereden} → ${row.nereye}\nToplam: ${fmt(row.tutar)}\nKalan: ${fmt(debt)}`;
  return `<div style="width:794px;height:1123px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#102033;box-sizing:border-box;padding:28px;display:flex;flex-direction:column;">
    <div style="background:linear-gradient(135deg,#12385c,#1f6fae);color:#fff;border-radius:18px;padding:28px;display:flex;justify-content:space-between;gap:20px;">
      <div><div style="font-size:26px;font-weight:1000;color:#ffb36b;line-height:1.05;">${safeHtml(COMPANY)}</div><div style="font-size:12px;font-weight:900;margin-top:8px;">Profesyonel Oto Transfer Hizmeti</div><div style="font-size:12px;font-weight:900;margin-top:4px;">Tel: ${safeHtml(PHONE)}</div></div>
      <div style="text-align:right;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);border-radius:16px;padding:14px;min-width:210px;"><div style="font-size:27px;font-weight:1000;">FATURA</div><div style="font-size:12px;font-weight:900;line-height:1.7;margin-top:8px;">Sefer No: ${safeHtml(row.serial||'-')}<br/>Tarih: ${safeHtml(row.tarih||'-')}<br/>PDF: ${new Date().toLocaleString('tr-TR')}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:20px;">
      ${[['Toplam',fmt(row.tutar),'#12385c'],['Ödenen',fmt(row.paidAmount),'#15803d'],['Kalan',fmt(debt),'#dc2626'],['Ödeme Oranı','%'+paidRate,'#12385c']].map(x=>`<div style="border:1px solid #dbe7f3;background:#f8fbff;border-radius:14px;padding:13px;min-height:78px;"><div style="font-size:10px;color:#64748b;font-weight:1000;text-transform:uppercase;">${x[0]}</div><div style="font-size:20px;color:${x[2]};font-weight:1000;margin-top:10px;">${x[1]}</div>${x[0]==='Ödeme Oranı'?`<div style="height:8px;background:#e2e8f0;border-radius:999px;margin-top:8px;overflow:hidden;"><div style="height:100%;width:${paidRate}%;background:#22c55e;"></div></div>`:''}</div>`).join('')}
    </div>
    <h3 style="border-left:5px solid #ff7a1a;padding-left:10px;color:#12385c;margin:22px 0 10px;font-size:16px;">Müşteri ve Sefer Bilgileri</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${[['Müşteri',row.musteri],['Telefon',row.phone||'-'],['Şoför',row.driver||'-'],['Araç / Plaka',row.plaka||'-'],['Nereden',row.nereden||'-'],['Nereye',row.nereye||'-']].map(x=>`<div style="border:1px solid #dbe7f3;background:#fbfdff;border-radius:14px;padding:13px;min-height:62px;"><div style="font-size:10px;color:#64748b;font-weight:1000;text-transform:uppercase;">${safeHtml(x[0])}</div><div style="font-size:15px;font-weight:1000;margin-top:7px;">${safeHtml(x[1])}</div></div>`).join('')}
    </div>
    <h3 style="border-left:5px solid #ff7a1a;padding-left:10px;color:#12385c;margin:22px 0 10px;font-size:16px;">Finansal Detay</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;overflow:hidden;border-radius:12px;"><thead><tr><th style="background:#12385c;color:white;text-align:left;padding:11px;">Açıklama</th><th style="background:#12385c;color:white;text-align:right;padding:11px;">Tutar</th></tr></thead><tbody>
      ${[['Toplam Hizmet Bedeli',fmt(row.tutar)],['Ödenen Tutar',fmt(row.paidAmount)],['Kalan Borç',fmt(debt)],['Portif / Komisyon',fmt(row.portifUcr)],['Toplam Gider',fmt(expenses(row))],['Gerçek Kâr',fmt(realProfit(row))]].map((x,i)=>`<tr><td style="border:1px solid #dbe7f3;padding:11px;font-weight:900;background:${i%2?'#f8fbff':'#fff'};">${x[0]}</td><td style="border:1px solid #dbe7f3;padding:11px;text-align:right;font-weight:1000;background:${i%2?'#f8fbff':'#fff'};">${x[1]}</td></tr>`).join('')}
    </tbody></table>
    <div style="margin-top:auto;display:grid;grid-template-columns:1fr 130px;gap:14px;align-items:stretch;">
      <div style="border:1px dashed #ffb36b;background:#fff8ef;border-radius:14px;padding:14px;font-size:13px;font-weight:900;min-height:92px;"><b>Not:</b><br/>${safeHtml(row.not || 'Bu belge sistem tarafından oluşturulmuştur.')}</div>
      <div style="border:1px solid #dbe7f3;border-radius:14px;text-align:center;padding:10px;"><img alt="QR" src="${makeQR(qrText)}" style="width:95px;height:95px;"/><div style="font-size:10px;color:#64748b;font-weight:1000;">QR SEFER</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:24px;"><div style="border-top:2px solid #94a3b8;text-align:center;padding-top:9px;font-weight:1000;font-size:12px;">Firma Yetkilisi</div><div style="border-top:2px solid #94a3b8;text-align:center;padding-top:9px;font-weight:1000;font-size:12px;">Müşteri / Teslim Alan</div></div>
  </div>`;
}

function reportPdfHtml(title, rows) {
  const safe = safeHtml;
  const rowsPerPage = rows.length <= 1 ? 1 : 13;
  const pages = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) pages.push(rows.slice(i, i + rowsPerPage));
  if (!pages.length) pages.push([]);
  const all = rows.reduce((acc,r)=>({
    total:acc.total+(+r.tutar||0),
    paidTotal:acc.paidTotal+(+r.paidAmount||0),
    debt:acc.debt+Math.max((+r.tutar||0)-(+r.paidAmount||0),0),
    portif:acc.portif+(+r.portifUcr||0),
    gider:acc.gider+expenses(r),
    profit:acc.profit+realProfit(r)
  }), {total:0,paidTotal:0,debt:0,portif:0,gider:0,profit:0});
  const headerCells = ['No','Tarih','Müşteri','Telefon','Şoför','Araç','Güzergah','Tutar','Ödenen','Kalan','Gider','Kâr','Ödeme','Durum','Not'];
  const colWidths = ['7%','6%','10%','8%','8%','7%','13%','7%','7%','7%','6%','6%','5%','6%','7%'];
  const renderPage = (pageRows, pageIndex) => {
    const s = pageRows.reduce((acc,r)=>({ total:acc.total+(+r.tutar||0), paidTotal:acc.paidTotal+(+r.paidAmount||0), debt:acc.debt+Math.max((+r.tutar||0)-(+r.paidAmount||0),0), gider:acc.gider+expenses(r), profit:acc.profit+realProfit(r)}), {total:0,paidTotal:0,debt:0,gider:0,profit:0});
    const summary = pageIndex === 0 ? all : s;
    return `<div class="pdf-a4-page" style="width:1123px;min-height:794px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#102033;box-sizing:border-box;padding:0 8px 8px;page-break-after:${pageIndex < pages.length-1 ? 'always' : 'auto'};break-after:${pageIndex < pages.length-1 ? 'page' : 'auto'};">
      <div style="margin:0 -8px;background:linear-gradient(135deg,#12385c,#1f6fae);color:white;padding:13px 18px;display:flex;justify-content:space-between;align-items:center;gap:14px;box-sizing:border-box;">
        <div><div style="font-size:26px;font-weight:1000;color:#ffb36b;line-height:1;">${safe(COMPANY)}</div><div style="font-size:18px;font-weight:1000;margin-top:5px;">${safe(title)}</div><div style="font-size:11px;font-weight:900;margin-top:4px;opacity:.95;">Tel: ${safe(PHONE)}</div></div>
        <div style="text-align:right;font-size:11px;font-weight:900;line-height:1.55;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:8px 11px;min-width:180px;">PDF Tarihi: ${new Date().toLocaleString('tr-TR')}<br/>Kayıt: ${rows.length}<br/>Sayfa: ${pageIndex+1}/${pages.length}<br/>Tahsilat: %${all.total?Math.round((all.paidTotal/all.total)*100):0}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:7px 0;">${[['Toplam',fmt(summary.total),'#12385c'],['Tahsilat',fmt(summary.paidTotal),'#15803d'],['Alacak',fmt(summary.debt),'#dc2626'],['Gider',fmt(summary.gider),'#f97316'],['Net Kâr',fmt(summary.profit),'#15803d']].map(x=>`<div style="border:1px solid #dbe7f3;background:#f8fbff;border-radius:8px;padding:6px 7px;min-height:40px;box-sizing:border-box;"><div style="font-size:8.5px;color:#64748b;font-weight:1000;text-transform:uppercase;letter-spacing:.03em;">${x[0]}</div><div style="font-size:12px;color:${x[2]};font-weight:1000;margin-top:4px;white-space:nowrap;">${x[1]}</div></div>`).join('')}</div>
      <table style="width:100%;border-collapse:collapse;font-size:6.9px;table-layout:fixed;"><colgroup>${colWidths.map(w=>`<col style="width:${w}"/>`).join('')}</colgroup><thead><tr>${headerCells.map((h,i)=>`<th style="background:#12385c;color:white;text-align:left;padding:3.2px 2px;border:1px solid #0f2f4d;font-size:6.8px;line-height:1.05;${i>=7&&i<=11?'text-align:right;':''}">${h}</th>`).join('')}</tr></thead><tbody>
      ${pageRows.map((r,i)=>{const debt=Math.max((+r.tutar||0)-(+r.paidAmount||0),0); const values=[r.serial,r.tarih,r.musteri,r.phone||'-',r.driver||'-',r.plaka||'-',`${r.nereden||'-'} → ${r.nereye||'-'}`,fmt(r.tutar),fmt(r.paidAmount),fmt(debt),fmt(expenses(r)),fmt(realProfit(r)),paymentLabel(paymentStatus(r)),statusLabel(r.tripStatus),r.not||'']; return `<tr>${values.map((v,idx)=>`<td style="border:1px solid #dbe7f3;padding:2.8px 2px;font-weight:800;word-break:break-word;overflow-wrap:anywhere;line-height:1.08;vertical-align:top;background:${i%2?'#f8fbff':'#fff'};${idx>=7&&idx<=11?'text-align:right;white-space:nowrap;font-weight:1000;':''}">${safe(v)}</td>`).join('')}</tr>`}).join('')}
      ${pageRows.length < rowsPerPage ? Array.from({length: rowsPerPage - pageRows.length}).map(()=>`<tr>${headerCells.map(()=>`<td style="border:1px solid #eef2f7;padding:2.8px 2px;height:13px;background:#fff;"></td>`).join('')}</tr>`).join('') : ''}
      </tbody></table>
      <div style="margin-top:6px;color:#64748b;font-size:8.5px;font-weight:900;display:flex;justify-content:space-between;"><span>Bu PDF sistem tarafından oluşturulmuştur. Tüm bilgiler tabloya sığacak şekilde otomatik küçültülmüştür.</span><span>${safe(COMPANY)} • ${safe(PHONE)}</span></div>
    </div>`;
  };
  return `<div style="width:1123px;background:#fff;">${pages.map(renderPage).join('')}</div>`;
}

function Button({ children, onClick, type="button", className="" }) { return <button type={type} onClick={onClick} className={"btn " + className}>{children}</button>; }
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

function LoginPage({ users, onLogin, dark, setDark }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  function submit(e) {
    e.preventDefault();
    const u = users.find(x => x.username === username && checkPassword(x.password, password) && x.active);
    if (!u) return setError("Kullanıcı adı veya şifre hatalı.");
    onLogin(u);
  }
  return <div className={"login-page " + (dark ? "dark" : "") }>
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><h1>SEYİTOĞULLARI KILIÇBEY</h1><h2>OTO TRANSFER</h2><p>Tel: {PHONE}</p></div>
      <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Kullanıcı adı" autoFocus />
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Şifre" />
      {error && <div className="login-error">{error}</div>}
      <Button type="submit">Giriş Yap</Button>
      <button type="button" className="theme-link" onClick={()=>setDark(v=>!v)}>{dark ? "☀️ Gündüz modu" : "🌙 Gece modu"}</button>
    </form>
  </div>;
}

export default function App() {

  const [dark, setDark] = useState(false);
  const [users, setUsers] = useState(() => { try { return JSON.parse(localStorage.getItem(USER_KEY)) || initialUsers; } catch { return initialUsers; } });
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("seyitogullari_current_user")); } catch { return null; } });
  const [drivers, setDrivers] = useState(() => { try { return JSON.parse(localStorage.getItem(DRIVER_KEY)) || initialDrivers; } catch { return initialDrivers; } });
  const [vehicles, setVehicles] = useState(() => { try { return JSON.parse(localStorage.getItem(VEHICLE_KEY)) || initialVehicles; } catch { return initialVehicles; } });
  const [documents, setDocuments] = useState(() => { try { return JSON.parse(localStorage.getItem(DOCUMENT_KEY)) || initialDocuments; } catch { return initialDocuments; } });
  const [branches, setBranches] = useState(() => { try { return JSON.parse(localStorage.getItem(BRANCH_KEY)) || initialBranches; } catch { return initialBranches; } });
  const [selectedBranch, setSelectedBranch] = useState(() => localStorage.getItem(SELECTED_BRANCH_KEY) || "merkez");
  const [receipts, setReceipts] = useState(() => { try { return JSON.parse(localStorage.getItem(RECEIPT_KEY)) || []; } catch { return []; } });
  const [logs, setLogs] = useState(() => { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; } });
  const [data, setData] = useState(() => { try { return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialData).map(normalizeRow); } catch { return initialData.map(normalizeRow); } });
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [dest, setDest] = useState("");
  const [pay, setPay] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [dateMode, setDateMode] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [toast, setToast] = useState(null);
  const [driverLinkModal, setDriverLinkModal] = useState(null);
  const toastTimer = useRef(null);
  function showToast(title, message, ms = 2400) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ title, message });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [inlineEditId, setInlineEditId] = useState(null);
  const [form, setForm] = useState(emptyRow);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmBox, setConfirmBox] = useState(null);
  const [bulkReminder, setBulkReminder] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [themeName, setThemeName] = useState(() => localStorage.getItem(THEME_KEY) || "corporate");
  const [brandAssets, setBrandAssets] = useState(() => { try { return JSON.parse(localStorage.getItem(BRAND_ASSETS_KEY)) || {}; } catch { return {}; } });
  const [enterpriseConfig, setEnterpriseConfig] = useState(() => { try { return JSON.parse(localStorage.getItem(ENTERPRISE_CONFIG_KEY)) || defaultEnterpriseConfig(); } catch { return defaultEnterpriseConfig(); } });
  const [apiKeys, setApiKeys] = useState(() => { try { return JSON.parse(localStorage.getItem(ENTERPRISE_API_KEYS_KEY)) || {}; } catch { return {}; } });
  const [openDocs, setOpenDocs] = useState([]);
  const [cloudSyncState, setCloudSyncState] = useState(() => ({ status: getSyncMeta().status || "local", meta: getSyncMeta(), backupMeta: getCloudBackupMeta() }));
  const syncBootRef = useRef(false);
  const syncDebounceRef = useRef(null);
  const dateRef = useRef(null);

  useEffect(() => { 
    try { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); 
    } catch(e) { 
      console.warn("localStorage dolu, eski loglar temizleniyor.", e);
      try { localStorage.removeItem(LOG_KEY); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }
  }, [data]);
  useEffect(() => { localStorage.setItem(USER_KEY, JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem(DRIVER_KEY, JSON.stringify(drivers)); }, [drivers]);
  useEffect(() => { localStorage.setItem(VEHICLE_KEY, JSON.stringify(vehicles)); }, [vehicles]);
  useEffect(() => { localStorage.setItem(DOCUMENT_KEY, JSON.stringify(documents)); }, [documents]);
  useEffect(() => { localStorage.setItem(BRANCH_KEY, JSON.stringify(branches)); }, [branches]);
  useEffect(() => { localStorage.setItem(SELECTED_BRANCH_KEY, selectedBranch); }, [selectedBranch]);
  useEffect(() => { localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipts.slice(0, 500))); }, [receipts]);
  useEffect(() => { localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 200))); }, [logs]);
  useEffect(() => { if (currentUser) sessionStorage.setItem("seyitogullari_current_user", JSON.stringify(currentUser)); else sessionStorage.removeItem("seyitogullari_current_user"); }, [currentUser]);
  useEffect(() => { localStorage.setItem(THEME_KEY, themeName); }, [themeName]);
  useEffect(() => { localStorage.setItem(BRAND_ASSETS_KEY, JSON.stringify(brandAssets)); }, [brandAssets]);
  useEffect(() => { localStorage.setItem(ENTERPRISE_CONFIG_KEY, JSON.stringify(enterpriseConfig)); }, [enterpriseConfig]);
  useEffect(() => { localStorage.setItem(ENTERPRISE_API_KEYS_KEY, JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { const t = setTimeout(() => setAppLoading(false), 650); return () => clearTimeout(t); }, []);
  useEffect(() => { setUsers(prev => prev.map(u => ({ ...u, permissions: { ...defaultPermissionsFor(u.role), ...(u.permissions || {}) } }))); }, []);


  useEffect(() => {
    let cancelled = false;
    async function bootCloudSync() {
      setCloudSyncState(prev => ({ ...prev, status: navigator.onLine ? "checking" : "offline" }));
      const cloud = await loadCloudSnapshot();
      if (cancelled) return;
      if (cloud.ok) {
        if (cloud.data?.length) setData(prev => mergeById(prev, cloud.data).map(normalizeRow));
        if (cloud.drivers?.length) setDrivers(prev => mergeById(prev, cloud.drivers));
        if (cloud.vehicles?.length) setVehicles(prev => mergeById(prev, cloud.vehicles));
        if (cloud.receipts?.length) setReceipts(prev => mergeById(prev, cloud.receipts));
        if (cloud.users?.length) setUsers(prev => mergeById(prev, cloud.users));
        setCloudSyncState({ status: "synced", meta: getSyncMeta(), message: "Cloud verileri yüklendi." });
      } else {
        setCloudSyncState({ status: cloud.mode || "local", meta: getSyncMeta(), message: cloud.message || "Yerel mod aktif." });
      }
      syncBootRef.current = true;
    }
    bootCloudSync();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!syncBootRef.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(async () => {
      setCloudSyncState(prev => ({ ...prev, status: navigator.onLine ? "syncing" : "offline" }));
      const result = await pushCloudSnapshot({ data, drivers, vehicles, receipts, users });
      if (result.ok && shouldCreateCloudBackup()) await createCloudBackup({ data, drivers, vehicles, receipts, users, documents, logs, company: getCompanySettings() }, "auto-daily");
      setCloudSyncState({ status: result.mode || (result.ok ? "synced" : "local"), meta: getSyncMeta(), backupMeta: getCloudBackupMeta(), message: result.message || "Senkronizasyon tamamlandı.", counts: result.counts });
    }, 1200);
    return () => syncDebounceRef.current && clearTimeout(syncDebounceRef.current);
  }, [data, drivers, vehicles, receipts, users, documents, logs]);

  useEffect(() => {
    function onOnline() {
      pushCloudSnapshot({ data, drivers, vehicles, receipts, users }).then(async result => {
        if (result.ok && shouldCreateCloudBackup()) await createCloudBackup({ data, drivers, vehicles, receipts, users, documents, logs, company: getCompanySettings() }, "auto-online");
        setCloudSyncState({ status: result.mode || (result.ok ? "synced" : "local"), meta: getSyncMeta(), backupMeta: getCloudBackupMeta(), message: result.message || "İnternet geldi, veriler eşitlendi.", counts: result.counts });
      });
    }
    function onOffline() { setCloudSyncState(prev => ({ ...prev, status: "offline", message: "İnternet yok; kayıtlar yerelde bekliyor." })); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [data, drivers, vehicles, receipts, users, documents, logs]);

  async function manualCloudSync() {
    setCloudSyncState(prev => ({ ...prev, status: "syncing", message: "Manuel senkronizasyon başladı." }));
    const result = await pushCloudSnapshot({ data, drivers, vehicles, receipts, users });
    const backupResult = result.ok ? await createCloudBackup({ data, drivers, vehicles, receipts, users, documents, logs, company: getCompanySettings() }, "manual") : null;
    setCloudSyncState({ status: result.mode || (result.ok ? "synced" : "local"), meta: getSyncMeta(), backupMeta: getCloudBackupMeta(), message: backupResult?.ok ? "Senkronizasyon ve cloud backup tamamlandı." : (result.message || "Manuel senkronizasyon tamamlandı."), counts: result.counts });
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0,10);
    try {
      const saved = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || "{}");
      if (saved.date !== today) localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify({ date: today, data, users, drivers, vehicles, documents, receipts, logs, company: getCompanySettings() }));
    } catch {}
  }, [data, users, drivers, vehicles, documents, receipts, logs]);

  function addLog(action, row = null) { setLogs(prev => [{ id: Date.now(), date: new Date().toLocaleString("tr-TR"), user: currentUser?.name || "Sistem", action, detail: row ? `${row.serial || ""} ${row.musteri || ""} ${row.nereye || ""}` : "" }, ...prev]); }

  const destinations = [...new Set(data.map(r=>r.nereye).filter(Boolean))].sort();
  const months = [...new Set(data.map(r=>monthKey(r.tarih)).filter(Boolean))].sort().reverse();
  const driverNames = [...new Set([...drivers.map(d=>d.name), ...data.map(r=>r.driver)].filter(Boolean))].sort();
  const canEdit = hasPermission(currentUser, "edit");
  const canDelete = hasPermission(currentUser, "delete");
  const canReports = hasPermission(currentUser, "reports");
  const canSettings = hasPermission(currentUser, "settings");
  // === تبويبات مبسطة جديدة (7 تبويبات فقط) ===
  const mainNavTabs = useMemo(() => [
    ["dashboard", "📊 Dashboard"],
    ["seferler", "🚛 Seferler"],
    ["customers", "👥 Müşteriler"],
    ["drivers", "🚚 Şoförler"],
    ["finance", "💼 Finans"],
    ["fleet", "🚗 Araç & Filo"],
    ...(canSettings ? [["settings", "⚙️ Ayarlar"]] : [])
  ].filter(([key]) => canOpenPage(currentUser, key) || key === "seferler"), [currentUser, canSettings]);

  useEffect(() => {
    if (currentUser && !canOpenPage(currentUser, tab)) {
      setTab(currentUser.role === "driver" ? "drivers" : "dashboard");
    }
  }, [currentUser, tab]);

  const filtered = useMemo(() => data.filter(r => {
    if (selectedBranch !== "all" && (r.branchId || "merkez") !== selectedBranch) return false;
    if (!smartMatch(r, query)) return false;
    if (dest && r.nereye !== dest) return false;
    if (pay && paymentStatus(r) !== pay) return false;
    if (driverFilter && r.driver !== driverFilter) return false;
    if (dateMode === "day" && selectedDate) return dateKey(r.tarih) === selectedDate;
    if (dateMode === "month" && selectedMonth) return monthKey(r.tarih) === selectedMonth;
    if (dateMode === "range" && (startDate || endDate)) { const k = dateKey(r.tarih); return (!startDate || k >= startDate) && (!endDate || k <= endDate); }
    return true;
  }).sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih))), [data, query, dest, pay, driverFilter, dateMode, selectedDate, selectedMonth, startDate, endDate, selectedBranch]);

  const stats = useMemo(() => summarizeRows(filtered), [filtered]);

  useEffect(() => {
    function onKey(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === "k" || k === "ن") { e.preventDefault(); setCommandOpen(true); setCommandQuery(""); }
      if (k === "n") { e.preventDefault(); setTab("seferler"); setShowAdd(true); setInlineEditId(null); setForm(emptyRow); }
      if (k === "f") { e.preventDefault(); setTab("seferler"); setTimeout(()=>document.querySelector('.search')?.focus(), 50); }
      if (k === "p") { e.preventDefault(); printReport("Hızlı Yazdırma Raporu", filtered); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered]);
  const branchData = useMemo(() => selectedBranch === "all" ? data : data.filter(r => (r.branchId || "merkez") === selectedBranch), [data, selectedBranch]);
  const dashboardStats = useMemo(() => summarizeRows(branchData), [branchData]);
  const routes = Object.entries(branchData.reduce((a,r)=>{ const k=`${r.nereden} → ${r.nereye}`; a[k]=(a[k]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const customers = useMemo(() => getCustomers(branchData), [branchData]);
  const delayedRows = branchData.filter(r => !["delivered","invoiced","closed"].includes(r.tripStatus) && r.tutar > 0 && daysBetween(r.tarih) >= 2);

  function summarizeRows(rows) { const total = rows.reduce((s,r)=>s+(Number(r.tutar)||0),0); const paidTotal = rows.reduce((s,r)=>s+(Number(r.paidAmount)||0),0); const debt = rows.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0); const portif = rows.reduce((s,r)=>s+(Number(r.portifUcr)||0),0); const gider = rows.reduce((s,r)=>s+expenses(r),0); return { total, paidTotal, debt, portif, gider, profit: total-portif-gider, trips: rows.length }; }
  function getCustomers(rows) { return Object.entries(rows.reduce((a,r)=>{ const k=r.musteri||"-"; if(!a[k]) a[k]={ phone:r.phone||"", trips:0,total:0,paid:0,debt:0,last:r.tarih }; a[k].phone = a[k].phone || r.phone || ""; a[k].trips++; a[k].total+=r.tutar; a[k].paid+=r.paidAmount; a[k].debt+=Math.max(r.tutar-r.paidAmount,0); if(dateKey(r.tarih)>dateKey(a[k].last)) a[k].last=r.tarih; return a; },{})).sort((a,b)=>b[1].total-a[1].total); }

  function saveRow(e) {
    e?.preventDefault();
    if (!canEdit) return showToast("⛔ Yetki Hatası", "Bu işlem için yetkiniz yok.", 3000);
    if (!form.musteri || !form.nereden || !form.nereye) return showToast("⚠️ Eksik Bilgi", "Müşteri, nereden ve nereye alanları zorunludur.", 3000);
    const maxSerial = data.reduce((max, r) => {
      const m = String(r.serial || "").match(/(\d+)$/);
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    const serial = form.serial || `SK-${new Date().getFullYear()}-${String(maxSerial + 1).padStart(4,"0")}`;
    const tutar = Number(form.tutar) || 0;
    const paidAmount = Math.min(Number(form.paidAmount) || 0, tutar);
    const validatedForm = { ...form, paidAmount };
    const row = normalizeRow({ ...validatedForm, branchId: selectedBranch === "all" ? "merkez" : selectedBranch, serial, tarih: form.tarih || inputToTRDate(new Date().toISOString().slice(0,10)), portifUcr: form.portifUcr || Math.round(tutar * 0.1) });
    if (inlineEditId) { setData(prev => prev.map(r => r.id === inlineEditId ? { ...row, id:inlineEditId } : r)); setInlineEditId(null); setSelectedRow(null); addLog("Sefer güncellendi", row); }
    else { const newRow = { ...row, id: Date.now() }; setData(prev => [newRow, ...prev]); setShowAdd(false); addLog("Yeni sefer eklendi", newRow); }
    setForm(emptyRow);
  }
  function startEdit(r) { if (!canEdit) return showToast("⛔ Yetki Hatası", "Bu işlem için yetkiniz yok.", 3000); setInlineEditId(r.id); setForm({ ...r }); setSelectedRow(r.id); }
  function deleteRow(id) {
    if (!canDelete) return showToast("⛔ Yetki Hatası", "Silme işlemi sadece yöneticiye açıktır.", 3000);

    const row = data.find(x => x.id === id);

    setConfirmBox({
      icon: "🗑️",
      title: "Sefer silinsin mi?",
      message: `${row?.musteri || "Bu sefer"} kaydı kalıcı olarak silinecek.`,
      details: row ? `${row.serial || ""} • ${row.tarih || ""} • ${row.nereden || ""} → ${row.nereye || ""}` : "",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      danger: true,
      onConfirm: () => {
        setData(prev => prev.filter(r => r.id !== id));
        addLog("Sefer silindi", row);
        setConfirmBox(null);
      },
      onCancel: () => setConfirmBox(null)
    });
  }
  function bulkDeleteSelected() {
    if (!canDelete) return showToast("⛔ Yetki Hatası", "Silme işlemi sadece yöneticiye açıktır.", 3000);
    if (!selectedIds.length) return showToast("⚠️ Uyarı", "Silmek için önce kayıt seçin.", 2500);
    setConfirmBox({
      icon: "🗑️",
      title: "Seçili seferler silinsin mi?",
      message: `${selectedIds.length} kayıt kalıcı olarak silinecek.`,
      details: "Bu işlem geri alınamaz.",
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      danger: true,
      onConfirm: () => {
        setData(prev => prev.filter(r => !selectedIds.includes(r.id)));
        addLog(`Toplu sefer silindi (${selectedIds.length})`);
        setSelectedIds([]);
        setConfirmBox(null);
      },
      onCancel: () => setConfirmBox(null)
    });
  }
  function selectedRows() { return data.filter(r => selectedIds.includes(r.id)); }
  function reportTargetRows() {
    const rows = selectedRows();
    return rows.length ? rows : filtered;
  }
  function reportTargetTitle(base = "Seferler Raporu") {
    return selectedIds.length ? `Seçili ${base}` : `Genel ${base}`;
  }
  function printSelectedRows() {
    const rows = reportTargetRows();
    if (!rows.length) return showToast("⚠️ Uyarı", "Rapor oluşturmak için uygun kayıt bulunamadı.", 2500);
    printReport(reportTargetTitle("Seferler Raporu"), rows);
  }
  function pdfSelectedRows() {
    const rows = reportTargetRows();
    if (!rows.length) return showToast("⚠️ Uyarı", "PDF oluşturmak için uygun kayıt bulunamadı.", 2500);
    reportPdf(reportTargetTitle("Seferler Raporu"), rows);
  }
  function excelSelectedRows() {
    const rows = reportTargetRows();
    if (!rows.length) return showToast("⚠️ Uyarı", "Excel oluşturmak için uygun kayıt bulunamadı.", 2500);
    exportExcel(reportTargetTitle("Seferler"), rows);
  }

  function updateTripStatus(id, status) { const row = data.find(r=>r.id===id); const event = { id: Date.now(), date: new Date().toLocaleString("tr-TR"), status, title: `Durum: ${statusLabel(status)}`, note: `${currentUser?.name || "Sistem"} tarafından güncellendi` }; setData(prev => prev.map(r => r.id === id ? { ...r, tripStatus: status, tripTimeline: [...(r.tripTimeline || []), event] } : r)); addLog(`Sefer durumu değişti: ${statusLabel(status)}`, row); }
  function updateTripAdvanced(id, patch, logText="Sefer detayı güncellendi") { const row=data.find(r=>r.id===id); setData(prev=>prev.map(r=>r.id===id?normalizeRow({ ...r, ...patch }):r)); addLog(logText, row); }
  function resetFilters() { setQuery(""); setDest(""); setPay(""); setDriverFilter(""); setDateMode("all"); setSelectedDate(""); setSelectedMonth(""); setStartDate(""); setEndDate(""); }
  function backup() { downloadText(JSON.stringify({ generatedAt: new Date().toISOString(), company: getCompanySettings(), data, users, drivers, vehicles, documents, receipts, logs }, null, 2), `seyitogullari_backup_${new Date().toISOString().slice(0,10)}.json`); }
  function importBackup(e) { const file=e.target.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{ try{ const parsed=JSON.parse(reader.result); if(Array.isArray(parsed)) setData(parsed.map(normalizeRow)); else { if (Array.isArray(parsed.data)) setData(parsed.data.map(normalizeRow)); if (Array.isArray(parsed.users)) setUsers(parsed.users); if (Array.isArray(parsed.drivers)) setDrivers(parsed.drivers); if (Array.isArray(parsed.vehicles)) setVehicles(parsed.vehicles); if (Array.isArray(parsed.documents)) setDocuments(parsed.documents); if (Array.isArray(parsed.receipts)) setReceipts(parsed.receipts); if (Array.isArray(parsed.logs)) setLogs(parsed.logs); if (parsed.company) localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(parsed.company)); } addLog("Yedek yüklendi"); }catch{ alert("Yedek dosyası okunamadı."); } }; reader.readAsText(file); e.target.value=""; }

  function invoice(row) {
    const safe = (v) => String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
    const paidRate = (Number(row.tutar)||0) ? Math.min(Math.round(((Number(row.paidAmount)||0) / (Number(row.tutar)||1)) * 100), 100) : 0;
    const qrText = `${COMPANY}\n${row.serial}\n${row.musteri}\n${row.nereden} → ${row.nereye}\nToplam: ${fmt(row.tutar)}\nKalan: ${fmt(debt)}`;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${safe(row.serial || "Fatura")}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; height: 297mm; margin: 0; padding: 0; overflow: hidden; }
    body { background: #edf3f8; color: #152238; font-family: Arial, Helvetica, sans-serif; }
    .page { width: 210mm; height: 297mm; margin: 0 auto; background: #fff; overflow: hidden; box-shadow: 0 18px 50px rgba(15, 23, 42, .14); display: flex; flex-direction: column; }
    .hero { background: linear-gradient(135deg, #12385c, #1f6fae); color: #fff; padding: 19mm 14mm 12mm; display: flex; justify-content: space-between; gap: 14px; min-height: 47mm; }
    .brand { font-size: 26px; font-weight: 1000; letter-spacing: .3px; color: #ffb36b; line-height: 1.02; }
    .sub { margin-top: 6px; font-weight: 900; font-size: 12px; opacity: .95; }
    .docbox { min-width: 205px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.28); border-radius: 16px; padding: 12px; text-align: right; }
    .doc-title { font-size: 24px; font-weight: 1000; color: #fff; }
    .doc-meta { margin-top: 8px; display: grid; gap: 4px; font-size: 11px; font-weight: 800; }
    .content { flex: 1; padding: 12mm 14mm 10mm; display: flex; flex-direction: column; justify-content: space-between; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 0; }
    .metric { border: 1px solid #dbe7f3; background: #f8fbff; border-radius: 14px; padding: 11px; min-height: 68px; }
    .metric span { display: block; color: #64748b; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .25px; }
    .metric b { display: block; margin-top: 7px; color: #12385c; font-size: 17px; font-weight: 1000; }
    .metric.danger b { color: #dc2626; }
    .metric.ok b { color: #15803d; }
    .section-title { margin: 0; color: #12385c; font-size: 14px; font-weight: 1000; border-left: 5px solid #ff7a1a; padding-left: 9px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
    .card { border: 1px solid #dbe7f3; background: #fbfdff; border-radius: 14px; padding: 11px; min-height: 58px; }
    .label { color: #64748b; font-size: 9.2px; font-weight: 900; text-transform: uppercase; letter-spacing: .25px; }
    .value { margin-top: 5px; font-weight: 1000; font-size: 13.5px; color: #0f172a; line-height: 1.15; }
    table { width: 100%; border-collapse: collapse; margin-top: 0; overflow: hidden; border-radius: 12px; }
    th { background: #12385c; color: #fff; text-align: left; font-size: 10px; padding: 9px 10px; }
    td { border: 1px solid #dbe7f3; padding: 9px 10px; font-size: 11.2px; font-weight: 800; }
    tr:nth-child(even) td { background: #f8fbff; }
    .money { text-align: right; font-weight: 1000; }
    .progress { margin-top: 7px; background: #e2e8f0; height: 8px; border-radius: 999px; overflow: hidden; }
    .progress div { height: 100%; width: ${paidRate}%; background: linear-gradient(90deg,#16a34a,#22c55e); }
    .footer { display: grid; grid-template-columns: 1fr 118px; gap: 12px; align-items: stretch; margin-top: 0; }
    .note-box { border: 1px dashed #ffb36b; background: #fff8ef; border-radius: 14px; padding: 11px; min-height: 72px; font-size: 11.2px; font-weight: 800; color: #334155; }
    .qr { text-align: center; border: 1px solid #dbe7f3; border-radius: 14px; padding: 8px; background: #fff; }
    .qr img { width: 86px; height: 86px; display:block; margin:0 auto 4px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 0; padding-bottom: 3mm; }
    .sig { border-top: 1.8px solid #94a3b8; padding-top: 8px; text-align: center; font-size: 11px; font-weight: 1000; color: #334155; }
    .printbar { text-align: center; padding: 9px; background: #e8f1fb; }
    .printbar button { border: 0; border-radius: 10px; background: #ff7a1a; color: #fff; padding: 9px 15px; font-weight: 1000; cursor: pointer; }
    @media print { html, body { width:210mm; height:297mm; overflow:hidden; } body { background:#fff; padding:0; } .page { width:210mm; height:297mm; box-shadow:none; border-radius:0; overflow:hidden; page-break-after:avoid; break-after:avoid; } .printbar { display:none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div>
        <div class="brand">${safe(COMPANY)}</div>
        <div class="sub">Profesyonel Oto Transfer Hizmeti</div>
        <div class="sub">Tel: ${safe(PHONE)}</div>
      </div>
      <div class="docbox">
        <div class="doc-title">FATURA</div>
        <div class="doc-meta">
          <div>Sefer No: ${safe(row.serial || "-")}</div>
          <div>Tarih: ${safe(row.tarih || "-")}</div>
          <div>Yazdırma: ${new Date().toLocaleString("tr-TR")}</div>
        </div>
      </div>
    </div>
    <div class="content">
      <div class="summary">
        <div class="metric"><span>Toplam</span><b>${fmt(row.tutar)}</b></div>
        <div class="metric ok"><span>Ödenen</span><b>${fmt(row.paidAmount)}</b></div>
        <div class="metric danger"><span>Kalan</span><b>${fmt(debt)}</b></div>
        <div class="metric"><span>Ödeme Oranı</span><b>%${paidRate}</b><div class="progress"><div></div></div></div>
      </div>
      <div class="section-title">Müşteri ve Sefer Bilgileri</div>
      <div class="grid">
        <div class="card"><div class="label">Müşteri</div><div class="value">${safe(row.musteri || "-")}</div></div>
        <div class="card"><div class="label">Telefon</div><div class="value">${safe(row.phone || "-")}</div></div>
        <div class="card"><div class="label">Şoför</div><div class="value">${safe(row.driver || "-")}</div></div>
        <div class="card"><div class="label">Araç / Plaka</div><div class="value">${safe(row.plaka || "-")}</div></div>
        <div class="card"><div class="label">Nereden</div><div class="value">${safe(row.nereden || "-")}</div></div>
        <div class="card"><div class="label">Nereye</div><div class="value">${safe(row.nereye || "-")}</div></div>
      </div>
      <div class="section-title">Finansal Detay</div>
      <table>
        <thead><tr><th>Açıklama</th><th class="money">Tutar</th></tr></thead>
        <tbody>
          <tr><td>Toplam Hizmet Bedeli</td><td class="money">${fmt(row.tutar)}</td></tr>
          <tr><td>Ödenen Tutar</td><td class="money">${fmt(row.paidAmount)}</td></tr>
          <tr><td>Kalan Borç</td><td class="money">${fmt(debt)}</td></tr>
          <tr><td>Portif / Komisyon</td><td class="money">${fmt(row.portifUcr)}</td></tr>
          <tr><td>Toplam Gider</td><td class="money">${fmt(expenses(row))}</td></tr>
          <tr><td>Gerçek Kâr</td><td class="money">${fmt(realProfit(row))}</td></tr>
        </tbody>
      </table>
      <div class="footer">
        <div class="note-box"><b>Not:</b><br/>${safe(row.not || "Bu belge sistem tarafından oluşturulmuştur.")}</div>
        <div class="qr"><img src="${makeQR(qrText)}"/><div class="label">QR SEFER</div></div>
      </div>
      <div class="signatures"><div class="sig">Firma Yetkilisi</div><div class="sig">Müşteri / Teslim Alan</div></div>
    </div>
    <div class="printbar"><button onclick="window.print()">Yazdır / PDF Kaydet</button></div>
  </div>
  <script>window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 900); });</script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("Tarayıcı: Açılır pencere engellendi. Tarayıcı ayarlarından bu site için izin verin, sonra tekrar deneyin.");
    w.document.write(html);
    w.document.close();
    addLog("Profesyonel fatura oluşturuldu", row);
  }

  async function invoicePdf(row) {
    try {
      const title = `Sefer Raporu - ${row.serial || row.musteri || "Kayıt"}`;
      await exportRealPdfFromHtml({
        html: reportPdfHtml(title, [row]),
        filename: `${(row.serial || "sefer").replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, "_")}_rapor.pdf`,
        orientation: "landscape"
      });
      showToast("PDF hazır", "Sefer PDF raporu indirildi.");
      addLog("Tek sefer PDF raporu indirildi", row);
    } catch (error) {
      console.error(error);
      showToast("⚠️ PDF Hatası", "PDF oluşturulamadı. Lütfen tekrar deneyin.", 3000);
    }
  }

  function whatsapp(row, type="invoice") {
    const url = whatsappUrl(row, type);
    if (!url) return showToast("⚠️ Telefon Yok", "Bu müşterinin telefon numarası kayıtlı değil.", 3000);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      showToast("WhatsApp", "Tarayıcı pencereyi engelledi. Açılır pencerelere izin verip tekrar deneyin.", 3500);
      return;
    }
    showToast("WhatsApp", "Mesaj WhatsApp ekranında hazırlandı.");
    addLog(`WhatsApp mesajı: ${type}`, row);
  }
  async function copyTrip(row) {
    const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
    const text = `${COMPANY}
Tel: ${PHONE}
Sefer No: ${row.serial || "-"}
Tarih: ${row.tarih || "-"}
Müşteri: ${row.musteri || "-"}
Telefon: ${row.phone || "-"}
Şoför: ${row.driver || "-"}
Araç: ${row.plaka || "-"}
Güzergah: ${row.nereden || "-"} → ${row.nereye || "-"}
Tutar: ${fmt(row.tutar)}
Ödenen: ${fmt(row.paidAmount)}
Kalan: ${fmt(debt)}
Durum: ${statusLabel(row.tripStatus)}
Not: ${row.not || "-"}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      showToast("Kopyalandı", "Sefer bilgileri panoya başarıyla kopyalandı.");
    } catch {
      window.prompt("Tarayıcı otomatik kopyalamayı engelledi. Metni buradan kopyalayın:", text);
    }
    addLog("Sefer bilgisi kopyalandı", row);
  }
  function bulkPaymentReminder(rows = filtered) {
    const debtRows = rows.filter(r => r.tutar > 0 && paymentStatus(r) !== "paid");
    const targets = debtRows.filter(r => normalizeWhatsappNumber(r.phone));
    const missing = debtRows.filter(r => !normalizeWhatsappNumber(r.phone));
    if (!targets.length) return showToast("⚠️ Uyarı", "Telefonu olan ödenmemiş kayıt bulunamadı.", 3000);
    setBulkReminder({ targets, missing });
  }
  function printReport(title, rows=filtered) {
    const safe = (v) => String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const s = summarizeRows(rows);
    const collectionRate = s.total ? Math.round((s.paidTotal / s.total) * 100) : 0;
    const reportDate = new Date().toLocaleString("tr-TR");
    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${safe(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    html, body, * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #edf3f8; color: #152238; font-family: Arial, Helvetica, sans-serif; }
    .page { background: #fff; max-width: 1280px; margin: 0 auto; border-radius: 18px; overflow: hidden; box-shadow: 0 22px 65px rgba(15,23,42,.14); }
    .head { background: linear-gradient(135deg,#12385c,#1f6fae); color: #fff; padding: 24px 28px; display: flex; justify-content: space-between; gap: 20px; }
    .brand { font-size: 27px; font-weight: 1000; color: #ffb36b; line-height: 1.05; }
    .title { font-size: 22px; font-weight: 1000; margin-top: 8px; }
    .meta { text-align: right; font-weight: 800; line-height: 1.8; font-size: 13px; }
    .content { padding: 22px 26px; }
    .sum { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 18px; }
    .box { border: 1px solid #dbe7f3; background: #f8fbff; border-radius: 15px; padding: 12px; }
    .box span { display: block; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .35px; }
    .box b { display: block; margin-top: 6px; color: #12385c; font-size: 18px; font-weight: 1000; }
    .box.ok b { color: #15803d; } .box.danger b { color: #dc2626; } .box.orange b { color: #f97316; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #12385c; color: #fff; padding: 10px 8px; text-align: left; font-size: 11px; border: 1px solid #0f2f4d; }
    td { padding: 8px; border: 1px solid #dbe7f3; font-size: 11px; font-weight: 800; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f8fbff; }
    .money { text-align: right; white-space: nowrap; font-weight: 1000; }
    .route { max-width: 220px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #dbeafe; color: #174b78; font-weight: 1000; font-size: 10px; }
    .paid { background:#dcfce7; color:#15803d; } .partial { background:#fef3c7; color:#c06c00; } .unpaid { background:#fee2e2; color:#dc2626; }
    tfoot td { background: #fff4e8; font-weight: 1000; }
    .footer { margin-top: 16px; display: flex; justify-content: space-between; color: #64748b; font-size: 11px; font-weight: 800; }
    .printbar { text-align: center; padding: 12px; background: #e8f1fb; }
    .printbar button { border: 0; border-radius: 12px; background: #ff7a1a; color: #fff; padding: 10px 18px; font-weight: 1000; cursor: pointer; }
    @media print { body { background:#edf3f8; padding:0; } .page { box-shadow:none; border-radius:18px; max-width:none; overflow:hidden; } .printbar { display:none; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div><div class="brand">${safe(COMPANY)}</div><div class="title">${safe(title)}</div><div>Tel: ${safe(PHONE)}</div></div>
      <div class="meta"><div>Rapor Tarihi: ${reportDate}</div><div>Kayıt Sayısı: ${rows.length}</div><div>Tahsilat Oranı: %${collectionRate}</div></div>
    </div>
    <div class="content">
      <div class="sum">
        <div class="box"><span>Toplam Gelir</span><b>${fmt(s.total)}</b></div>
        <div class="box ok"><span>Tahsilat</span><b>${fmt(s.paidTotal)}</b></div>
        <div class="box danger"><span>Alacak</span><b>${fmt(s.debt)}</b></div>
        <div class="box orange"><span>Portif</span><b>${fmt(s.portif)}</b></div>
        <div class="box danger"><span>Gider</span><b>${fmt(s.gider)}</b></div>
        <div class="box ok"><span>Net Kâr</span><b>${fmt(s.profit)}</b></div>
      </div>
      <table>
        <thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Telefon</th><th>Şoför</th><th>Araç</th><th>Güzergah</th><th class="money">Tutar</th><th class="money">Ödenen</th><th class="money">Kalan</th><th class="money">Gider</th><th class="money">Kâr</th><th>Ödeme</th><th>Durum</th><th>Not</th></tr></thead>
        <tbody>${rows.map(r => { const debt = Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0); const ps = paymentStatus(r); return `<tr><td>${safe(r.serial)}</td><td>${safe(r.tarih)}</td><td>${safe(r.musteri)}</td><td>${safe(r.phone||"-")}</td><td>${safe(r.driver||"-")}</td><td>${safe(r.plaka||"-")}</td><td class="route">${safe(r.nereden||"-")} → ${safe(r.nereye||"-")}</td><td class="money">${fmt(r.tutar)}</td><td class="money">${fmt(r.paidAmount)}</td><td class="money">${fmt(debt)}</td><td class="money">${fmt(expenses(r))}</td><td class="money">${fmt(realProfit(r))}</td><td><span class="badge ${ps}">${paymentLabel(ps)}</span></td><td>${safe(statusLabel(r.tripStatus))}</td><td>${safe(r.not||"")}</td></tr>`; }).join("")}</tbody>
        <tfoot><tr><td colspan="7">GENEL TOPLAM</td><td class="money">${fmt(s.total)}</td><td class="money">${fmt(s.paidTotal)}</td><td class="money">${fmt(s.debt)}</td><td class="money">${fmt(s.gider)}</td><td class="money">${fmt(s.profit)}</td><td colspan="3"></td></tr></tfoot>
      </table>
      <div class="footer"><div>Bu rapor sistem tarafından oluşturulmuştur.</div><div>${safe(COMPANY)} • ${safe(PHONE)}</div></div>
    </div>
    <div class="printbar"><button onclick="window.print()">Yazdır / PDF Kaydet</button></div>
  </div>
  <script>window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 900); });</script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) return alert("Tarayıcı: Açılır pencere engellendi. Tarayıcı ayarlarından bu site için izin verin, sonra tekrar deneyin.");
    w.document.write(html);
    w.document.close();
    addLog("Profesyonel rapor oluşturuldu: " + title);
  }

  async function reportPdf(title = "Seçili Filtre Raporu", rows = filtered) {
    try {
      await exportRealPdfFromHtml({ html: reportPdfHtml(title, rows), filename: `${title.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ_-]+/gi, "_")}.pdf`, orientation: "landscape" });
      showToast("PDF hazır", "Rapor PDF olarak indirildi.");
      addLog("Rapor PDF indirildi: " + title);
    } catch (error) {
      console.error(error);
    }
  }

  function exportExcel(title = "Seçili Filtre", rows = filtered) {
    const s = summarizeRows(rows);
    const safe = (v) => String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

    const html = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            body{font-family:Arial, sans-serif;}
            .title{font-size:22px;font-weight:900;color:#1f4e79;}
            .company{font-size:14px;font-weight:900;color:#ff7a1a;}
            .info{font-size:12px;color:#475569;font-weight:700;}
            table{border-collapse:collapse;width:100%;}
            th{background:#1f4e79;color:#ffffff;font-weight:900;border:1px solid #d9e2f3;padding:10px;text-align:center;}
            td{border:1px solid #d9e2f3;padding:8px;font-weight:700;}
            .money{mso-number-format:"#,##0";text-align:right;}
            .total-row td{background:#fff4e8;font-weight:900;color:#0f172a;}
            .green{color:#15803d;}
            .red{color:#dc2626;}
          </style>
        </head>
        <body>
          <div class="company">${safe(COMPANY)}</div>
          <div class="title">${safe(title)} Excel Raporu</div>
          <div class="info">Tel: ${safe(PHONE)} | Tarih: ${new Date().toLocaleDateString("tr-TR")} | Kayıt: ${rows.length}</div>
          <br />
          <table>
            <thead>
              <tr>
                <th>No</th><th>Tarih</th><th>Müşteri</th><th>Telefon</th><th>Şoför</th><th>Araç</th>
                <th>Nereden</th><th>Nereye</th><th>Tutar</th><th>Ödenen</th><th>Kalan</th>
                <th>Portif</th><th>Yakıt</th><th>Şoför Gideri</th><th>Yol</th><th>Diğer</th>
                <th>Toplam Gider</th><th>Gerçek Kâr</th><th>Ödeme</th><th>Sefer Durumu</th><th>Not</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const debt = Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0);
                return `<tr>
                  <td>${safe(r.serial)}</td><td>${safe(r.tarih)}</td><td>${safe(r.musteri)}</td><td>${safe(r.phone || "-")}</td>
                  <td>${safe(r.driver || "-")}</td><td>${safe(r.plaka || "-")}</td><td>${safe(r.nereden || "-")}</td><td>${safe(r.nereye || "-")}</td>
                  <td class="money">${Number(r.tutar)||0}</td><td class="money green">${Number(r.paidAmount)||0}</td><td class="money ${debt ? "red" : "green"}">${debt}</td>
                  <td class="money">${Number(r.portifUcr)||0}</td><td class="money">${Number(r.fuelCost)||0}</td><td class="money">${Number(r.driverCost)||0}</td>
                  <td class="money">${Number(r.tollCost)||0}</td><td class="money">${Number(r.otherCost)||0}</td><td class="money">${expenses(r)}</td>
                  <td class="money green">${realProfit(r)}</td><td>${safe(paymentLabel(paymentStatus(r)))}</td><td>${safe(statusLabel(r.tripStatus))}</td><td>${safe(r.not || "")}</td>
                </tr>`;
              }).join("")}
              <tr class="total-row">
                <td colspan="8">GENEL TOPLAM</td>
                <td class="money">${s.total}</td>
                <td class="money">${s.paidTotal}</td>
                <td class="money">${s.debt}</td>
                <td class="money">${s.portif}</td>
                <td colspan="4"></td>
                <td class="money">${s.gider}</td>
                <td class="money">${s.profit}</td>
                <td colspan="3"></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>`;

    const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seyitogullari_excel_${new Date().toISOString().slice(0,10)}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
    addLog("Excel raporu indirildi: " + title);
  }
  function printCustomerStatement(name) { const rows = data.filter(r=>r.musteri===name); printReport(`${name} Hesap Ekstresi`, rows); }

  const notificationItems = useMemo(() => {
    const sourceRows = selectedBranch === "all" ? data : data.filter(r => (r.branchId || "merkez") === selectedBranch);
    const debtRows = sourceRows.filter(r => paymentStatus(r) !== "paid" && Number(r.tutar) > 0);
    const missingPhones = sourceRows.filter(r => !String(r.phone || "").trim());
    const noDriverRows = sourceRows.filter(r => !String(r.driver || "").trim() && !["closed"].includes(r.tripStatus));
    const missingDocs = sourceRows.filter(r => ["delivered","invoiced","closed"].includes(r.tripStatus) && !((r.tripDocuments||[]).some(d=>d.type==="Teslim Fotoğrafı")));
    const vehicleWarnings = vehicles.flatMap(v => [
      { plate: v.plate, type: "Muayene", days: daysUntil(v.inspectionDate) },
      { plate: v.plate, type: "Sigorta", days: daysUntil(v.insuranceDate) }
    ]).filter(x => x.days !== null && x.days <= 30);
    return [
      ...debtRows.slice(0, 8).map(r => ({ id:`debt-${r.id}`, tone:"red", icon:"₺", title:"Ödeme eksiği", text:`${r.musteri} müşterisinin ${r.serial} seferinde kalan ödeme ${fmt(Math.max(r.tutar-r.paidAmount,0))}.`, meta:"Sefer kaydına git", targetTab:"seferler", rowId:r.id })),
      ...delayedRows.slice(0, 8).map(r => ({ id:`delay-${r.id}`, tone:"orange", icon:"⏱", title:"Geciken sefer", text:`${r.serial} numaralı sefer ${r.nereden} → ${r.nereye} güzergahında gecikmiş görünüyor.`, meta:"Operasyon ekranına git", targetTab:"operations", rowId:r.id })),
      ...missingPhones.slice(0, 5).map(r => ({ id:`phone-${r.id}`, tone:"blue", icon:"☎", title:"Telefon eksik", text:`${r.musteri} kaydında telefon numarası bulunmuyor.`, meta:"Müşteri / sefer kaydına git", targetTab:"seferler", rowId:r.id })),
      ...noDriverRows.slice(0, 6).map(r => ({ id:`driver-${r.id}`, tone:"orange", icon:"🚚", title:"Şoför atanmamış", text:`${r.serial} seferine henüz şoför atanmadı.`, meta:"Sefer merkezine git", targetTab:"seferler", rowId:r.id })),
      ...missingDocs.slice(0, 6).map(r => ({ id:`doc-${r.id}`, tone:"red", icon:"📎", title:"Teslim evrakı eksik", text:`${r.serial} teslim edildi ancak teslim fotoğrafı/evrakı eksik.`, meta:"Sefer evraklarını aç", targetTab:"seferler", rowId:r.id })),
      ...vehicleWarnings.map((v, i) => ({ id:`vehicle-${v.plate}-${v.type}-${i}`, tone:v.days < 0 ? "red" : "orange", icon:"🚗", title:"Araç evrak uyarısı", text:`${v.plate} plakalı aracın ${v.type} durumu: ${v.days < 0 ? Math.abs(v.days)+" gün geçti" : v.days+" gün kaldı"}.`, meta:"Araçlar ekranına git", targetTab:"vehicles" }))
    ];
  }, [data, vehicles, delayedRows, selectedBranch]);


  const commandItems = useMemo(() => {
    const quickTabs = [
      { id:"cmd-dashboard", icon:"📊", title:"Dashboard", desc:"Yönetici özet ekranını aç", action:()=>setTab("dashboard") },
      { id:"cmd-operations", icon:"🧭", title:"Operasyon Merkezi", desc:"Operasyon, komuta ve ekip işbirliği", action:()=>setTab("operations") },
      { id:"cmd-trips", icon:"📋", title:"Seferler", desc:"Sefer kayıtlarını aç", action:()=>setTab("seferler") },
      { id:"cmd-new-trip", icon:"➕", title:"Yeni Sefer Ekle", desc:"Hızlı yeni sefer formunu aç", action:()=>{ setTab("seferler"); setShowAdd(true); } },
      { id:"cmd-customers", icon:"👥", title:"Müşteri Merkezi", desc:"CRM ve müşteri portalını aç", action:()=>setTab("customers") },
      { id:"cmd-drivers", icon:"🚚", title:"Şoför Yönetimi", desc:"Şoför, mobil panel ve hakediş", action:()=>setTab("drivers") },
      { id:"cmd-fleet", icon:"🚗", title:"Araç & Evrak", desc:"Araçlar, evraklar, takvim ve GPS", action:()=>setTab("fleet") },
      { id:"cmd-finance", icon:"💼", title:"Finans & Raporlar", desc:"Muhasebe, gider, arşiv ve raporlar", action:()=>setTab("finance") },
      { id:"cmd-ai", icon:"🤖", title:"Akıllı Yönetim", desc:"Tüm AI modüllerini tek merkezde aç", action:()=>setTab("ai") },
      { id:"cmd-enterprise", icon:"🏢", title:"Enterprise Suite", desc:"Backend, realtime, API, SaaS ve entegrasyon merkezini aç", action:()=>setTab("enterprise") },
      { id:"cmd-notifications", icon:"🔔", title:"Bildirim Merkezi", desc:"Tüm uyarıları görüntüle", action:()=>setTab("notifications") },
      { id:"cmd-settings", icon:"⚙️", title:"Sistem", desc:"Ayarlar ve profesyonel araçlar", action:()=>setTab("settings") }
    ];
    const tripCommands = filtered.slice(0, 10).map(r => ({
      id:`trip-${r.id}`,
      icon:"🚗",
      title:`${r.serial} • ${r.musteri}`,
      desc:`${r.nereden} → ${r.nereye} • ${fmt(r.tutar)}`,
      action:()=>{ setTab("seferler"); setSelectedRow(r.id); setTimeout(()=>document.querySelector(`[data-row-id="${r.id}"]`)?.scrollIntoView({behavior:"smooth", block:"center"}), 180); }
    }));
    const customerCommands = customers.slice(0, 8).map(([name, c]) => ({
      id:`customer-${name}`,
      icon:"👤",
      title:name,
      desc:`${c.trips} sefer • Borç: ${fmt(c.debt)} • Toplam: ${fmt(c.total)}`,
      action:()=>{ setTab("customers"); setQuery(name); }
    }));
    return [...quickTabs, ...tripCommands, ...customerCommands];
  }, [filtered, customers]);

  function executeCommand(cmd) {
    cmd?.action?.();
    setCommandOpen(false);
    setCommandQuery("");
  }

  function handleNotificationClick(item) {
    if (item?.targetTab) setTab(item.targetTab);
    if (item?.rowId) setSelectedRow(item.rowId);
    setNotificationOpen(false);
    setTimeout(() => {
      const el = document.querySelector(`[data-row-id="${item?.rowId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  }

  async function copyDriverPortalLink(row) {
    const token = encodeURIComponent(row?.local_id || row?.id || row?.serial || "");
    const url = `${window.location.origin}${window.location.pathname}#/driver/${token}`;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (err) {
      copied = false;
    }
    setDriverLinkModal({
      url,
      copied,
      trip: row,
      title: copied ? "Şoför linki kopyalandı" : "Şoför linki hazır",
      message: copied ? "Bu linki WhatsApp ile şoföre gönderebilirsiniz." : "Tarayıcı otomatik kopyalamaya izin vermedi. Linki aşağıdan elle kopyalayabilirsiniz."
    });
    addLog("Şoför portal linki hazırlandı", row);
  }

  function printReceipt(row) {
    const amount = Math.min(Number(row.paidAmount)||0, Number(row.tutar)||0);
    const maxReceiptNo = receipts.reduce((max, rc) => {
      const m = String(rc.no || "").match(/(\d+)$/);
      return m ? Math.max(max, parseInt(m[1])) : max;
    }, 0);
    const receiptNo = `MK-${new Date().getFullYear()}-${String(maxReceiptNo + 1).padStart(4,"0")}`;
    const receipt = { id: Date.now(), no: receiptNo, rowId: row.id, serial: row.serial, customer: row.musteri, date: new Date().toLocaleDateString("tr-TR"), amount, route: `${row.nereden} → ${row.nereye}` };
    setReceipts(prev => [receipt, ...prev]);
    const html = `<html><head><title>Makbuz</title><style>body{font-family:Arial;padding:35px;background:#eef3f8}.box{max-width:780px;margin:auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px #0002}.top{background:#12385c;color:white;padding:25px}.brand{font-size:28px;font-weight:900;color:#ffb36b}.content{padding:28px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{border:1px solid #dbe3ef;border-radius:14px;padding:14px}.label{color:#64748b;font-size:12px;font-weight:900}.value{font-size:14px;font-weight:900}.sign{display:flex;justify-content:space-between;margin-top:45px}.line{border-top:1px solid #111;padding-top:8px;width:220px;text-align:center}</style></head><body><div class="box"><div class="top"><div class="brand">${safeHtml(COMPANY)}</div><div>Tel: ${safeHtml(PHONE)}</div><div>Makbuz No: ${receiptNo}</div></div><div class="content"><div class="grid"><div class="card"><div class="label">Müşteri</div><div class="value">${safeHtml(row.musteri)}</div></div><div class="card"><div class="label">Tarih</div><div class="value">${receipt.date}</div></div><div class="card"><div class="label">Sefer</div><div class="value">${safeHtml(row.serial)}</div></div><div class="card"><div class="label">Tahsil Edilen</div><div class="value">${fmt(amount)}</div></div><div class="card"><div class="label">Güzergah</div><div class="value">${safeHtml(row.nereden)} → ${safeHtml(row.nereye)}</div></div><div class="card"><div class="label">Kalan</div><div class="value">${fmt(Math.max(row.tutar-row.paidAmount,0))}</div></div></div><div class="sign"><div class="line">Şirket Yetkilisi</div><div class="line">Müşteri İmza</div></div></div></div><script>window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 700); });</script></body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); addLog("Makbuz oluşturuldu", row);
  }

  function openWorkTab(kind, title, payload = {}) {
    setOpenDocs(prev => [{ id: Date.now(), kind, title, payload }, ...prev].slice(0, 8));
  }
  function closeWorkTab(id) { setOpenDocs(prev => prev.filter(x => x.id !== id)); }

  const driverPortalMatch = window.location.hash.match(/^#\/driver\/([^?]+)/);
  if (appLoading) return <SplashScreen company={COMPANY} />;
  if (driverPortalMatch) {
    return <DriverPortalPage
      tripKey={decodeURIComponent(driverPortalMatch[1])}
      localRows={data}
      setData={setData}
      addLog={addLog}
    />;
  }
  if (!currentUser) return <LoginPage users={users} onLogin={setCurrentUser} dark={dark} setDark={setDark} />;

  return <div className={`app theme-${themeName} ${dark ? "dark" : ""}`}>
    <header className="header pro-header">
      <div className="brand-block"><h1>SEYİTOĞULLARI KILIÇBEY</h1><h1>OTO TRANSFER</h1><p>Tel: {PHONE}</p></div>
      <div className="nav-wrap"><div className="nav nav-merged">
        {mainNavTabs.map(([k,l])=>{
          const isNotifications = k === "notifications";
          const aliases = {
            operations:["operations","ops2","collab","collabpro"],
            seferler:["seferler","trips"],
            customers:["customers","portal"],
            drivers:["drivers","driverpanel","drivermobile","driverpayroll"],
            fleet:["fleet","vehicles","documents","map","calendar","branches"],
            finance:["finance","accounting","expenses","archive","reports","logs"],
            ai:["ai","aibrain","tower","ecosystem","aios"],
            enterprise:["enterprise","cloud","pwa","franchise","saas","ecosystem"],
            settings:["settings","protools","cloud","pwa","franchise","saas"]
          };
          const isActive = (aliases[k] || [k]).includes(tab);
          const navIcon = String(l).split(" ")[0];
          const navLabel = String(l).split(" ").slice(1).join(" ") || l;
          return <button
            key={k}
            onClick={()=>{ setTab(k); if (isNotifications) setNotificationOpen(false); }}
            className={`${isActive?"active":""} ${isNotifications ? "notification-nav-tab" : ""}`}
          >
            <span className="nav-icon-box">{navIcon}</span><span className="nav-label-text">{navLabel}</span>
            {isNotifications && notificationItems.length > 0 && <em className="nav-notification-badge">{notificationItems.length > 99 ? "99+" : notificationItems.length}</em>}
          </button>;
        })}
      </div><div className="top-actions"><div className="user-branch-group"><div className="current-user-badge"><span>Giriş yapan</span><b>{currentUser?.name}</b><small>{roleLabelTR(currentUser?.role)}</small></div><select className="branch-switcher" value={selectedBranch === "all" ? (branches.find(b=>b.active)?.id || "merkez") : selectedBranch} onChange={e=>setSelectedBranch(e.target.value)}>{branches.filter(b=>b.active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><button onClick={()=>setCurrentUser(null)}>Çıkış</button><button onClick={()=>setDark(v=>!v)}>{dark ? "☀️" : "🌙"}</button></div></div>
    </header>

    {confirmBox && <ConfirmModal {...confirmBox} />}
    {bulkReminder && <BulkReminderModal data={bulkReminder} onClose={()=>setBulkReminder(null)} onSend={(row)=>whatsapp(row, "payment")} />}
    {driverLinkModal && <DriverLinkModal data={driverLinkModal} onClose={()=>setDriverLinkModal(null)} onCopy={async()=>{ try { await navigator.clipboard?.writeText(driverLinkModal.url); setDriverLinkModal(v=>v?{...v,copied:true,title:"Şoför linki kopyalandı",message:"Link panoya kopyalandı. Şimdi WhatsApp ile gönderebilirsiniz."}:v); } catch { window.prompt("Şoför linkini kopyalayın:", driverLinkModal.url); } }} />}
    {toast && <div className="toast"><b>✅ {toast.title}</b><span>{toast.message}</span></div>}
    <FloatingTabs tabs={openDocs} onClose={closeWorkTab} />
    <CommandPalette open={commandOpen} query={commandQuery} setQuery={setCommandQuery} items={commandItems} onClose={()=>setCommandOpen(false)} onRun={executeCommand} />
    

    {tab === "dashboard" && <DashboardPage {...{data:branchData,dashboardStats,routes,customers,delayedRows,currentUser,notificationItems,setTab}} />}
    {tab === "branches" && <BranchesPage branches={branches} setBranches={setBranches} rows={data} drivers={drivers} vehicles={vehicles} selectedBranch={selectedBranch} setSelectedBranch={setSelectedBranch} />}
    {tab === "operations" && <OperationsHub rows={branchData} drivers={drivers} vehicles={vehicles} users={users} logs={logs} notificationItems={notificationItems} currentUser={currentUser} setTab={setTab} setDriverFilter={setDriverFilter} updateTripStatus={updateTripStatus} />}
    {tab === "collabpro" && <CollaborationSuitePro rows={branchData} users={users} drivers={drivers} logs={logs} notificationItems={notificationItems} currentUser={currentUser} setTab={setTab} />}
    {tab === "collab" && <RealtimeCollaborationCenter rows={branchData} users={users} drivers={drivers} notificationItems={notificationItems} logs={logs} currentUser={currentUser} setTab={setTab} />}
    {tab === "ops2" && <OperationCenterV2 rows={branchData} drivers={drivers} vehicles={vehicles} notificationItems={notificationItems} setTab={setTab} />}
    {(tab === "seferler" || tab === "trips") && <main className="panel full seferler-page">
      <div className="filters seferler-quick-actions">
        <select className="control" value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}>
          <option value="">Tüm şoförler</option>
          {driverNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {canEdit && <Button className="primary-action" onClick={()=>{setShowAdd(true);setInlineEditId(null);setForm(emptyRow)}}>+ Yeni Sefer</Button>}
        <Button onClick={()=>bulkPaymentReminder(filtered)}>💬 Toplu Hatırlat</Button>
        <Button onClick={printSelectedRows}>📄 Rapor</Button>
        {reportPdf && <Button onClick={pdfSelectedRows}>⬇️ PDF</Button>}
        {exportExcel && <Button onClick={excelSelectedRows}>📊 Excel</Button>}
        {canDelete && <Button onClick={bulkDeleteSelected} className="danger-btn">🗑️ Sil</Button>}
      </div>
      {showAdd && <NewTripModal form={form} setForm={setForm} saveRow={saveRow} onClose={()=>{setShowAdd(false);setForm(emptyRow)}} drivers={drivers} existingCustomers={[...new Set(data.map(r=>r.musteri).filter(Boolean))]} />}
      <Filters {...{query,setQuery,dest,setDest,pay,setPay,dateMode,setDateMode,selectedDate,setSelectedDate,selectedMonth,setSelectedMonth,startDate,setStartDate,endDate,setEndDate,destinations,months,resetFilters,dateRef,printReport,reportPdf,exportExcel,hideReportActions:true}} />
      <TripTable rows={filtered} {...{selectedRow,setSelectedRow,startEdit,deleteRow,invoice,invoicePdf,whatsapp,copyTrip,printReceipt,inlineEditId,form,setForm,saveRow,copyDriverPortalLink}} cancelEdit={()=>{setInlineEditId(null);setForm(emptyRow)}} stats={stats} canEdit={canEdit} canDelete={canDelete} drivers={drivers} updateTripStatus={updateTripStatus} updateTripAdvanced={updateTripAdvanced} selectedIds={selectedIds} setSelectedIds={setSelectedIds} setConfirmBox={setConfirmBox} />
    </main>}
    {tab === "customers" && <CustomerHub rows={branchData} customers={customers} whatsapp={whatsapp} printCustomerStatement={printCustomerStatement} />}
    {tab === "portal" && <CustomerPortalCenter rows={branchData} customers={customers} whatsapp={whatsapp} printCustomerStatement={printCustomerStatement} />}
    {tab === "calendar" && <CalendarPage rows={branchData} />}
    {tab === "driverpanel" && <DriverPanelPage rows={branchData} currentUser={currentUser} updateTripStatus={updateTripStatus} whatsapp={whatsapp} />}
    {tab === "drivermobile" && <DriverMobilePro rows={branchData} drivers={drivers} setData={setData} addLog={addLog} currentUser={currentUser} />}
    {tab === "map" && <MapPage rows={filtered} />}
    {tab === "drivers" && <DriverHub rows={branchData} allRows={data} drivers={drivers} setDrivers={setDrivers} setData={setData} addLog={addLog} currentUser={currentUser} updateTripStatus={updateTripStatus} whatsapp={whatsapp} printReport={printReport} />}
    {tab === "driverpayroll" && <DriverPayrollPage drivers={drivers} rows={data} printReport={printReport} />}
    {tab === "vehicles" && <VehiclesPage vehicles={vehicles} setVehicles={setVehicles} rows={data} addLog={addLog} />}
    {tab === "fleet" && <FleetHub rows={branchData} allRows={data} vehicles={vehicles} setVehicles={setVehicles} documents={documents} setDocuments={setDocuments} customers={customers} branches={branches} setBranches={setBranches} selectedBranch={selectedBranch} setSelectedBranch={setSelectedBranch} drivers={drivers} addLog={addLog} />}
    {tab === "documents" && <DocumentsPage documents={documents} setDocuments={setDocuments} rows={data} customers={customers} vehicles={vehicles} addLog={addLog} />}
    {tab === "accounting" && <AccountingPage rows={filtered} receipts={receipts} printReport={printReport} />}
    {tab === "finance" && <FinanceHub rows={filtered} allRows={data} receipts={receipts} setReceipts={setReceipts} stats={stats} canReports={canReports} printReport={printReport} reportPdf={reportPdf} exportExcel={exportExcel} bulkPaymentReminder={bulkPaymentReminder} filters={{query,setQuery,dest,setDest,pay,setPay,dateMode,setDateMode,selectedDate,setSelectedDate,selectedMonth,setSelectedMonth,startDate,setStartDate,endDate,setEndDate,destinations,months,resetFilters,dateRef,filtered}} />}
    {tab === "notifications" && <NotificationsPage items={notificationItems} onSelect={handleNotificationClick} />}
    {tab === "aios" && <AIOperatingSystem rows={branchData} drivers={drivers} vehicles={vehicles} customers={customers} stats={dashboardStats} users={users} setTab={setTab} />}
    {tab === "ecosystem" && <EnterpriseEcosystemExpansion rows={branchData} drivers={drivers} vehicles={vehicles} users={users} customers={customers} stats={dashboardStats} setTab={setTab} />}
    {tab === "tower" && <GlobalControlTower rows={branchData} drivers={drivers} vehicles={vehicles} customers={customers} notificationItems={notificationItems} stats={dashboardStats} setTab={setTab} />}
    {tab === "aibrain" && <AILogisticsBrain rows={branchData} drivers={drivers} vehicles={vehicles} customers={customers} stats={dashboardStats} setTab={setTab} />}
    {tab === "ai" && <SmartManagementHub rows={branchData} drivers={drivers} vehicles={vehicles} customers={customers} stats={dashboardStats} users={users} notificationItems={notificationItems} setTab={setTab} />}
    {tab === "enterprise" && <EnterpriseFinalSuite rows={branchData} allRows={data} drivers={drivers} vehicles={vehicles} users={users} customers={customers} receipts={receipts} logs={logs} notificationItems={notificationItems} stats={dashboardStats} config={enterpriseConfig} setConfig={setEnterpriseConfig} apiKeys={apiKeys} setApiKeys={setApiKeys} setTab={setTab} backup={backup} />}
    {tab === "cloud" && <CloudSyncPanel cloudSyncState={cloudSyncState} onManualSync={manualCloudSync} />}
    {tab === "pwa" && <PwaPage />}
    {tab === "protools" && <ProToolsPage {...{themeName,setThemeName,brandAssets,setBrandAssets,backup,openWorkTab}} />}
    {tab === "expenses" && <ExpensesPage rows={filtered} stats={stats} printReport={printReport} />}
    {tab === "archive" && <ArchivePage rows={data} printReport={printReport} />}
    {tab === "reports" && canReports && <ReportsPage {...{query,setQuery,dest,setDest,pay,setPay,dateMode,setDateMode,selectedDate,setSelectedDate,selectedMonth,setSelectedMonth,startDate,setStartDate,endDate,setEndDate,destinations,months,resetFilters,dateRef,printReport,reportPdf,exportExcel,bulkPaymentReminder,filtered,stats}} />}
    {tab === "logs" && canReports && <LogsPage logs={logs} />}
    {tab === "saas" && <SaaSManagementCenter rows={branchData} users={users} drivers={drivers} vehicles={vehicles} />}
    {tab === "franchise" && <MultiBranchFranchiseCenter rows={branchData} users={users} drivers={drivers} vehicles={vehicles} />}
    {tab === "settings" && canSettings && <SystemHub backup={backup} importBackup={importBackup} users={users} setUsers={setUsers} drivers={drivers} setDrivers={setDrivers} currentUser={currentUser} setCurrentUser={setCurrentUser} themeName={themeName} setThemeName={setThemeName} brandAssets={brandAssets} setBrandAssets={setBrandAssets} openWorkTab={openWorkTab} rows={branchData} vehicles={vehicles} cloudSyncState={cloudSyncState} onManualSync={manualCloudSync} />}
  </div>;
}



function defaultEnterpriseConfig() {
  return {
    mode: "local-enterprise",
    companyType: "single-company",
    realtime: true,
    autoInvoice: true,
    autoWhatsApp: true,
    auditRequired: true,
    tenantIsolation: true,
    dailyBackup: true,
    gpsProvider: "demo-map",
    aiLevel: "pro",
    apiEnabled: true,
    lastSync: ""
  };
}

function maskSecret(v) {
  const s = String(v || "");
  if (!s) return "Henüz girilmedi";
  if (s.length <= 6) return "••••••";
  return s.slice(0, 3) + "••••••" + s.slice(-3);
}

function EnterpriseFinalSuite({ rows = [], allRows = [], drivers = [], vehicles = [], users = [], customers = [], receipts = [], logs = [], notificationItems = [], stats = {}, config, setConfig, apiKeys, setApiKeys, setTab, backup }) {
  const [active, setActive] = useState("overview");
  const riskyTrips = rows.filter(r => realProfit(r) < 0 || (!r.driver && !["closed"].includes(r.tripStatus)) || (paymentStatus(r) !== "paid" && Number(r.tutar) > 0));
  const activeDrivers = drivers.filter(d => d.status !== "leave").length;
  const apiReady = Boolean(apiKeys?.firebase || apiKeys?.supabase || apiKeys?.mapbox || apiKeys?.whatsapp);
  const systemScore = Math.min(100, 58 + (config.realtime?8:0) + (config.auditRequired?8:0) + (config.tenantIsolation?8:0) + (apiReady?10:0) + (rows.length?8:0));
  const syncItems = [
    ["Seferler", rows.length, "trips"], ["Kullanıcılar", users.length, "users"], ["Şoförler", drivers.length, "drivers"], ["Araçlar", vehicles.length, "vehicles"], ["Tahsilatlar", receipts.length, "receipts"], ["Audit", logs.length, "logs"]
  ];
  const apiFields = [
    ["firebase", "Firebase / Firestore"], ["supabase", "Supabase URL"], ["mapbox", "Mapbox Token"], ["whatsapp", "WhatsApp Business Token"], ["openai", "AI API Key"], ["erp", "ERP/SAP Endpoint"]
  ];
  const automations = [
    { title:"Teslim edilince otomatik fatura", on:config.autoInvoice, detail:"Delivered → Invoiced akışını hızlandırır." },
    { title:"WhatsApp durum mesajı", on:config.autoWhatsApp, detail:"Müşteri ve şoföre hazır mesaj üretir." },
    { title:"Günlük yedekleme", on:config.dailyBackup, detail:"Local backup snapshot üretir." },
    { title:"Audit zorunlu kayıt", on:config.auditRequired, detail:"Her kritik işlem izlenebilir olur." },
    { title:"Şirket izolasyonu", on:config.tenantIsolation, detail:"SaaS mimarisine hazır tenant ayrımı." }
  ];
  const tenantCards = [
    { name:"Ana Şirket", users:users.length, trips:allRows.length, status:"Aktif" },
    { name:"Demo Bayi", users:2, trips:0, status:"Hazır" },
    { name:"Kurumsal Müşteri", users:1, trips:0, status:"Plan" }
  ];
  function updateKey(k, v) { setApiKeys(prev => ({ ...prev, [k]: v })); }
  function updateCfg(k, v) { setConfig(prev => ({ ...prev, [k]: v, lastSync: new Date().toLocaleString("tr-TR") })); }
  return <main className="panel full enterprise-final-suite">
    <div className="enterprise-hero glass-panel">
      <div>
        <span className="section-kicker">V12 Final Enterprise Edition</span>
        <h2>🏢 Kurumsal Nakliye Yönetim Sistemi</h2>
        <p>Backend hazırlığı, realtime çalışma modu, SaaS, API, GPS, otomasyon, güvenlik, audit, performans ve entegrasyonlar tek merkezde toplandı.</p>
        <div className="enterprise-actions">
          <Button onClick={()=>setTab("seferler")}>🚛 Seferleri Aç</Button>
          <Button onClick={()=>setTab("ai")}>🤖 AI Merkez</Button>
          <Button onClick={backup}>💾 Tam Yedek Al</Button>
        </div>
      </div>
      <div className="enterprise-score"><span>Enterprise Score</span><b>%{systemScore}</b><small>{apiReady ? "API anahtarları girildi" : "Local + Cloud Ready"}</small></div>
    </div>
    <div className="enterprise-tabs">
      {[["overview","Genel"],["backend","Backend"],["realtime","Realtime"],["automation","Otomasyon"],["integrations","API"],["saas","SaaS"],["security","Güvenlik"],["performance","Performans"]].map(([k,l])=><button key={k} className={active===k?"active":""} onClick={()=>setActive(k)}>{l}</button>)}
    </div>
    {active === "overview" && <div className="enterprise-grid">
      <div className="enterprise-card wide"><h3>📊 Canlı Kurumsal Özet</h3><div className="enterprise-kpis"><div><span>Ciro</span><b>{fmt(stats.total)}</b></div><div><span>Net Kâr</span><b>{fmt(stats.profit)}</b></div><div><span>Açık Alacak</span><b>{fmt(stats.debt)}</b></div><div><span>Risk</span><b>{riskyTrips.length}</b></div><div><span>Aktif Şoför</span><b>{activeDrivers}</b></div></div></div>
      <div className="enterprise-card"><h3>🧠 AI Yönetici Notu</h3><p>{stats.debt > stats.paidTotal * .35 ? "Tahsilat riski yüksek. Finans ekibi alacakları önceliklendirmeli." : "Tahsilat dengesi kabul edilebilir."}</p><p>{riskyTrips.length ? `${riskyTrips.length} kayıt operasyon/finans riski taşıyor.` : "Kritik operasyon riski görünmüyor."}</p></div>
      <div className="enterprise-card"><h3>🔔 Kritik Bildirimler</h3>{notificationItems.slice(0,5).map(n=><div className="mini-alert" key={n.id}>{n.icon} <b>{n.title}</b><span>{n.text}</span></div>)}{!notificationItems.length && <div className="empty-state"><b>✅ Bildirim yok</b><span>Sistem şu anda temiz görünüyor.</span></div>}</div>
      <div className="enterprise-card wide"><h3>🧩 Modül Durumu</h3><div className="module-status-grid">{["TMS","Finans","CRM","Şoför","Araç","Evrak","AI","SaaS","Cloud","Audit","WhatsApp","PDF/Excel"].map((m,i)=><div key={m}><b>{m}</b><span>{i<8?"Aktif":"Hazır"}</span></div>)}</div></div>
    </div>}
    {active === "backend" && <div className="enterprise-grid">
      <div className="enterprise-card wide"><h3>☁️ Backend Hazırlığı</h3><p>Program localStorage ile hemen çalışır; Firebase/Supabase bilgileri girildiğinde cloud moda taşınmaya hazır servis mimarisi içerir.</p><div className="backend-mode"><label><input type="radio" checked={config.mode==="local-enterprise"} onChange={()=>updateCfg("mode","local-enterprise")} /> Local Enterprise</label><label><input type="radio" checked={config.mode==="firebase-ready"} onChange={()=>updateCfg("mode","firebase-ready")} /> Firebase Ready</label><label><input type="radio" checked={config.mode==="supabase-ready"} onChange={()=>updateCfg("mode","supabase-ready")} /> Supabase Ready</label></div></div>
      {syncItems.map(([name,count,key])=><div className="enterprise-card" key={key}><h3>{name}</h3><b className="big-metric">{count}</b><span className="sync-pill">Sync Shadow Ready</span></div>)}
    </div>}
    {active === "realtime" && <div className="enterprise-grid">
      <div className="enterprise-card wide"><h3>⚡ Realtime Çalışma Sistemi</h3><label className="switch-row"><span>Canlı güncelleme modu</span><input type="checkbox" checked={config.realtime} onChange={e=>updateCfg("realtime",e.target.checked)} /></label><div className="live-feed">{logs.slice(0,8).map(l=><div key={l.id}><b>{l.action}</b><span>{l.user} • {l.date}</span></div>)}{!logs.length && <div><b>Sistem hazır</b><span>İşlem yapıldığında canlı akış burada görünür.</span></div>}</div></div>
      <div className="enterprise-card"><h3>🗺️ GPS/Map</h3><select value={config.gpsProvider} onChange={e=>updateCfg("gpsProvider",e.target.value)}><option value="demo-map">Demo Map</option><option value="mapbox">Mapbox Ready</option><option value="google">Google Maps Ready</option></select><p>ETA, rota, durak ve araç konumu için hazır alan.</p></div>
    </div>}
    {active === "automation" && <div className="enterprise-grid">{automations.map((a,i)=><div className="enterprise-card automation-card" key={a.title}><label className="switch-row"><span><b>{a.title}</b><small>{a.detail}</small></span><input type="checkbox" checked={a.on} onChange={e=>updateCfg(["autoInvoice","autoWhatsApp","dailyBackup","auditRequired","tenantIsolation"][i], e.target.checked)} /></label></div>)}<div className="enterprise-card wide"><h3>🔁 Workflow Builder</h3><div className="workflow-line"><span>Sefer teslim edildi</span><b>→</b><span>Fatura oluştur</span><b>→</b><span>WhatsApp gönder</span><b>→</b><span>Cari hesaba işle</span><b>→</b><span>Audit kaydı</span></div></div></div>}
    {active === "integrations" && <div className="enterprise-grid"><div className="enterprise-card wide"><h3>🔌 API & Entegrasyon Merkezi</h3><p>Gerçek servis anahtarlarını burada saklayıp kurulum dosyalarına aktarabilirsiniz. Güvenlik için ekranda maskelenir.</p></div>{apiFields.map(([key,label])=><div className="enterprise-card" key={key}><h3>{label}</h3><input value={apiKeys[key]||""} onChange={e=>updateKey(key,e.target.value)} placeholder={`${label} bilgisi`} /><small>{maskSecret(apiKeys[key])}</small></div>)}</div>}
    {active === "saas" && <div className="enterprise-grid"><div className="enterprise-card wide"><h3>🏬 Multi Company / SaaS</h3><label className="switch-row"><span>Tenant izolasyonu aktif</span><input type="checkbox" checked={config.tenantIsolation} onChange={e=>updateCfg("tenantIsolation",e.target.checked)} /></label></div>{tenantCards.map(t=><div className="enterprise-card" key={t.name}><h3>{t.name}</h3><p>{t.users} kullanıcı • {t.trips} sefer</p><span className="sync-pill">{t.status}</span></div>)}</div>}
    {active === "security" && <div className="enterprise-grid"><div className="enterprise-card"><h3>🛡️ Audit Logs</h3><b className="big-metric">{logs.length}</b><p>Son kritik işlem kayıtları tutuluyor.</p></div><div className="enterprise-card"><h3>🔐 Yetki Sistemi</h3><b className="big-metric">{users.length}</b><p>Rol bazlı erişim ve sayfa filtreleme aktif.</p></div><div className="enterprise-card wide"><h3>✅ Güvenlik Kontrol Listesi</h3><div className="check-grid">{["Rol bazlı erişim","Session yönetimi","Audit kayıtları","Yedekleme","Tenant izolasyonu","API hazır mimari","Evrak arşivi","Finans takibi"].map(x=><span key={x}>✓ {x}</span>)}</div></div></div>}
    {active === "performance" && <div className="enterprise-grid"><div className="enterprise-card"><h3>🚀 Kayıt Performansı</h3><b className="big-metric">{allRows.length}</b><p>Filtreleme ve arama optimize edildi.</p></div><div className="enterprise-card"><h3>📦 Build Ready</h3><b className="big-metric">React</b><p>Production build için hazırlandı.</p></div><div className="enterprise-card wide"><h3>🧱 Ölçeklenebilir Mimari</h3><div className="module-status-grid">{["Lazy modül mantığı","Servis katmanı","Cloud shadow","PDF motoru","WhatsApp servisleri","Rapor şablonları","PWA dosyaları","Modüler README"].map(x=><div key={x}><b>{x}</b><span>Hazır</span></div>)}</div></div></div>}
  </main>;
}


function HubShell({ title, subtitle, tabs, defaultTab }) {
  const [active, setActive] = useState(defaultTab || tabs?.[0]?.key);
  const current = tabs.find(t => t.key === active) || tabs[0];
  return <main className="panel full hub-page">
    <div className="hub-hero glass-card">
      <div>
        <span className="hub-kicker">Professional Workspace</span>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      
    </div>
    <div className="hub-tabs">
      {tabs.map(t => <button key={t.key} className={active === t.key ? "active" : ""} onClick={()=>setActive(t.key)}>
        <span>{t.icon}</span><b>{t.label}</b><small>{t.desc}</small>
      </button>)}
    </div>
    <AnimatePresence mode="wait">
      <motion.div key={current.key} className="hub-content" initial={{ opacity: 0, y: 16, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .99 }} transition={{ duration: .22, ease: "easeOut" }}>
        {current.render()}
      </motion.div>
    </AnimatePresence>
  </main>;
}

function OperationsHub(props) {
  return <HubShell title="🧭 Operasyon Merkezi" subtitle="Operasyon, komuta merkezi, ekip işbirliği ve gelişmiş görev takibi tek ekranda birleşti." tabs={[
    { key:"live", icon:"🧭", label:"Operasyon", desc:"Günlük kontrol", render:()=> <OperationsPage {...props} /> },
    { key:"advanced", icon:"⚡", label:"Operasyon 2.0", desc:"Yoğunluk ve uyarılar", render:()=> <OperationCenterV2 {...props} /> },
    { key:"tower", icon:"🛰️", label:"Komuta", desc:"Canlı yönetim", render:()=> <RealtimeCollaborationCenter {...props} /> },
    { key:"team", icon:"🧬", label:"Collab Pro", desc:"Ekip çalışması", render:()=> <CollaborationSuitePro {...props} /> }
  ]} />;
}

function CustomerHub({ rows, customers, whatsapp, printCustomerStatement }) {
  return <HubShell title="👥 Müşteri Merkezi" subtitle="CRM, müşteri portalı, hesap ekstresi ve hızlı WhatsApp iletişimi tek merkezde." tabs={[
    { key:"crm", icon:"👥", label:"CRM Pro", desc:"Müşteri analizi", render:()=> <CustomersPage customers={customers} whatsapp={whatsapp} data={rows} printCustomerStatement={printCustomerStatement} /> },
    { key:"portal", icon:"💬", label:"Portal", desc:"Müşteri ekranı", render:()=> <CustomerPortalCenter rows={rows} customers={customers} whatsapp={whatsapp} printCustomerStatement={printCustomerStatement} /> }
  ]} />;
}

function DriverHub({ rows, allRows, drivers, setDrivers, setData, addLog, currentUser, updateTripStatus, whatsapp, printReport }) {
  return <HubShell title="🚚 Şoför Yönetimi" subtitle="Şoför listesi, mobil görev paneli, teslimat akışı ve hakediş hesapları tek tab altında." tabs={[
    { key:"drivers", icon:"🚚", label:"Şoförler", desc:"Kayıt ve performans", render:()=> <DriversPage drivers={drivers} setDrivers={setDrivers} rows={allRows} setData={setData} addLog={addLog} /> },
    { key:"panel", icon:"📱", label:"Şoför Panel", desc:"Görev ekranı", render:()=> <DriverPanelPage rows={rows} currentUser={currentUser} updateTripStatus={updateTripStatus} whatsapp={whatsapp} /> },
    { key:"mobile", icon:"📲", label:"Mobil Pro", desc:"Teslimat akışı", render:()=> <DriverMobilePro rows={rows} drivers={drivers} setData={setData} addLog={addLog} currentUser={currentUser} /> },
    { key:"payroll", icon:"💳", label:"Hakediş", desc:"Ödeme hesabı", render:()=> <DriverPayrollPage drivers={drivers} rows={allRows} printReport={printReport} /> }
  ]} />;
}

function FleetHub({ rows, allRows, vehicles, setVehicles, documents, setDocuments, customers, branches, setBranches, selectedBranch, setSelectedBranch, drivers, addLog }) {
  return <HubShell title="🚗 Araç & Evrak Merkezi" subtitle="Araçlar, evraklar, GPS, takvim ve şube yapısı tek operasyonel varlık merkezinde." tabs={[
    { key:"vehicles", icon:"🚗", label:"Araçlar", desc:"Araç kayıtları", render:()=> <VehiclesPage vehicles={vehicles} setVehicles={setVehicles} rows={allRows} addLog={addLog} /> },
    { key:"documents", icon:"📁", label:"Evraklar", desc:"Dosya takibi", render:()=> <DocumentsPage documents={documents} setDocuments={setDocuments} rows={allRows} customers={customers} vehicles={vehicles} addLog={addLog} /> },
    { key:"calendar", icon:"📅", label:"Takvim", desc:"Planlama", render:()=> <CalendarPage rows={rows} /> },
    { key:"map", icon:"🛰️", label:"GPS", desc:"Harita takibi", render:()=> <MapPage rows={rows} /> },
    { key:"branches", icon:"🏢", label:"Şubeler", desc:"Çoklu şube", render:()=> <BranchesPage branches={branches} setBranches={setBranches} rows={allRows} drivers={drivers} vehicles={vehicles} selectedBranch={selectedBranch} setSelectedBranch={setSelectedBranch} /> }
  ]} />;
}


function FinanceV10Suite({ rows, allRows = rows, receipts = [], setReceipts, printReport }) {
  const [partyFilter, setPartyFilter] = useState("all");
  const [receiptForm, setReceiptForm] = useState({ type:"customer_payment", party:"", amount:"", date:new Date().toISOString().slice(0,10), note:"" });
  const dataRows = allRows?.length ? allRows : rows;
  const invoiceRows = dataRows.filter(r => Number(r.tutar) > 0).map(r => {
    const subtotal = Number(r.tutar) || 0;
    const kdv = Math.round(subtotal * 0.20);
    const gross = subtotal + kdv;
    const paid = Number(r.paidAmount) || 0;
    return { ...r, invoiceNo: r.invoiceNo || `FTR-${String(r.serial || r.id).replace(/[^0-9A-Z-]/gi, "")}`, subtotal, kdv, gross, paid, debt: Math.max(subtotal - paid, 0), profit: realProfit(r) };
  }).sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih)));
  const financeReceipts = receipts || [];
  const customers = [...new Set(dataRows.map(r=>r.musteri).filter(Boolean))].sort();
  const drivers = [...new Set(dataRows.map(r=>r.driver).filter(Boolean))].sort();
  const parties = receiptForm.type === "driver_payment" ? drivers : customers;
  const totals = invoiceRows.reduce((a,r)=>{ a.subtotal += r.subtotal; a.kdv += r.kdv; a.gross += r.gross; a.paid += r.paid; a.debt += r.debt; a.profit += r.profit; return a; }, {subtotal:0,kdv:0,gross:0,paid:0,debt:0,profit:0});
  const alerts = [
    totals.debt > 0 && { level:"danger", text:`${fmt(totals.debt)} açık müşteri alacağı var.` },
    totals.profit < 0 && { level:"danger", text:"Toplam kâr negatif. Fiyat / gider kontrolü gerekli." },
    invoiceRows.filter(r=>r.debt>0).length > 3 && { level:"warning", text:`${invoiceRows.filter(r=>r.debt>0).length} adet ödenmemiş veya kısmi fatura var.` },
    totals.profit >= 0 && totals.debt === 0 && { level:"success", text:"Finansal durum dengeli görünüyor." },
  ].filter(Boolean);

  function addReceipt(e) {
    e.preventDefault();
    if (!setReceipts) return alert("Tahsilat modülü bu sürümde salt okunur açıldı.");
    if (!receiptForm.party || !Number(receiptForm.amount)) return alert("Cari ve tutar alanları gerekli.");
    const rec = { id: Date.now(), ...receiptForm, amount:Number(receiptForm.amount), date: inputToTRDate(receiptForm.date), createdAt:new Date().toLocaleString("tr-TR") };
    setReceipts(prev => [rec, ...(prev || [])].slice(0,500));
    setReceiptForm({ type:receiptForm.type, party:"", amount:"", date:new Date().toISOString().slice(0,10), note:"" });
  }
  function printSimpleDoc(title, bodyHtml) {
    const html = `<!doctype html><html><head><meta charset="UTF-8"><title>${safeHtml(title)}</title><style>body{font-family:Arial;background:#eef4fb;margin:0;padding:20px;color:#123}.page{background:#fff;width:100%;margin:0;border-radius:0;overflow:hidden;box-shadow:none}.head{background:#12385c;color:#fff;padding:22px 28px;display:flex;justify-content:space-between}.brand{font-size:22px;font-weight:900;color:#ffb36b}.content{padding:24px}table{width:100%;border-collapse:collapse}th{background:#12385c;color:#fff;text-align:left;padding:10px}td{border:1px solid #dbe7f3;padding:9px;font-weight:700}.money{text-align:right}.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.box{border:1px solid #dbe7f3;border-radius:10px;padding:8px;background:#f8fbff}.box span{display:block;color:#64748b;font-size:11px;font-weight:900}.box b{font-size:19px}.printbar{text-align:center;padding:12px;background:#e8f1fb}.printbar button{border:0;border-radius:12px;background:#ff7a1a;color:white;padding:10px 18px;font-weight:900}@media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0}.printbar{display:none}}</style></head><body><div class="page"><div class="head"><div><div class="brand">${safeHtml(COMPANY)}</div><div>${safeHtml(PHONE)}</div></div><div><b>${safeHtml(title)}</b><br/>${new Date().toLocaleString("tr-TR")}</div></div><div class="content">${bodyHtml}</div><div class="printbar"><button onclick="window.print()">Yazdır / PDF Kaydet</button></div></div><script>setTimeout(()=>window.print(),600)</script></body></html>`;
    const w = window.open("", "_blank"); if (!w) return alert("Tarayıcı: Açılır pencere engellendi. Tarayıcı ayarlarından bu site için izin verin, sonra tekrar deneyin."); w.document.write(html); w.document.close();
  }
  function printInvoice(row) {
    const html = `<div class="sum"><div class="box"><span>Fatura No</span><b>${safeHtml(row.invoiceNo)}</b></div><div class="box"><span>Ara Toplam</span><b>${fmt(row.subtotal)}</b></div><div class="box"><span>KDV %20</span><b>${fmt(row.kdv)}</b></div><div class="box"><span>Kalan</span><b>${fmt(row.debt)}</b></div></div><table><tbody><tr><td>Müşteri</td><td>${safeHtml(row.musteri)}</td></tr><tr><td>Sefer</td><td>${safeHtml(row.nereden)} → ${safeHtml(row.nereye)}</td></tr><tr><td>Şoför / Plaka</td><td>${safeHtml(row.driver||"-")} / ${safeHtml(row.plaka||"-")}</td></tr><tr><td>Tarih</td><td>${safeHtml(row.tarih)}</td></tr><tr><td>Toplam Hizmet</td><td class="money">${fmt(row.subtotal)}</td></tr><tr><td>Ödenen</td><td class="money">${fmt(row.paid)}</td></tr><tr><td>Kalan</td><td class="money">${fmt(row.debt)}</td></tr></tbody></table>`;
    printSimpleDoc(`Fatura ${row.invoiceNo}`, html);
  }
  function printCustomerStatement(name) {
    const list = name === "all" ? dataRows : dataRows.filter(r=>r.musteri===name);
    const s = list.reduce((a,r)=>{ a.total+=Number(r.tutar)||0; a.paid+=Number(r.paidAmount)||0; a.debt+=Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0); a.trips++; return a; }, {total:0,paid:0,debt:0,trips:0});
    const html = `<div class="sum"><div class="box"><span>Sefer</span><b>${s.trips}</b></div><div class="box"><span>Toplam</span><b>${fmt(s.total)}</b></div><div class="box"><span>Ödenen</span><b>${fmt(s.paid)}</b></div><div class="box"><span>Bakiye</span><b>${fmt(s.debt)}</b></div></div><table><thead><tr><th>No</th><th>Tarih</th><th>Güzergah</th><th class="money">Tutar</th><th class="money">Ödenen</th><th class="money">Bakiye</th></tr></thead><tbody>${list.map(r=>`<tr><td>${safeHtml(r.serial)}</td><td>${safeHtml(r.tarih)}</td><td>${safeHtml(r.nereden)} → ${safeHtml(r.nereye)}</td><td class="money">${fmt(r.tutar)}</td><td class="money">${fmt(r.paidAmount)}</td><td class="money">${fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}</td></tr>`).join("")}</tbody></table>`;
    printSimpleDoc(`Müşteri Ekstresi - ${name === "all" ? "Tüm Müşteriler" : name}`, html);
  }
  function printDriverStatement(name) {
    const list = name === "all" ? dataRows : dataRows.filter(r=>r.driver===name);
    const s = list.reduce((a,r)=>{ a.trips++; a.earn+=Number(r.portifUcr)||0; a.paid+=financeReceipts.filter(x=>x.type==="driver_payment" && x.party===(r.driver||"")).reduce((z,x)=>z+(Number(x.amount)||0),0); a.profit+=realProfit(r); return a; }, {trips:0,earn:0,paid:0,profit:0});
    const html = `<div class="sum"><div class="box"><span>Sefer</span><b>${s.trips}</b></div><div class="box"><span>Hakediş</span><b>${fmt(s.earn)}</b></div><div class="box"><span>Ödeme Kaydı</span><b>${fmt(s.paid)}</b></div><div class="box"><span>Operasyon Kârı</span><b>${fmt(s.profit)}</b></div></div><table><thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Güzergah</th><th class="money">Hakediş</th><th class="money">Kâr</th></tr></thead><tbody>${list.map(r=>`<tr><td>${safeHtml(r.serial)}</td><td>${safeHtml(r.tarih)}</td><td>${safeHtml(r.musteri)}</td><td>${safeHtml(r.nereden)} → ${safeHtml(r.nereye)}</td><td class="money">${fmt(r.portifUcr)}</td><td class="money">${fmt(realProfit(r))}</td></tr>`).join("")}</tbody></table>`;
    printSimpleDoc(`Şoför Ekstresi - ${name === "all" ? "Tüm Şoförler" : name}`, html);
  }
  function exportV10Excel() {
    const html = `<html><head><meta charset="UTF-8"></head><body><h2>V10 Finans Raporu</h2><table><thead><tr><th>Fatura</th><th>Tarih</th><th>Müşteri</th><th>Şoför</th><th>Güzergah</th><th>Ara Toplam</th><th>KDV</th><th>Ödenen</th><th>Bakiye</th><th>Net Kar</th></tr></thead><tbody>${invoiceRows.map(r=>`<tr><td>${safeHtml(r.invoiceNo)}</td><td>${safeHtml(r.tarih)}</td><td>${safeHtml(r.musteri)}</td><td>${safeHtml(r.driver||"")}</td><td>${safeHtml(r.nereden)} → ${safeHtml(r.nereye)}</td><td>${r.subtotal}</td><td>${r.kdv}</td><td>${r.paid}</td><td>${r.debt}</td><td>${r.profit}</td></tr>`).join("")}</tbody></table></body></html>`;
    downloadText("\ufeff" + html, `v10_finans_raporu_${new Date().toISOString().slice(0,10)}.xls`, "application/vnd.ms-excel;charset=utf-8;");
  }
  const customerSummary = Object.entries(dataRows.reduce((a,r)=>{ const k=r.musteri||"-"; if(!a[k]) a[k]={trips:0,total:0,paid:0,debt:0}; a[k].trips++; a[k].total+=Number(r.tutar)||0; a[k].paid+=Number(r.paidAmount)||0; a[k].debt+=Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0); return a; },{})).sort((a,b)=>b[1].debt-a[1].debt);
  const driverSummary = Object.entries(dataRows.reduce((a,r)=>{ const k=r.driver||"Şoför yok"; if(!a[k]) a[k]={trips:0,earn:0,profit:0}; a[k].trips++; a[k].earn+=Number(r.portifUcr)||0; a[k].profit+=realProfit(r); return a; },{})).sort((a,b)=>b[1].earn-a[1].earn);
  return <main className="panel full finance-v10">
    <div className="v10-hero"><div><span>V10 Financial Core</span><h2>🧾 Fatura, Tahsilat, Cari Hesap ve Kâr Yönetimi</h2><p>Seferlerden otomatik fatura, müşteri/şoför ekstresi, ödeme kayıtları, KDV, bakiye ve kâr analizi tek merkezde.</p></div><div className="v10-actions"><Button onClick={exportV10Excel}>📊 Excel</Button><Button onClick={()=>printReport?.("V10 Finans Raporu", invoiceRows)}>📄 Genel Rapor</Button></div></div>
    <section className="v10-kpis"><div><span>Fatura Tutarı</span><b>{fmt(totals.subtotal)}</b><small>{invoiceRows.length} fatura</small></div><div><span>KDV %20</span><b>{fmt(totals.kdv)}</b><small>Bilgilendirme</small></div><div><span>Tahsilat</span><b>{fmt(totals.paid)}</b><small>Kasa girişi</small></div><div><span>Açık Bakiye</span><b>{fmt(totals.debt)}</b><small>Takip edilecek</small></div><div><span>Net Kâr</span><b>{fmt(totals.profit)}</b><small>Sefer bazlı</small></div></section>
    <section className="v10-alerts">{alerts.map((a,i)=><div key={i} className={`v10-alert ${a.level}`}>{a.text}</div>)}</section>
    <section className="v10-grid"><div className="v10-card wide"><div className="v10-card-head"><h3>🧾 Otomatik Faturalar</h3><button onClick={exportV10Excel}>Excel</button></div><div className="v10-table-wrap"><table className="v10-table"><thead><tr><th>Fatura</th><th>Tarih</th><th>Müşteri</th><th>Güzergah</th><th>Tutar</th><th>KDV</th><th>Ödenen</th><th>Bakiye</th><th></th></tr></thead><tbody>{invoiceRows.slice(0,12).map(r=><tr key={r.id}><td><b>{r.invoiceNo}</b></td><td>{r.tarih}</td><td>{r.musteri}</td><td>{r.nereden} → {r.nereye}</td><td>{fmt(r.subtotal)}</td><td>{fmt(r.kdv)}</td><td>{fmt(r.paid)}</td><td className={r.debt>0?"debt":"ok"}>{fmt(r.debt)}</td><td><button onClick={()=>printInvoice(r)}>PDF</button></td></tr>)}</tbody></table></div></div><div className="v10-card"><h3>💳 Tahsilat / Ödeme Kaydı</h3><form onSubmit={addReceipt} className="v10-form"><select value={receiptForm.type} onChange={e=>setReceiptForm({...receiptForm,type:e.target.value,party:""})}><option value="customer_payment">Müşteri tahsilatı</option><option value="driver_payment">Şoför ödemesi</option><option value="expense">Gider ödemesi</option></select><select value={receiptForm.party} onChange={e=>setReceiptForm({...receiptForm,party:e.target.value})}><option value="">Cari seç</option>{parties.map(p=><option key={p} value={p}>{p}</option>)}</select><input type="number" placeholder="Tutar" value={receiptForm.amount} onChange={e=>setReceiptForm({...receiptForm,amount:e.target.value})}/><input type="date" value={receiptForm.date} onChange={e=>setReceiptForm({...receiptForm,date:e.target.value})}/><input placeholder="Açıklama" value={receiptForm.note} onChange={e=>setReceiptForm({...receiptForm,note:e.target.value})}/><Button>Kaydet</Button></form><div className="v10-mini-list">{financeReceipts.slice(0,6).map(r=><div key={r.id}><b>{r.party}</b><span>{r.date} • {fmt(r.amount)}</span></div>)}</div></div></section>
    <section className="v10-grid three"><div className="v10-card"><div className="v10-card-head"><h3>👥 Müşteri Cari</h3><button onClick={()=>printCustomerStatement(partyFilter)}>PDF</button></div><select className="control" value={partyFilter} onChange={e=>setPartyFilter(e.target.value)}><option value="all">Tüm cariler</option>{customers.map(c=><option key={c} value={c}>{c}</option>)}</select><div className="v10-mini-list">{customerSummary.slice(0,8).map(([name,v])=><div key={name}><b>{name}</b><span>{v.trips} sefer • Bakiye {fmt(v.debt)}</span></div>)}</div></div><div className="v10-card"><div className="v10-card-head"><h3>🚚 Şoför Cari</h3><button onClick={()=>printDriverStatement(partyFilter)}>PDF</button></div><div className="v10-mini-list">{driverSummary.slice(0,8).map(([name,v])=><div key={name}><b>{name}</b><span>{v.trips} sefer • Hakediş {fmt(v.earn)}</span></div>)}</div></div><div className="v10-card"><h3>📈 Profit Report</h3><div className="v10-mini-list">{invoiceRows.slice(0,8).map(r=><div key={r.id}><b>{r.serial} • {r.musteri}</b><span>Gelir {fmt(r.subtotal)} / Kâr {fmt(r.profit)}</span></div>)}</div></div></section>
  </main>;
}

function FinanceHub({ rows, allRows, receipts, setReceipts, stats, canReports, printReport, reportPdf, exportExcel, bulkPaymentReminder, filters }) {
  return <HubShell title="💼 Finans & Raporlar" subtitle="Muhasebe, fatura, tahsilat, cari hesap, gider, arşiv ve raporlar tek finans merkezinde." tabs={[
    { key:"v10", icon:"🧾", label:"V10 Finans Core", desc:"Fatura, tahsilat, cari ve kâr", render:()=> <FinanceV10Suite rows={rows} allRows={allRows} receipts={receipts} setReceipts={setReceipts} printReport={printReport} /> },
    { key:"accounting", icon:"💼", label:"Muhasebe", desc:"Kasa ve tahsilat", render:()=> <AccountingPage rows={rows} receipts={receipts} printReport={printReport} /> },
    { key:"expenses", icon:"⛽", label:"Giderler", desc:"Masraf kontrolü", render:()=> <ExpensesPage rows={rows} stats={stats} printReport={printReport} /> },
    { key:"archive", icon:"🗂️", label:"Arşiv", desc:"Aylık arşiv", render:()=> <ArchivePage rows={allRows} printReport={printReport} /> },
    ...(canReports ? [{ key:"reports", icon:"📄", label:"Raporlar", desc:"PDF / Excel", render:()=> <ReportsPage {...filters} printReport={printReport} reportPdf={reportPdf} exportExcel={exportExcel} bulkPaymentReminder={bulkPaymentReminder} stats={stats} /> }] : [])
  ]} />;
}

function SmartManagementHub({ rows, drivers, vehicles, customers, stats, users, notificationItems, setTab }) {
  return <HubShell title="🤖 Akıllı Yönetim Merkezi" subtitle="AI Asistan, AI Brain, Control Tower, AI OS ve Ecosystem modülleri tek gelişmiş karar merkezinde." tabs={[
    { key:"assistant", icon:"🤖", label:"AI Asistan", desc:"Komut ve analiz", render:()=> <AiAssistantPage rows={rows} customers={customers} stats={stats} /> },
    { key:"brain", icon:"🧠", label:"AI Brain", desc:"Tahmin ve içgörü", render:()=> <AILogisticsBrain rows={rows} drivers={drivers} vehicles={vehicles} customers={customers} stats={stats} setTab={setTab} /> },
    { key:"tower", icon:"🌍", label:"Control Tower", desc:"Stratejik kontrol", render:()=> <GlobalControlTower rows={rows} drivers={drivers} vehicles={vehicles} customers={customers} notificationItems={notificationItems} stats={stats} setTab={setTab} /> },
    { key:"os", icon:"🧠", label:"AI OS", desc:"Yönetim sistemi", render:()=> <AIOperatingSystem rows={rows} drivers={drivers} vehicles={vehicles} customers={customers} stats={stats} users={users} setTab={setTab} /> },
    { key:"eco", icon:"🚀", label:"Ecosystem", desc:"Büyüme modülü", render:()=> <EnterpriseEcosystemExpansion rows={rows} drivers={drivers} vehicles={vehicles} users={users} customers={customers} stats={stats} setTab={setTab} /> }
  ]} />;
}

function SystemHub({ backup, importBackup, users, setUsers, drivers, setDrivers, currentUser, setCurrentUser, themeName, setThemeName, brandAssets, setBrandAssets, openWorkTab, rows, vehicles, cloudSyncState, onManualSync }) {
  return <HubShell title="⚙️ Sistem Merkezi" subtitle="Ayarlar, profesyonel araçlar, bulut, PWA, SaaS ve çoklu şube altyapısı tek sistem panelinde." tabs={[
    { key:"settings", icon:"⚙️", label:"Ayarlar", desc:"Kullanıcı ve veri", render:()=> <SettingsPage {...{backup,importBackup,users,setUsers,drivers,setDrivers,currentUser,setCurrentUser}} /> },
    { key:"tools", icon:"🧩", label:"Pro Tools", desc:"Tema ve marka", render:()=> <ProToolsPage {...{themeName,setThemeName,brandAssets,setBrandAssets,backup,openWorkTab}} /> },
    { key:"cloud", icon:"☁️", label:"Cloud", desc:"Supabase bağlantısı", render:()=> <CloudSyncPanel cloudSyncState={cloudSyncState} onManualSync={onManualSync} /> },
    { key:"pwa", icon:"📱", label:"PWA", desc:"Telefon kurulumu", render:()=> <PwaPage /> },
    { key:"saas", icon:"🧩", label:"SaaS", desc:"Kurumsal model", render:()=> <SaaSManagementCenter rows={rows} users={users} drivers={drivers} vehicles={vehicles} /> },
    { key:"franchise", icon:"🏢", label:"Multi Branch", desc:"Şube sistemi", render:()=> <MultiBranchFranchiseCenter rows={rows} users={users} drivers={drivers} vehicles={vehicles} /> }
  ]} />;
}

function BranchesPage({ branches, setBranches, rows, drivers, vehicles, selectedBranch, setSelectedBranch }) {
  const [form, setForm] = useState({ name: "", city: "", manager: "", phone: "", note: "", active: true });
  const [editId, setEditId] = useState(null);
  const branchRows = (id) => rows.filter(r => (r.branchId || "merkez") === id);
  const branchStats = (id) => summarizeLocal(branchRows(id));
  function summarizeLocal(list) {
    const total = list.reduce((s,r)=>s+(Number(r.tutar)||0),0);
    const paid = list.reduce((s,r)=>s+(Number(r.paidAmount)||0),0);
    const debt = list.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0);
    return { trips:list.length, total, paid, debt };
  }
  function saveBranch(e) {
    e.preventDefault();
    if (!form.name.trim()) return alert("Şube adı gerekli.");
    const payload = { ...form, id: editId || normalizeText(form.name).replace(/\s+/g,"-") + "-" + Date.now(), active: form.active !== false };
    if (editId) setBranches(prev => prev.map(b => b.id === editId ? payload : b));
    else setBranches(prev => [payload, ...prev]);
    setForm({ name: "", city: "", manager: "", phone: "", note: "", active: true });
    setEditId(null);
  }
  function startEdit(b) { setEditId(b.id); setForm({ ...b }); }
  function removeBranch(id) {
    if (id === "merkez") return alert("Merkez şube silinemez.");
    if (!window.confirm("Bu şube pasife alınsın mı?")) return;
    setBranches(prev => prev.map(b => b.id === id ? { ...b, active:false } : b));
    if (selectedBranch === id) setSelectedBranch("all");
  }
  const totals = summarizeLocal(selectedBranch === "all" ? rows : branchRows(selectedBranch));
  return <main className="panel full branch-page">
    <div className="topline"><h2>🏢 Şube Yönetim Paneli</h2><div className="muted">Çoklu şube operasyon, rapor ve yetki altyapısı</div></div>
    <section className="branch-hero">
      <div className="branch-hero-card"><span>Aktif Filtre</span><b>{selectedBranch === "all" ? "Tüm Şubeler" : branches.find(b=>b.id===selectedBranch)?.name}</b></div>
      <div className="branch-hero-card"><span>Sefer</span><b>{totals.trips}</b></div>
      <div className="branch-hero-card"><span>Gelir</span><b>{fmt(totals.total)}</b></div>
      <div className="branch-hero-card"><span>Alacak</span><b>{fmt(totals.debt)}</b></div>
    </section>
    <section className="branch-layout">
      <form className="branch-form" onSubmit={saveBranch}>
        <h3>{editId ? "Şube Düzenle" : "Yeni Şube"}</h3>
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Şube adı" />
        <input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Şehir" />
        <input value={form.manager} onChange={e=>setForm({...form,manager:e.target.value})} placeholder="Yetkili" />
        <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Telefon" />
        <textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Not" />
        <label className="branch-check"><input type="checkbox" checked={form.active !== false} onChange={e=>setForm({...form,active:e.target.checked})}/> Aktif şube</label>
        <div className="buttons"><Button type="submit">Kaydet</Button>{editId && <Button onClick={()=>{setEditId(null);setForm({ name:"",city:"",manager:"",phone:"",note:"",active:true });}}>Vazgeç</Button>}</div>
      </form>
      <div className="branch-list">
        {branches.map(b => { const st=branchStats(b.id); return <div className={'branch-card ' + (!b.active ? 'passive':'')} key={b.id}>
          <div className="branch-card-head"><div><b>{b.name}</b><span>{b.city || "Şehir belirtilmedi"}</span></div><em>{b.active ? "Aktif" : "Pasif"}</em></div>
          <div className="branch-meta"><span>Yetkili: <b>{b.manager || "-"}</b></span><span>Telefon: <b>{b.phone || "-"}</b></span></div>
          <div className="branch-kpis"><div><small>Sefer</small><strong>{st.trips}</strong></div><div><small>Gelir</small><strong>{fmt(st.total)}</strong></div><div><small>Tahsilat</small><strong>{fmt(st.paid)}</strong></div><div><small>Alacak</small><strong>{fmt(st.debt)}</strong></div></div>
          {b.note && <p>{b.note}</p>}
          <div className="buttons compact"><Button onClick={()=>setSelectedBranch(b.id)}>Bu Şubeyi Gör</Button><Button onClick={()=>startEdit(b)}>Düzenle</Button><Button onClick={()=>removeBranch(b.id)}>Pasife Al</Button></div>
        </div> })}
      </div>
    </section>
  </main>;
}


function AIOperasyonAsistani({ data = [], drivers = [], customers = [], stats = {}, setTab, setQuery }) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState(null);

  const unpaid = data.filter(r => paymentStatus(r) !== "paid" && (Number(r.tutar)||0) > 0);
  const delayed = data.filter(r => r.tripStatus !== "delivered" && (Number(r.tutar)||0) > 0 && daysBetween(r.tarih) >= 2);
  const onRoad = data.filter(r => r.tripStatus === "onRoad");
  const pending = data.filter(r => r.tripStatus === "pending" || r.tripStatus === "received");
  const topCustomer = customers?.[0];

  function buildInsight() {
    const q = normalizeText(prompt);
    if (!q) return {
      title: "Nasıl yardımcı olabilirim?",
      text: "Örnek: geciken seferler, borçlu müşteriler, bugün raporu, en iyi müşteri, şoför performansı.",
      actions: []
    };

    if (q.includes("borc") || q.includes("odeme") || q.includes("odenmedi") || q.includes("alacak")) {
      return {
        title: "Ödeme ve Borç Analizi",
        text: `${unpaid.length} adet ödemesi eksik sefer var. Toplam alacak: ${fmt(unpaid.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0))}.`,
        rows: unpaid.slice(0, 6),
        actions: [{ label: "Borçlu seferleri aç", run: () => { setTab("seferler"); setQuery("ödenmedi"); } }]
      };
    }

    if (q.includes("gec") || q.includes("delay") || q.includes("geciken") || q.includes("gecikme")) {
      return {
        title: "Geciken Operasyonlar",
        text: `${delayed.length} adet geciken sefer bulundu. Bu kayıtlar öncelikli takip edilmeli.`,
        rows: delayed.slice(0, 6),
        actions: [{ label: "Gecikenleri göster", run: () => { setTab("seferler"); setQuery("bekliyor"); } }]
      };
    }

    if (q.includes("sofor") || q.includes("şoför") || q.includes("surucu") || q.includes("sürücü")) {
      const driverStats = drivers.map(d => {
        const rows = data.filter(r => r.driver === d.name);
        return { name:d.name, trips:rows.length, revenue:rows.reduce((s,r)=>s+(Number(r.tutar)||0),0), status:d.status };
      }).sort((a,b)=>b.revenue-a.revenue);
      return {
        title: "Şoför Performans Özeti",
        text: `En aktif şoför: ${driverStats[0]?.name || "-"}. Toplam aktif şoför: ${drivers.length}.`,
        driverStats,
        actions: [{ label: "Şoförler sayfasını aç", run: () => setTab("drivers") }]
      };
    }

    if (q.includes("bugun") || q.includes("bugün") || q.includes("gunluk") || q.includes("günlük") || q.includes("rapor")) {
      const todayKey = dateKey(new Date().toLocaleDateString("tr-TR"));
      const todayRows = data.filter(r => dateKey(r.tarih) === todayKey);
      const total = todayRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
      return {
        title: "Günlük Operasyon Raporu",
        text: `Bugün ${todayRows.length} sefer var. Günlük toplam gelir: ${fmt(total)}. Yolda: ${onRoad.length}, bekleyen: ${pending.length}, geciken: ${delayed.length}.`,
        rows: todayRows.slice(0, 6),
        actions: [{ label: "Raporları aç", run: () => setTab("reports") }]
      };
    }

    if (q.includes("musteri") || q.includes("müşteri") || q.includes("vip")) {
      return {
        title: "Müşteri Analizi",
        text: `En değerli müşteri: ${topCustomer?.[0] || "-"}. Toplam müşteri sayısı: ${customers.length}.`,
        actions: [{ label: "CRM sayfasını aç", run: () => setTab("customers") }]
      };
    }

    return {
      title: "Akıllı Özet",
      text: `Toplam ${data.length} sefer, ${fmt(stats.total || 0)} gelir, ${fmt(stats.profit || 0)} net kâr, ${unpaid.length} alacak kaydı, ${delayed.length} geciken sefer tespit edildi.`,
      actions: [
        { label: "Seferlere git", run: () => setTab("seferler") },
        { label: "Muhasebeyi aç", run: () => setTab("accounting") },
        { label: "Bildirimleri aç", run: () => setTab("notifications") }
      ]
    };
  }

  function ask(e) {
    e?.preventDefault();
    setAnswer(buildInsight());
  }

  const quick = [
    "Geciken seferleri göster",
    "Borçlu müşterileri analiz et",
    "Bugün raporu",
    "Şoför performansı",
    "En iyi müşteri kim?",
    "Operasyon risklerini özetle"
  ];

  return <main className="panel full ai-assistant-page">
    <div className="ai-hero">
      <div>
        <span className="section-kicker">Akıllı Operasyon</span>
        <h2>🤖 AI Operasyon Asistanı</h2>
        <p>Sefer, müşteri, ödeme, şoför ve operasyon verilerini hızlıca analiz eden yerleşik asistan.</p>
      </div>
      <div className="ai-status">Local AI Ready</div>
    </div>

    <div className="ai-grid">
      <section className="ai-chat-card">
        <form className="ai-input-row" onSubmit={ask}>
          <input value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Örn: Borçlu müşterileri göster, geciken seferleri analiz et..." />
          <button type="submit">Analiz Et</button>
        </form>
        <div className="ai-quick-actions">
          {quick.map(q => <button key={q} type="button" onClick={()=>{setPrompt(q); setTimeout(()=>setAnswer(buildInsight()), 0);}}>{q}</button>)}
        </div>

        {answer ? <div className="ai-answer">
          <h3>{answer.title}</h3>
          <p>{answer.text}</p>
          {answer.rows && <div className="ai-result-list">{answer.rows.map(r => <div key={r.id} className="ai-result-row"><b>{r.serial}</b><span>{r.musteri}</span><small>{r.nereden} → {r.nereye}</small><em>{fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}</em></div>)}</div>}
          {answer.driverStats && <div className="ai-result-list">{answer.driverStats.slice(0,6).map(d => <div key={d.name} className="ai-result-row"><b>{d.name}</b><span>{d.trips} sefer</span><small>{driverStatusLabel(d.status)}</small><em>{fmt(d.revenue)}</em></div>)}</div>}
          <div className="ai-answer-actions">{answer.actions?.map(a => <button key={a.label} onClick={a.run}>{a.label}</button>)}</div>
        </div> : <div className="ai-empty">
          <b>Hazır bekliyorum.</b>
          <span>Komut yazın veya hazır önerilerden birini seçin.</span>
        </div>}
      </section>

      <aside className="ai-insights">
        <div><b>{delayed.length}</b><span>Geciken Sefer</span></div>
        <div><b>{unpaid.length}</b><span>Alacak Kaydı</span></div>
        <div><b>{onRoad.length}</b><span>Yolda</span></div>
        <div><b>{fmt(stats.profit || 0)}</b><span>Net Kâr</span></div>
      </aside>
    </div>
  </main>;
}


function DashboardPage({ data, dashboardStats, routes, customers, delayedRows, currentUser, notificationItems = [], setTab }) {
  const [statsPeriod, setStatsPeriod] = useState(7);
  const [statsMode, setStatsMode] = useState("quick");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const delivered = data.filter(r=>r.tripStatus==="delivered").length;
  const onRoad = data.filter(r=>r.tripStatus==="onRoad").length;
  const waiting = data.filter(r=>r.tripStatus==="pending" || r.tripStatus==="received").length;
  const topCustomer = customers[0];
  const collectionRate = dashboardStats.total ? Math.round((dashboardStats.paidTotal / dashboardStats.total) * 100) : 0;
  const profitRate = dashboardStats.total ? Math.round((dashboardStats.profit / dashboardStats.total) * 100) : 0;
  const today = new Date();
  today.setHours(23,59,59,999);
  const customActive = statsMode === "custom" && customStartDate && customEndDate;
  const periodStart = customActive ? new Date(customStartDate + "T00:00:00") : new Date();
  if (!customActive) periodStart.setDate(today.getDate() - statsPeriod + 1);
  periodStart.setHours(0,0,0,0);
  const periodEnd = customActive ? new Date(customEndDate + "T23:59:59") : today;
  const selectedDays = Math.max(1, Math.round((periodEnd - periodStart) / 86400000) + 1);
  const prevStart = new Date(periodStart);
  prevStart.setDate(periodStart.getDate() - selectedDays);
  const inRange = (row, from, to) => {
    const k = dateKey(row.tarih);
    if (!k) return false;
    const d = new Date(k + 'T00:00:00');
    return d >= from && d <= to;
  };
  const periodRows = data.filter(r=>inRange(r, periodStart, periodEnd));
  const previousRows = data.filter(r=>inRange(r, prevStart, new Date(periodStart.getTime()-86400000)));
  const periodTotal = periodRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
  const previousTotal = previousRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
  const periodChange = previousTotal ? Math.round(((periodTotal-previousTotal)/previousTotal)*100) : (periodTotal ? 100 : 0);
  const periodLabel = customActive ? "Özel Tarih Aralığı" : (statsPeriod===7 ? "Son 1 Hafta" : statsPeriod===14 ? "Son 2 Hafta" : "Son 1 Ay");
  const periodDateLabel = `${periodStart.toLocaleDateString("tr-TR",{day:"2-digit",month:"long"})} - ${periodEnd.toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric"})}`;
  const dailySeries = Array.from({length:selectedDays}).map((_,i)=>{
    const d=new Date(periodStart);
    d.setDate(periodStart.getDate()+i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const total=data.filter(r=>dateKey(r.tarih)===key).reduce((s,r)=>s+(Number(r.tutar)||0),0);
    return { key, total, label:d.toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}), day:d.toLocaleDateString("tr-TR",{weekday:"short"}) };
  });
  const monthlySeries = Array.from({length:6}).map((_,i)=>{
    const d=new Date();
    d.setMonth(d.getMonth()-5+i, 1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const label=d.toLocaleDateString("tr-TR", { month:"short", year:"numeric" });
    const total=data.filter(r=>dateKey(r.tarih).startsWith(key)).reduce((s,r)=>s+(Number(r.tutar)||0),0);
    return { key, label, total };
  });
  const maxDaily = Math.max(...dailySeries.map(x=>x.total), 1);
  const maxMonthly = Math.max(...monthlySeries.map(x=>x.total), 1);
  const currentMonth = monthlySeries[monthlySeries.length-1]?.total || 0;
  const prevMonth = monthlySeries[monthlySeries.length-2]?.total || 0;
  const monthlyChange = prevMonth ? Math.round(((currentMonth-prevMonth)/prevMonth)*100) : (currentMonth ? 100 : 0);
  const linePoints = monthlySeries.map((m,i)=>`${i*(100/(monthlySeries.length-1))},${100-(m.total/maxMonthly)*78-10}`).join(" ");
  const highestDay = [...dailySeries].sort((a,b)=>b.total-a.total)[0];
  const lowestPositiveDay = [...dailySeries].filter(x=>x.total>0).sort((a,b)=>a.total-b.total)[0] || dailySeries[0];
  const dailyAverage = Math.round(periodTotal / Math.max(selectedDays,1));
  const tripIncome = dashboardStats.total || 0;
  const extraIncome = data.reduce((s,r)=>s+(Number(r.extraIncome)||Number(r.ekGelir)||0),0);
  const otherIncome = Math.max(0, dashboardStats.paidTotal - tripIncome - extraIncome);
  const incomeParts = [
    ["Taşıma Gelirleri", tripIncome],
    ["Ek Hizmetler", extraIncome],
    ["Diğer Gelirler", otherIncome]
  ];
  const recentRows = [...data].sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih))).slice(0,4);
  const executiveAlerts = [
    delayedRows.length ? `${delayedRows.length} geciken sefer acil takip istiyor.` : "Gecikme riski düşük.",
    dashboardStats.debt ? `${fmt(dashboardStats.debt)} açık alacak var.` : "Açık alacak yok.",
    profitRate < 20 ? "Kâr marjı düşük; gider ve fiyatlar kontrol edilmeli." : "Kâr marjı sağlıklı görünüyor."
  ];
  return <main className="grid-page dashboard-pro modern-erp-dashboard">
    <section className="cards executive-kpis">
      <div className="stat kpi-card"><i>💵</i><span>Toplam Gelir</span><b>{fmt(dashboardStats.total)}</b><small className="up">↗ %{Math.max(periodChange,0)} Önceki döneme göre</small></div>
      <div className="stat kpi-card"><i>🚚</i><span>Tahsilat</span><b>{fmt(dashboardStats.paidTotal)}</b><small className="up">↗ %{collectionRate} tahsilat oranı</small></div>
      <div className="stat kpi-card"><i>📥</i><span>Alacaklar</span><b>{fmt(dashboardStats.debt)}</b><small className={dashboardStats.debt ? "down" : "up"}>{dashboardStats.debt ? "Ödeme takibi gerekli" : "Açık borç yok"}</small></div>
      <div className="stat kpi-card"><i>📈</i><span>Gerçek Kâr</span><b>{fmt(dashboardStats.profit)}</b><small className="up">↗ %{profitRate} kâr marjı</small></div>
      <div className="stat kpi-card"><i>🚛</i><span>Sefer</span><b>{dashboardStats.trips}</b><small>Operasyon toplamı</small></div>
    </section>

    <section className="period-selector glass-card">
      <div className="period-title"><i>📅</i><b>İstatistik Dönemi</b></div>
      <div className="period-buttons period-buttons-extended">
        {[7,14,30].map(n=><button key={n} onClick={()=>{setStatsMode("quick"); setStatsPeriod(n);}} className={statsMode==="quick" && statsPeriod===n ? "active" : ""}>{n===7?"Son 1 Hafta":n===14?"Son 2 Hafta":"Son 1 Ay"}</button>)}
        <button onClick={()=>setStatsMode("custom")} className={statsMode==="custom" ? "active" : ""}>Özel Tarih</button>
      </div>
      <div className="period-date period-date-range">
        {statsMode!=="custom" && (
          <span>📅 {periodDateLabel}</span>
        )}
        {statsMode==="custom" && (
          <div className="custom-date-boxes">
            <div className="date-box">
              <label>Başlangıç</label>
              <input type="date" value={customStartDate} onChange={e=>{setCustomStartDate(e.target.value); setStatsMode("custom");}} />
            </div>
            <div className="date-box">
              <label>Bitiş</label>
              <input type="date" value={customEndDate} onChange={e=>{setCustomEndDate(e.target.value); setStatsMode("custom");}} />
            </div>
          </div>
        )}
      </div>
    </section>

    <section className="panel wide revenue-intelligence-panel main-chart-card">
      <div className="revenue-head">
        <div>
          <h2>📈 Gelir İstatistikleri</h2>
          <p>Seçilen döneme göre günlük gelir dağılımı</p>
        </div>
        <div className="chart-total"><span>TOPLAM</span><b>{fmt(periodTotal)}</b></div>
      </div>
      <div className="chart professional-chart">{dailySeries.map(d=> <div className="bar-wrap" key={d.key}><b>{d.total ? fmt(d.total) : "—"}</b><div className="bar" style={{height:Math.max(16, (d.total/maxDaily)*138)}}></div><span>{d.label}</span><small>{d.day}</small></div>)}</div>
      <div className="chart-insights">
        <div><i>📊</i><span>Günlük Ortalama</span><b>{fmt(dailyAverage)}</b><small>Bu dönem</small></div>
        <div><i>💹</i><span>En Yüksek Gün</span><b>{highestDay?.label || "—"}</b><small>{fmt(highestDay?.total || 0)}</small></div>
        <div><i>📉</i><span>En Düşük Gün</span><b>{lowestPositiveDay?.label || "—"}</b><small>{fmt(lowestPositiveDay?.total || 0)}</small></div>
        <div><i>📆</i><span>Toplam Gün</span><b>{selectedDays} Gün</b><small>{periodLabel}</small></div>
        <div><i>🚀</i><span>Artış Oranı</span><b className={periodChange>=0?"green":"red"}>{periodChange>=0?"↑":"↓"} %{Math.abs(periodChange)}</b><small>Önceki dönem</small></div>
      </div>
    </section>

    <aside className="side dashboard-side"><div className="panel compact"><h2>📍 En Çok Kullanılan Güzergahlar</h2>{routes.slice(0,5).map(([r,c])=><div className="route" key={r}><b>{r}</b><span>{c}</span></div>)}<button className="ghost-wide" onClick={()=>setTab?.("operations")}>Tümünü Görüntüle</button></div><div className="panel compact"><h2>👥 Tekrar Eden Müşteriler</h2>{customers.filter(([,c])=>c.trips>1).slice(0,5).map(([n,c])=><div className="route" key={n}><b>{n}</b><span>{c.trips}×</span></div>)}<button className="ghost-wide" onClick={()=>setTab?.("customers")}>Tümünü Görüntüle</button></div></aside>

    <section className="dashboard-lower-grid">
      <div className="pro-card income-distribution-card"><div className="pro-title">💎 Gelir Dağılımı <small>Gelir kalemlerine göre dağılım</small></div><div className="donut-wrap"><div className="donut-chart"></div><div className="donut-list">{incomeParts.map(([label,val],i)=><div key={label}><span className={`dot dot-${i}`}></span><b>{label}</b><small>{fmt(val)}</small></div>)}</div></div><div className="total-pill">Toplam: {fmt(dashboardStats.total)}</div></div>
      <div className="pro-card monthly-trend-card"><div className="monthly-line-title"><b>📊 Aylık Trend</b><span>Son 6 ay gelir trendi</span></div><svg className="monthly-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="monthlyRevenueGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#38bdf8"/><stop offset="55%" stopColor="#2563eb"/><stop offset="100%" stopColor="#12385c"/></linearGradient></defs><polyline points={linePoints} fill="none" stroke="url(#monthlyRevenueGradient)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />{monthlySeries.map((m,i)=>{ const x=i*(100/(monthlySeries.length-1)); const y=100-(m.total/maxMonthly)*78-10; return <circle key={m.key} cx={x} cy={y} r="2.2" fill="#2563eb"/>; })}</svg><div className="monthly-labels">{monthlySeries.map(m=><div key={m.key}><b>{fmt(m.total)}</b><span>{m.label}</span></div>)}</div><div className={`trend-pill mini ${monthlyChange >= 0 ? "up" : "down"}`}><span>Aylık Değişim</span><b>{monthlyChange >= 0 ? "+" : ""}%{monthlyChange}</b></div></div>
      <div className="pro-card recent-transactions-card"><div className="pro-title">🧾 Son İşlemler <small>En son gelir işlemleri</small></div>{recentRows.map(r=><div className="recent-row" key={r.id || `${r.tarih}-${r.musteri}`}><i>🚚</i><div><b>{(r.nereden||"-").toUpperCase()} → {(r.nereye||"-").toUpperCase()}</b><small>{r.musteri || "Taşıma Geliri"}</small></div><strong>{fmt(r.tutar)}</strong><span>{r.tarih}</span></div>)}<button className="ghost-wide" onClick={()=>setTab?.("operations")}>Tüm İşlemleri Görüntüle →</button></div>
    </section>
  </main>;
}
function ProCard({ title, items }) { return <div className="pro-card"><div className="pro-title">{title}</div>{items.map(([label,val,tone])=><div className={`status-item ${tone}`} key={label}><span>{label}</span><strong>{val}</strong></div>)}</div>; }
function Filters(props) { const {query,setQuery,dest,setDest,pay,setPay,dateMode,setDateMode,selectedDate,setSelectedDate,selectedMonth,setSelectedMonth,startDate,setStartDate,endDate,setEndDate,destinations,months,resetFilters,dateRef,printReport,reportPdf,exportExcel,hideReportActions=false} = props; return <div className="filters"><input className="control search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Akıllı ara: Reyhanlı ödenmedi, yolda, müşteri adı..." /><select className="control" value={dest} onChange={e=>setDest(e.target.value)}><option value="">Tüm varışlar</option>{destinations.map(d=><option key={d}>{d}</option>)}</select><select className="control" value={pay} onChange={e=>setPay(e.target.value)}><option value="">Ödeme Durumu</option><option value="paid">Ödendi</option><option value="partial">Kısmi</option><option value="unpaid">Ödenmedi</option></select><select className="control" value={dateMode} onChange={e=>setDateMode(e.target.value)}><option value="all">Tümü</option><option value="day">Özel tarih</option><option value="range">Tarih aralığı</option><option value="month">Rapor Ayı</option></select>{dateMode==="day" && <div className="control datebox pro-datebox" onClick={()=>dateRef.current?.showPicker ? dateRef.current.showPicker() : dateRef.current?.focus()}><span>📅 Özel tarih</span><input ref={dateRef} type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} /></div>}{dateMode==="range" && <><div className="control datebox pro-datebox"><span>Başlangıç</span><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} /></div><div className="control datebox pro-datebox"><span>Bitiş</span><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} /></div></>}{dateMode==="month" && <select className="control" value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}><option value="">Rapor Ayı</option>{months.map(m=><option key={m}>{m}</option>)}</select>}<Button onClick={resetFilters}>Filtreleri Sıfırla</Button>{!hideReportActions && <Button onClick={()=>printReport("Seçili Filtre Raporu")}>📄 Rapor</Button>}{!hideReportActions && reportPdf && <Button onClick={()=>reportPdf("Seçili Filtre Raporu")}>⬇️ PDF</Button>}{!hideReportActions && exportExcel && <Button onClick={()=>exportExcel("Seçili Filtre")}>📊 Excel</Button>}</div>; }
function TripForm({ form, setForm, saveRow, cancel, drivers=[], existingCustomers=[] }) {
  const inputDate = trToInputDate(form.tarih);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const imageChange = (file, key="image") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set(key, reader.result);
    reader.readAsDataURL(file);
  };
  const [showSuggestions, setShowSuggestions] = useState(false);
  const customerSuggestions = existingCustomers.filter(c =>
    form.musteri && c.toLowerCase().includes(form.musteri.toLowerCase()) && c !== form.musteri
  ).slice(0, 6);
  function selectCustomer(name) {
    const phoneMap = {};
    try {
      const saved = JSON.parse(localStorage.getItem("seyitogullari_final_v2_full_upgrade") || "[]");
      saved.forEach(r => { if (r.musteri && r.phone) phoneMap[r.musteri] = r.phone; });
    } catch {}
    setForm(p => ({ ...p, musteri: name, phone: p.phone || phoneMap[name] || "" }));
    setShowSuggestions(false);
  }
  const debt = Math.max((Number(form.tutar)||0) - (Number(form.paidAmount)||0), 0);
  const profit = (Number(form.tutar)||0) - (Number(form.portifUcr)||0) - (Number(form.fuelCost)||0) - (Number(form.driverCost)||0) - (Number(form.tollCost)||0) - (Number(form.otherCost)||0);
  return <form className="form trip-form-enhanced" onSubmit={saveRow}>
    <div className="form-section-title">📋 Temel Bilgiler</div>
    <Field label="Tarih"><input type="date" value={inputDate} onChange={e=>set("tarih", inputToTRDate(e.target.value))}/></Field>
    <Field label="Müşteri *">
      <div style={{position:"relative"}}>
        <input value={form.musteri} onChange={e=>{set("musteri",e.target.value);setShowSuggestions(true);}} onBlur={()=>setTimeout(()=>setShowSuggestions(false),180)} placeholder="Müşteri adı girin..." autoComplete="off"/>
        {showSuggestions && customerSuggestions.length > 0 && <div className="autocomplete-dropdown">{customerSuggestions.map(c=><div key={c} onMouseDown={()=>selectCustomer(c)}>{c}</div>)}</div>}
      </div>
    </Field>
    <Field label="Telefon"><input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="05xx xxx xx xx"/></Field>
    <Field label="Şoför"><select value={form.driver||""} onChange={e=>set("driver",e.target.value)}><option value="">Seçiniz</option>{drivers.map(d=><option key={d.id}>{d.name}</option>)}</select></Field>
    <Field label="Araç / Plaka"><input value={form.plaka} onChange={e=>set("plaka",e.target.value.toUpperCase())} placeholder="Araç plakası veya modeli"/></Field>
    <Field label="Nereden *"><input value={form.nereden} onChange={e=>set("nereden",e.target.value)}/></Field>
    <Field label="Nereye *"><input value={form.nereye} onChange={e=>set("nereye",e.target.value)}/></Field><div className="form-section-title">💰 Mali Bilgiler</div>
    <Field label="Tutar (₺)"><input type="number" min="0" value={form.tutar} onChange={e=>set("tutar",Math.max(0,Number(e.target.value)||0))} placeholder="0"/></Field>
    <Field label="Ödenen (₺)"><input type="number" min="0" value={form.paidAmount} onChange={e=>set("paidAmount",Math.min(Math.max(0,Number(e.target.value)||0), Number(form.tutar)||0))} placeholder="0"/></Field>
    <Field label="Portif / Komisyon"><input type="number" min="0" value={form.portifUcr} onChange={e=>set("portifUcr",Math.max(0,Number(e.target.value)||0))} placeholder="Otomatik %10"/></Field>
    <Field label="Yakıt Gideri"><input type="number" min="0" value={form.fuelCost} onChange={e=>set("fuelCost",Math.max(0,Number(e.target.value)||0))}/></Field>
    <Field label="Şoför Gideri"><input type="number" min="0" value={form.driverCost} onChange={e=>set("driverCost",Math.max(0,Number(e.target.value)||0))}/></Field>
    <Field label="Yol / Köprü Ücreti"><input type="number" min="0" value={form.tollCost} onChange={e=>set("tollCost",Math.max(0,Number(e.target.value)||0))}/></Field>
    <Field label="Diğer Gider"><input type="number" min="0" value={form.otherCost} onChange={e=>set("otherCost",Math.max(0,Number(e.target.value)||0))}/></Field>
    {(Number(form.tutar) > 0) && <div className="form-profit-preview">
      <span>Kalan: <b className={debt?"red":"green"}>{fmt(debt)}</b></span>
      <span>Tahmini Kâr: <b className={profit>=0?"green":"red"}>{fmt(profit)}</b></span>
    </div>}
    <div className="form-section-title">📁 Durum ve Belgeler</div>
    <Field label="Sefer Durumu"><select value={form.tripStatus} onChange={e=>set("tripStatus",e.target.value)}>{TRIP_STATUS_FLOW.map(st=><option key={st} value={st}>{statusLabel(st)}</option>)}</select></Field>
    <Field label="Araç Fotoğrafı"><input type="file" accept="image/*" onChange={e=>imageChange(e.target.files?.[0],"image")}/></Field>
    <Field label="Teslim Fotoğrafı"><input type="file" accept="image/*" onChange={e=>imageChange(e.target.files?.[0],"deliveryImage")}/></Field>
    <Field label="Evrak Fotoğrafı"><input type="file" accept="image/*" onChange={e=>imageChange(e.target.files?.[0],"documentImage")}/></Field>
    <Field label="Teslim Alan / İmza"><input value={form.signature||""} onChange={e=>set("signature",e.target.value)} placeholder="Teslim alan kişi adı"/></Field>
    <Field label="Not"><input value={form.not} onChange={e=>set("not",e.target.value)} placeholder="Ek bilgi, hatırlatma..."/></Field>
    {form.image && <img alt="Araç" className="form-image" src={form.image}/>}
    {form.deliveryImage && <img alt="Teslim" className="form-image" src={form.deliveryImage}/>}
    {form.documentImage && <img alt="Evrak" className="form-image" src={form.documentImage}/>}
    <div className="form-actions"><Button type="submit">💾 Kaydet / Güncelle</Button><Button onClick={cancel}>İptal</Button></div>
  </form>;
}

function NewTripModal({ form, setForm, saveRow, onClose, drivers=[], existingCustomers=[] }) {
  const debt = Math.max((Number(form.tutar)||0) - (Number(form.paidAmount)||0), 0);
  const profit = (Number(form.tutar)||0) - (Number(form.portifUcr)||0) - (Number(form.fuelCost)||0) - (Number(form.driverCost)||0) - (Number(form.tollCost)||0) - (Number(form.otherCost)||0);
  const routeText = `${form.nereden || "Nereden"} → ${form.nereye || "Nereye"}`;
  return <div className="new-trip-modal-backdrop" onMouseDown={onClose}>
    <motion.div className="new-trip-modal" initial={{opacity:0, y:20, scale:.98}} animate={{opacity:1, y:0, scale:1}} onMouseDown={e=>e.stopPropagation()}>
      <div className="new-trip-modal-head">
        <div>
          <span className="new-trip-kicker">Yeni Sefer Oluştur</span>
          <h2>🚛 Profesyonel Sefer Kaydı</h2>
          <p>Müşteri, rota, ödeme, gider ve evrak bilgilerini tek düzenli pencereden girin.</p>
        </div>
        <button className="new-trip-close" type="button" onClick={onClose}>×</button>
      </div>
      <div className="new-trip-preview">
        <div><span>Rota</span><b>{routeText}</b></div>
        <div><span>Müşteri</span><b>{form.musteri || "Henüz seçilmedi"}</b></div>
        <div><span>Kalan</span><b className={debt?"red":"green"}>{fmt(debt)}</b></div>
        <div><span>Tahmini Kâr</span><b className={profit>=0?"green":"red"}>{fmt(profit)}</b></div>
      </div>
      <div className="new-trip-body">
        <TripForm form={form} setForm={setForm} saveRow={saveRow} cancel={onClose} drivers={drivers} existingCustomers={existingCustomers} />
      </div>
    </motion.div>
  </div>;
}


function DriverLinkModal({ data, onClose, onCopy }) {
  const trip = data?.trip || {};
  const rawPhone = trip.phone || trip.driverPhone || trip.sofor_phone || trip.driver_phone || trip.payload?.phone || "";
  const phone = normalizeWhatsappNumber(rawPhone);
  const route = `${trip.nereden || "-"} → ${trip.nereye || "-"}`;
  const plainMessage = `Merhaba,

${trip.serial || "Sefer"} numaralı sefer için şoför portal linkiniz aşağıdadır.

Müşteri: ${trip.musteri || trip.customer_name || "-"}
Güzergah: ${route}
Tarih: ${trip.tarih || "-"}

Durum güncelleme ve evrak/fotoğraf yükleme linki:
${data.url}`;
  const waText = encodeURIComponent(plainMessage);
  const sendToWhatsApp = async () => {
    try { await navigator.clipboard?.writeText(plainMessage); } catch {}
    if (!phone) {
      alert("Bu seferde telefon numarası bulunamadı. Mesaj panoya kopyalandı; WhatsApp açıldığında numarayı elle seçebilirsiniz.");
      const fallbackUrl = `https://api.whatsapp.com/send?text=${waText}`;
      const opened = window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = fallbackUrl;
      return;
    }
    const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${waText}`;
    const opened = window.open(waUrl, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = waUrl;
  };
  return <div className="driver-link-modal-backdrop">
    <div className="driver-link-modal">
      <button className="driver-link-x" onClick={onClose}>×</button>
      <div className="driver-link-icon">📱</div>
      <h2>{data.title}</h2>
      <p>{data.message}</p>
      <div className="driver-link-trip">
        <b>{trip.serial || "Sefer"}</b>
        <span>{trip.musteri || trip.customer_name || "-"}</span>
        <small>{route}</small>
        <small>WhatsApp: {phone ? `+${phone}` : "Bu seferde telefon yok"}</small>
      </div>
      <div className="driver-link-url">{data.url}</div>
      <div className="driver-link-actions">
        <button onClick={onCopy}>📋 Linki Kopyala</button>
        <button onClick={sendToWhatsApp}>{phone ? "💬 Numaraya WhatsApp Gönder" : "💬 WhatsApp Aç"}</button>
        <button className="ghost" onClick={()=>window.open(data.url, "_blank")}>🔗 Linki Aç</button>
      </div>
    </div>
  </div>;
}

function TripTable({ rows, selectedRow, setSelectedRow, startEdit, deleteRow, invoice, invoicePdf, whatsapp, copyTrip, printReceipt, copyDriverPortalLink, inlineEditId, form, setForm, saveRow, cancelEdit, compact, stats, canEdit, canDelete, drivers, updateTripStatus, updateTripAdvanced, selectedIds=[], setSelectedIds, setConfirmBox }) {
  const handleCopyDriverPortalLink = copyDriverPortalLink || (async (trip) => {
    const token = encodeURIComponent(trip?.local_id || trip?.id || trip?.serial || "");
    const url = `${window.location.origin}${window.location.pathname}#/driver/${token}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else window.prompt("Şoför linkini kopyalayın:", url);
      alert("Şoför linki kopyalandı. Bu linki WhatsApp ile şoföre gönderebilirsiniz.");
    } catch {
      window.prompt("Şoför linkini kopyalayın:", url);
    }
  });

  const [visibleCols, setVisibleCols] = useState({ phone:true, driver:true, vehicle:true, route:true, cost:true, profit:true });
  const allSelected = rows.length > 0 && rows.every(r => selectedIds.includes(r.id));
  const toggleAll = () => setSelectedIds?.(allSelected ? selectedIds.filter(id => !rows.some(r=>r.id===id)) : [...new Set([...selectedIds, ...rows.map(r=>r.id)])]);
  const toggleOne = (id) => setSelectedIds?.(selectedIds.includes(id) ? selectedIds.filter(x=>x!==id) : [...selectedIds, id]);
  const toggleCol = key => setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  const colSpan = 10 + (visibleCols.phone?1:0) + (visibleCols.driver?1:0) + (visibleCols.vehicle?1:0) + (visibleCols.route?2:0) + (visibleCols.cost?1:0) + (visibleCols.profit?1:0) + (!compact && invoicePdf?1:0) + (!compact?1:0);
  const selectedTrip = rows.find(x => x.id === selectedRow);

  return <>
  <div className="table-wrap professional-table professional-fixed">
    {!compact && <div className="table-commandbar glass-card">
      <div><b>Profesyonel Tablo</b><span>{rows.length} kayıt • {selectedIds.length} seçili</span></div>
      <div className="table-tools">
        {Object.entries({phone:"Telefon",driver:"Şoför",vehicle:"Araç",route:"Rota",cost:"Gider",profit:"Kâr"}).map(([k,l])=><button key={k} type="button" className={visibleCols[k]?"active":""} onClick={()=>toggleCol(k)}>{l}</button>)}
      </div>
    </div>}
    <div className="mobile-cards">{rows.map(r=><TripMobileCard key={r.id} row={r} invoicePdf={invoicePdf} onOpen={()=>setSelectedRow && setSelectedRow(selectedRow===r.id?null:r.id)} {...{startEdit,deleteRow,invoice,whatsapp,copyTrip,canEdit,canDelete}} />)}</div>
    <table>
      <thead><tr>
        {!compact && <th><input type="checkbox" checked={allSelected} onChange={toggleAll}/></th>}
        <th>No</th><th>Tarih</th><th>Müşteri</th>
        {visibleCols.phone && <th>Telefon</th>}{visibleCols.driver && <th>Şoför</th>}{visibleCols.vehicle && <th>Araç</th>}
        {visibleCols.route && <><th>Nereden</th><th>Nereye</th></>}
        <th>Tutar</th><th>Ödenen</th><th>Kalan</th>{visibleCols.cost && <th>Gider</th>}{visibleCols.profit && <th>Kâr</th>}<th>Ödeme</th><th>Sefer</th>{!compact && invoicePdf && <th>PDF</th>}
      </tr></thead>
      <tbody>{rows.map(r => { const status=paymentStatus(r), debt=Math.max(r.tutar-r.paidAmount,0); return <React.Fragment key={r.id}>
        <motion.tr layout data-row-id={r.id} onClick={()=>setSelectedRow && setSelectedRow(selectedRow===r.id?null:r.id)} className={selectedRow===r.id?"selected click-row":"click-row"}>
          {!compact && <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(r.id)} onChange={()=>toggleOne(r.id)}/></td>}
          <td><b className="trip-serial">{r.serial}</b></td><td>{r.tarih}</td><td><b className="trip-customer">{r.musteri}</b></td>
          {visibleCols.phone && <td>{r.phone||"—"}</td>}{visibleCols.driver && <td>{r.driver||"—"}</td>}{visibleCols.vehicle && <td>{r.plaka}</td>}
          {visibleCols.route && <><td>{r.nereden}</td><td><span className="pill">{r.nereye}</span></td></>}
          <td>{fmt(r.tutar)}</td><td className="green">{fmt(r.paidAmount)}</td><td className={debt?"red":"green"}>{fmt(debt)}</td>
          {visibleCols.cost && <td>{fmt(expenses(r))}</td>}{visibleCols.profit && <td className="green">{fmt(realProfit(r))}</td>}
          <td><span className={"badge "+status}>{paymentLabel(status)}</span></td>
          <td><div className="status-progress"><select className="mini-select" value={r.tripStatus} onClick={e=>e.stopPropagation()} onChange={e=>updateTripStatus?.(r.id,e.target.value)}>{TRIP_STATUS_FLOW.map(st=><option key={st} value={st}>{statusLabel(st)}</option>)}</select><i><em style={{width:`${tripStatusPercent(r.tripStatus)}%`}} /></i></div></td>
          {!compact && invoicePdf && <td onClick={e=>e.stopPropagation()}><Button className="pdf-direct-btn" onClick={()=>invoicePdf(r)}>📄 PDF</Button></td>}
        </motion.tr>
      </React.Fragment>})}</tbody>
      <tfoot><tr><td colSpan={colSpan}>Toplam Gelir: <b>{fmt(stats?.total)}</b> &nbsp; Tahsilat: <b>{fmt(stats?.paidTotal)}</b> &nbsp; Alacaklar: <b>{fmt(stats?.debt)}</b> &nbsp; Gider: <b>{fmt(stats?.gider)}</b> &nbsp; Gerçek Kâr: <b>{fmt(stats?.profit)}</b></td></tr></tfoot>
    </table>
  </div>
  <AnimatePresence>
    {!compact && selectedTrip && <motion.div className="trip-modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setSelectedRow?.(null)}>
      <motion.div className="trip-modal" initial={{opacity:0, y:24, scale:.98}} animate={{opacity:1, y:0, scale:1}} exit={{opacity:0, y:18, scale:.98}} transition={{duration:.18}} onClick={e=>e.stopPropagation()}>
        <div className="trip-modal-header">
          <div>
            <span className="trip-modal-kicker">Sefer Detayları</span>
            <h2>{selectedTrip.serial} • {selectedTrip.musteri}</h2>
            <p>{selectedTrip.nereden || "—"} → {selectedTrip.nereye || "—"} • {selectedTrip.tarih || "—"}</p>
          </div>
          <button type="button" className="trip-modal-close" onClick={()=>setSelectedRow?.(null)}>×</button>
        </div>
        {inlineEditId===selectedTrip.id ? <div className="trip-modal-edit"><TripForm form={form} setForm={setForm} saveRow={saveRow} cancel={cancelEdit} drivers={drivers} existingCustomers={[...new Set((rows||[]).map(r=>r.musteri).filter(Boolean))]}/></div> : <>
          <div className="trip-modal-summary">
            <div><span>Tutar</span><b>{fmt(selectedTrip.tutar)}</b></div>
            <div><span>Ödenen</span><b className="green">{fmt(selectedTrip.paidAmount)}</b></div>
            <div><span>Kalan</span><b className={Math.max((Number(selectedTrip.tutar)||0)-(Number(selectedTrip.paidAmount)||0),0)?"red":"green"}>{fmt(Math.max((Number(selectedTrip.tutar)||0)-(Number(selectedTrip.paidAmount)||0),0))}</b></div>
            <div><span>Şoför / Araç</span><b>{selectedTrip.driver || "—"} • {selectedTrip.plaka || "—"}</b></div>
          </div>
          <div className="trip-modal-actions">
            {canEdit && <Button onClick={()=>startEdit(selectedTrip)}>✏️ Güncelle</Button>}
            {canDelete && <Button className="danger-btn" onClick={()=>deleteRow(selectedTrip.id)}>🗑️ Sil</Button>}
            <Button onClick={()=>invoice(selectedTrip)}>📄 Fatura</Button>
            {invoicePdf && <Button style={{background:"#dc2626",color:"#fff",border:"none"}} onClick={()=>invoicePdf(selectedTrip)}>📄 PDF</Button>}
            {printReceipt && <Button onClick={()=>printReceipt(selectedTrip)}>🧾 Makbuz</Button>}
            <Button onClick={()=>whatsapp(selectedTrip)}>💬 WhatsApp</Button>
            <Button onClick={()=>whatsapp(selectedTrip,'payment')}>💸 Ödeme Hatırlat</Button>
            <Button onClick={()=>whatsapp(selectedTrip,'received')}>✅ Araç Alındı</Button>
            <Button onClick={()=>whatsapp(selectedTrip,'delivered')}>🏁 Teslim Mesajı</Button>
            <Button className="driver-link-btn" onClick={()=>handleCopyDriverPortalLink(selectedTrip)}>📱 Şoför Linki</Button>
            {copyTrip && <Button onClick={()=>copyTrip(selectedTrip)}>📋 Kopyala</Button>}
          </div>
          <div className="trip-selected-summary trip-modal-note"><div className="note"><b>Not:</b> {selectedTrip.not || "—"}</div>{selectedTrip.image && <img className="thumb" alt="Araç" src={selectedTrip.image}/>}</div>
          <TripDetailPanel row={selectedTrip} updateTripStatus={updateTripStatus} updateTripAdvanced={updateTripAdvanced} canEdit={canEdit} canDelete={canDelete} setConfirmBox={setConfirmBox} />
        </>}
      </motion.div>
    </motion.div>}
  </AnimatePresence>
  </>;
}

function TripDetailPanel({ row, updateTripStatus, updateTripAdvanced, canEdit, canDelete, setConfirmBox }) {
  const [activeTab, setActiveTab] = useState("general");
  const [taskText, setTaskText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [docType, setDocType] = useState("Teslim Fotoğrafı");
  const [docNote, setDocNote] = useState("");
  const [selectedDocFile, setSelectedDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [docUploadMessage, setDocUploadMessage] = useState("");
  const [cloudDocs, setCloudDocs] = useState([]);
  const [previewDoc, setPreviewDoc] = useState(null);
  const timeline = row.tripTimeline || [];
  const tasks = row.tripTasks || [];
  const docs = row.tripDocuments || [];
  const notes = row.tripNotes || [];

  useEffect(() => {
    let alive = true;
    if (!isEvrakCloudReady()) return;
    listTripEvrakFromCloud(row)
      .then(items => { if (alive) setCloudDocs(items || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [row?.id, row?.local_id, row?.serial]);
  function addTask() {
    if (!taskText.trim()) return;
    const task = { id: Date.now(), text: taskText.trim(), done: false, date: new Date().toLocaleString("tr-TR") };
    updateTripAdvanced?.(row.id, { tripTasks: [task, ...tasks] }, "Sefer görevi eklendi");
    setTaskText("");
  }
  function toggleTask(id) {
    updateTripAdvanced?.(row.id, { tripTasks: tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }, "Sefer görevi güncellendi");
  }
  function addNote() {
    if (!noteText.trim()) return;
    const note = { id: Date.now(), text: noteText.trim(), date: new Date().toLocaleString("tr-TR"), internal: true };
    updateTripAdvanced?.(row.id, { tripNotes: [note, ...notes] }, "Sefer notu eklendi");
    setNoteText("");
  }
  function addDocument(file) {
    if (!file) return;
    setSelectedDocFile(file);
    setDocUploadMessage(`${file.name} seçildi. Cloud'a yüklemek için butona basın.`);
  }

  async function uploadDocumentToCloud() {
    if (!selectedDocFile) {
      setDocUploadMessage("Önce dosya seçin.");
      return;
    }
    setUploadingDoc(true);
    setDocUploadMessage("Cloud'a yükleniyor...");
    try {
      const uploaded = await uploadTripEvrakToCloud({
        file: selectedDocFile,
        trip: row,
        docType,
        note: docNote,
        user: null,
      });
      const doc = {
        id: uploaded.local_id || Date.now(),
        type: docType,
        fileName: uploaded.file_name || selectedDocFile.name,
        fileType: uploaded.file_type || selectedDocFile.type,
        fileData: uploaded.public_url || uploaded.cloudUrl,
        cloudUrl: uploaded.public_url || uploaded.cloudUrl,
        cloudPath: uploaded.storage_path || uploaded.cloudPath,
        cloudStatus: "uploaded",
        note: docNote,
        date: new Date().toLocaleString("tr-TR"),
      };
      updateTripAdvanced?.(row.id, { tripDocuments: [doc, ...docs] }, "Sefer evrakı cloud'a yüklendi");
      setCloudDocs(prev => [uploaded, ...prev]);
      setSelectedDocFile(null);
      setDocNote("");
      setDocUploadMessage("Dosya cloud'a yüklendi ve sefere bağlandı.");
    } catch (err) {
      const msg = err?.message || "Cloud upload başarısız.";
      setDocUploadMessage(`Hata: ${msg}`);
    } finally {
      setUploadingDoc(false);
    }
  }
  async function runCloudDocumentDelete(doc) {
    const docId = doc.id || doc.local_id || doc.cloudPath || doc.storage_path;
    setDeletingDocId(docId);
    setDocUploadMessage("Evrak siliniyor...");
    try {
      await deleteTripEvrakFromCloud(doc);
      setCloudDocs(prev => prev.filter(x => (x.id || x.local_id || x.storage_path) !== docId && x.storage_path !== (doc.storage_path || doc.cloudPath)));
      const localKey = doc.cloudPath || doc.storage_path || doc.public_url || doc.cloudUrl || doc.fileData;
      if (localKey) {
        updateTripAdvanced?.(row.id, { tripDocuments: docs.filter(x => {
          const xKey = x.cloudPath || x.storage_path || x.public_url || x.cloudUrl || x.fileData;
          return xKey !== localKey && (x.cloudPath || x.storage_path) !== (doc.storage_path || doc.cloudPath);
        }) }, "Sefer evrakı silindi");
      }
      setDocUploadMessage("Evrak cloud'dan silindi.");
    } catch (err) {
      setDocUploadMessage(`Hata: ${err?.message || "Evrak silinemedi."}`);
    } finally {
      setDeletingDocId(null);
    }
  }

  function deleteCloudDocument(doc) {
    if (!canDelete) {
      setDocUploadMessage("Hata: Bu işlem için admin/silme yetkisi gerekir.");
      return;
    }
    const fileName = doc.file_name || doc.fileName || "Evrak";
    if (!setConfirmBox) {
      runCloudDocumentDelete(doc);
      return;
    }
    setConfirmBox({
      icon: "🗑️",
      title: "Cloud evrakı silinsin mi?",
      message: "Bu dosya Supabase Storage ve sefer evrak listesinden kalıcı olarak kaldırılacak.",
      details: `${fileName} • ${row.serial || row.id}`,
      confirmText: "Evet, kalıcı sil",
      cancelText: "Vazgeç",
      danger: true,
      onCancel: () => setConfirmBox(null),
      onConfirm: async () => {
        setConfirmBox(null);
        await runCloudDocumentDelete(doc);
      }
    });
  }

  function runLocalDocumentDelete(doc) {
    updateTripAdvanced?.(row.id, { tripDocuments: docs.filter(x => x.id !== doc.id) }, "Yerel sefer evrakı silindi");
    setDocUploadMessage("Yerel evrak silindi.");
  }

  function deleteLocalDocument(doc) {
    if (!canDelete) {
      setDocUploadMessage("Hata: Bu işlem için admin/silme yetkisi gerekir.");
      return;
    }
    const fileName = doc.fileName || "Evrak";
    if (!setConfirmBox) {
      runLocalDocumentDelete(doc);
      return;
    }
    setConfirmBox({
      icon: "🗑️",
      title: "Yerel evrak silinsin mi?",
      message: "Bu dosya yalnızca bu seferin yerel evrak listesinden kaldırılacak.",
      details: `${fileName} • ${row.serial || row.id}`,
      confirmText: "Evet, sil",
      cancelText: "Vazgeç",
      danger: true,
      onCancel: () => setConfirmBox(null),
      onConfirm: () => {
        setConfirmBox(null);
        runLocalDocumentDelete(doc);
      }
    });
  }

  function getDocUrl(doc) {
    return doc?.public_url || doc?.cloudUrl || doc?.fileData || "";
  }
  function getDocName(doc) {
    return doc?.file_name || doc?.fileName || "Evrak";
  }
  function getDocType(doc) {
    return doc?.doc_type || doc?.type || "Evrak";
  }
  function getDocDate(doc) {
    return doc?.created_at ? new Date(doc.created_at).toLocaleString("tr-TR") : (doc?.date || "—");
  }
  function getDocMime(doc) {
    const name = getDocName(doc).toLowerCase();
    return doc?.file_type || doc?.mime_type || (name.endsWith(".pdf") ? "application/pdf" : (name.match(/\.(png|jpe?g|webp|gif)$/) ? "image/*" : ""));
  }
  function isPreviewImage(doc) {
    const mime = getDocMime(doc);
    const name = getDocName(doc).toLowerCase();
    return String(mime).startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
  }
  function isPreviewPdf(doc) {
    const mime = getDocMime(doc);
    return mime === "application/pdf" || getDocName(doc).toLowerCase().endsWith(".pdf");
  }
  function openDocPreview(doc) {
    const url = getDocUrl(doc);
    if (!url) {
      setDocUploadMessage("Hata: Evrak bağlantısı bulunamadı.");
      return;
    }
    setPreviewDoc(doc);
  }
  function downloadDoc(doc) {
    const url = getDocUrl(doc);
    if (!url) return setDocUploadMessage("Hata: İndirilecek dosya bağlantısı bulunamadı.");
    const a = document.createElement("a");
    a.href = url;
    a.download = getDocName(doc);
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function copyDocLink(doc) {
    const url = getDocUrl(doc);
    if (!url) return setDocUploadMessage("Hata: Kopyalanacak bağlantı bulunamadı.");
    try {
      await navigator.clipboard.writeText(url);
      setDocUploadMessage("Dosya bağlantısı kopyalandı.");
    } catch {
      setDocUploadMessage("Hata: Bağlantı kopyalanamadı.");
    }
  }

  const cloudKeys = new Set((cloudDocs || []).flatMap(d => [d.storage_path, d.cloudPath, d.public_url, d.cloudUrl, d.file_name].filter(Boolean)));
  const visibleLocalDocs = (docs || []).filter(d => {
    const keys = [d.cloudPath, d.storage_path, d.cloudUrl, d.public_url, d.fileData, d.fileName].filter(Boolean);
    return !keys.some(k => cloudKeys.has(k));
  });
  const combinedDocsForStatus = [...visibleLocalDocs, ...(cloudDocs || []).map(d => ({ type: d.doc_type || d.type }))];
  const required = ["Fatura", "Yükleme İzni", "Teslim Fotoğrafı", "CMR"];
  const missing = required.filter(x => !combinedDocsForStatus.some(d => d.type === x));
  const debt = Math.max((Number(row.tutar)||0)-(Number(row.paidAmount)||0),0);
  const tabs = [
    { id:"general", label:"Genel Bilgi", icon:"🧭" },
    { id:"docs", label:"Evraklar", icon:"📎", badge: missing.length || null },
    { id:"tasks", label:"Görevler", icon:"✅", badge: tasks.filter(t=>!t.done).length || null },
    { id:"notes", label:"Notlar", icon:"📝", badge: notes.length || null },
    { id:"customer", label:"Müşteri", icon:"👤" }
  ];
  return <div className="trip-detail-tabs-shell">
    <div className="trip-detail-tabs">{tabs.map(t => <button type="button" key={t.id} className={activeTab===t.id ? "active" : ""} onClick={()=>setActiveTab(t.id)}><span>{t.icon}</span>{t.label}{t.badge ? <b>{t.badge}</b> : null}</button>)}</div>
    {activeTab === "general" && <div className="v11-detail-grid compact-tab">
      <section className="v11-card v11-wide">
        <div className="v11-card-head"><h3>🧭 Sefer Yaşam Döngüsü</h3><span>{statusLabel(row.tripStatus)} • %{tripStatusPercent(row.tripStatus)}</span></div>
        <div className="v11-flow">{TRIP_STATUS_FLOW.map(st => <button key={st} disabled={!canEdit} className={TRIP_STATUS_FLOW.indexOf(row.tripStatus) >= TRIP_STATUS_FLOW.indexOf(st) ? "done" : ""} onClick={() => updateTripStatus?.(row.id, st)}><b>{statusLabel(st)}</b></button>)}</div>
        <div className="v11-progress"><em style={{ width: `${tripStatusPercent(row.tripStatus)}%` }} /></div>
      </section>
      <section className="v11-card">
        <div className="v11-card-head"><h3>🚚 Sefer Bilgileri</h3><span>Operasyon özeti</span></div>
        <div className="trip-info-grid">
          <div><span>No</span><b>{row.serial || "—"}</b></div><div><span>Tarih</span><b>{row.tarih || "—"}</b></div>
          <div><span>Müşteri</span><b>{row.musteri || "—"}</b></div><div><span>Telefon</span><b>{row.phone || "—"}</b></div>
          <div><span>Nereden</span><b>{row.nereden || "—"}</b></div><div><span>Nereye</span><b>{row.nereye || "—"}</b></div>
          <div><span>Şoför</span><b>{row.driver || "—"}</b></div><div><span>Araç</span><b>{row.plaka || "—"}</b></div>
        </div>
      </section>
      <section className="v11-card">
        <div className="v11-card-head"><h3>💰 Finans Özeti</h3><span>{paymentLabel(paymentStatus(row))}</span></div>
        <div className="trip-info-grid finance">
          <div><span>Tutar</span><b>{fmt(row.tutar)}</b></div><div><span>Ödenen</span><b className="green">{fmt(row.paidAmount)}</b></div>
          <div><span>Kalan</span><b className={debt ? "red" : "green"}>{fmt(debt)}</b></div><div><span>Gider</span><b>{fmt(expenses(row))}</b></div>
          <div><span>Kâr</span><b className={realProfit(row)>=0 ? "green" : "red"}>{fmt(realProfit(row))}</b></div><div><span>Durum</span><b>{statusLabel(row.tripStatus)}</b></div>
        </div>
      </section>
      <section className="v11-card v11-wide">
        <div className="v11-card-head"><h3>📍 Tracking Timeline</h3><span>{timeline.length} olay</span></div>
        <div className="v11-timeline">{timeline.slice().reverse().map(t => <div key={t.id}><i /> <b>{t.title || statusLabel(t.status)}</b><small>{t.date}</small><p>{t.note}</p></div>)}{!timeline.length && <div className="empty-state">Henüz takip kaydı yok.</div>}</div>
      </section>
    </div>}
    {activeTab === "docs" && <section className="v11-card single-tab-card">
      <div className="v11-card-head"><h3>📎 Sefer Evrakları</h3><span>{missing.length ? `${missing.length} eksik` : "Tamam"}</span></div>
      {missing.length > 0 && <div className="v11-missing">Eksik: {missing.join(", ")}</div>}
      {canEdit && <div className="v11-doc-form evrak-cloud-form"><select value={docType} onChange={e=>setDocType(e.target.value)}>{TRIP_DOCUMENT_TYPES.map(x=><option key={x}>{x}</option>)}</select><input placeholder="Evrak notu" value={docNote} onChange={e=>setDocNote(e.target.value)} /><label className="evrak-file-picker"><input type="file" accept="image/*,application/pdf" onChange={e=>addDocument(e.target.files?.[0])} /><span>{selectedDocFile ? selectedDocFile.name : "Dosya Seç"}</span></label><Button className="cloud-upload-btn" disabled={uploadingDoc || !selectedDocFile} onClick={uploadDocumentToCloud}>{uploadingDoc ? "Yükleniyor..." : "☁️ Cloud'a Yükle"}</Button></div>}
      {docUploadMessage && <div className={docUploadMessage.startsWith("Hata") ? "evrak-upload-message error" : "evrak-upload-message"}>{docUploadMessage}</div>}
      <div className="v11-doc-list">
        {visibleLocalDocs.map(d => {
          const key = d.id || d.cloudPath || d.fileName;
          return <div key={key} className="evrak-doc-row evrak-doc-row-pro">
            <button type="button" className="evrak-doc-main" onClick={() => openDocPreview(d)}>
              <b>{getDocType(d)}{d.cloudStatus === "uploaded" ? " ☁️" : ""}</b>
              <span>{getDocName(d)}</span>
              <small>{getDocDate(d)}{d.note ? ` • ${d.note}` : ""}</small>
            </button>
            <div className="evrak-doc-actions">
              <button type="button" onClick={() => openDocPreview(d)}>👁️ Görüntüle</button>
              <button type="button" onClick={() => downloadDoc(d)}>⬇️ İndir</button>
              <button type="button" onClick={() => copyDocLink(d)}>🔗 Link</button>
              {canDelete && <button type="button" className="evrak-delete-btn" disabled={deletingDocId === d.id} onClick={()=> (d.cloudPath || d.storage_path || d.cloudUrl || String(d.fileData || '').includes('/storage/v1/object/public/evrak/')) ? deleteCloudDocument(d) : deleteLocalDocument(d)}>🗑 Sil</button>}
            </div>
          </div>;
        })}
        {!visibleLocalDocs.length && !cloudDocs.length && <div className="empty-state">Henüz evrak yüklenmedi.</div>}
      </div>
      {!!cloudDocs.length && <div className="v11-doc-list cloud-docs-list"><h4>Cloud Evrakları</h4>{cloudDocs.map(d => { const key = d.id || d.local_id || d.storage_path; return <div key={key} className="evrak-doc-row evrak-doc-row-pro">
        <button type="button" className="evrak-doc-main" onClick={() => openDocPreview(d)}>
          <b>{getDocType(d)} ☁️</b>
          <span>{getDocName(d)}</span>
          <small>{getDocDate(d)}{d.note ? ` • ${d.note}` : ""}</small>
        </button>
        <div className="evrak-doc-actions">
          <button type="button" onClick={() => openDocPreview(d)}>👁️ Görüntüle</button>
          <button type="button" onClick={() => downloadDoc(d)}>⬇️ İndir</button>
          <button type="button" onClick={() => copyDocLink(d)}>🔗 Link</button>
          {canDelete && <button type="button" className="evrak-delete-btn" disabled={deletingDocId === key} onClick={()=>deleteCloudDocument(d)}>{deletingDocId === key ? "Siliniyor..." : "🗑 Sil"}</button>}
        </div>
      </div>})}</div>}
      {previewDoc && <div className="evrak-preview-backdrop" onClick={() => setPreviewDoc(null)}>
        <div className="evrak-preview-modal" onClick={e => e.stopPropagation()}>
          <div className="evrak-preview-head">
            <div><span>EVRAK ÖNİZLEME</span><h3>{getDocName(previewDoc)}</h3><p>{getDocType(previewDoc)} • {getDocDate(previewDoc)}</p></div>
            <button type="button" onClick={() => setPreviewDoc(null)}>×</button>
          </div>
          <div className="evrak-preview-body">
            {isPreviewImage(previewDoc) ? <img src={getDocUrl(previewDoc)} alt={getDocName(previewDoc)} /> : isPreviewPdf(previewDoc) ? <iframe title={getDocName(previewDoc)} src={getDocUrl(previewDoc)} /> : <div className="evrak-preview-empty">Bu dosya türü tarayıcı içinde önizlenemiyor.</div>}
          </div>
          <div className="evrak-preview-actions">
            <button type="button" onClick={() => window.open(getDocUrl(previewDoc), "_blank", "noopener,noreferrer")}>Yeni Sekmede Aç</button>
            <button type="button" onClick={() => downloadDoc(previewDoc)}>İndir</button>
            <button type="button" onClick={() => copyDocLink(previewDoc)}>Linki Kopyala</button>
          </div>
        </div>
      </div>}
    </section>}
    {activeTab === "tasks" && <section className="v11-card single-tab-card">
      <div className="v11-card-head"><h3>✅ Görevler</h3><span>{tasks.filter(t=>!t.done).length} açık</span></div>
      {canEdit && <div className="v11-inline-form"><input value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="Yeni görev / hatırlatma" /><Button onClick={addTask}>Ekle</Button></div>}
      <div className="v11-task-list">{tasks.map(t => <label key={t.id} className={t.done ? "done" : ""}><input type="checkbox" checked={t.done} onChange={()=>toggleTask(t.id)} /> <span>{t.text}</span><small>{t.date}</small></label>)}{!tasks.length && <div className="empty-state">Görev yok.</div>}</div>
    </section>}
    {activeTab === "notes" && <section className="v11-card single-tab-card">
      <div className="v11-card-head"><h3>📝 Notlar</h3><span>İç operasyon</span></div>
      {canEdit && <div className="v11-inline-form"><input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="İç not ekle" /><Button onClick={addNote}>Kaydet</Button></div>}
      <div className="v11-note-list">{notes.map(n => <div key={n.id}><b>{n.date}</b><p>{n.text}</p></div>)}{!notes.length && <div className="empty-state">Not yok.</div>}</div>
    </section>}
    {activeTab === "customer" && <section className="v11-card single-tab-card">
      <div className="v11-card-head"><h3>👤 Müşteri Görünümü</h3><span>Portal özeti</span></div>
      <div className="v11-customer-box"><b>{row.serial}</b><span>{row.nereden} → {row.nereye}</span><strong>{statusLabel(row.tripStatus)}</strong><small>Fatura: {paymentLabel(paymentStatus(row))} • Bakiye {fmt(debt)}</small></div>
    </section>}
  </div>;
}

function TripMobileCard({ row, startEdit, deleteRow, invoice, invoicePdf, whatsapp, copyTrip, canEdit, canDelete, onOpen }) { const debt = Math.max(row.tutar-row.paidAmount,0); return <div className="mobile-card" onClick={onOpen}><div className="mobile-top"><b>{row.musteri}</b><span>{row.serial}</span></div><div className="mobile-route">{row.nereden} → {row.nereye}</div><div className="mobile-grid"><span>Tarih</span><b>{row.tarih}</b><span>Araç</span><b>{row.plaka||'—'}</b><span>Tutar</span><b>{fmt(row.tutar)}</b><span>Kalan</span><b className={debt?'red':'green'}>{fmt(debt)}</b></div><div className="buttons compact" onClick={e=>e.stopPropagation()}>{canEdit && <Button onClick={()=>startEdit(row)}>✏️</Button>}{canDelete && <Button onClick={()=>deleteRow(row.id)}>🗑️</Button>}<Button onClick={()=>invoice(row)}>📄</Button>{invoicePdf && <Button style={{background:"#dc2626",color:"#fff",border:"none"}} onClick={()=>invoicePdf(row)}>PDF</Button>}<Button onClick={()=>whatsapp(row)}>💬</Button>{copyTrip && <Button onClick={()=>copyTrip(row)}>📋</Button>}</div></div>; }
function CustomersPage({ customers, data, printCustomerStatement, whatsapp }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("all");
  const [selectedName, setSelectedName] = useState(customers?.[0]?.[0] || "");
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("seyitogullari_customer_notes_v1")) || {}; } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem("seyitogullari_customer_notes_v1", JSON.stringify(notes));
  }, [notes]);

  const enriched = useMemo(() => customers.map(([name, c]) => {
    const rows = data.filter(r => r.musteri === name).sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih)));
    const avg = c.trips ? Math.round(c.total / c.trips) : 0;
    const cls = c.total >= 50000 ? "VIP" : c.debt > 0 ? "Borçlu" : c.trips > 1 ? "Daimi" : "Yeni";
    const collectionRate = c.total ? Math.round((c.paid / c.total) * 100) : 0;
    const lastRoute = rows[0] ? `${rows[0].nereden || "-"} → ${rows[0].nereye || "-"}` : "—";
    return { name, ...c, rows, avg, cls, collectionRate, lastRoute, note: notes[name] || "" };
  }), [customers, data, notes]);

  const filteredCustomers = enriched.filter(c => {
    const text = normalizeText([c.name, c.phone, c.cls, c.lastRoute, c.note].join(" "));
    const q = normalizeText(query);
    const passQuery = !q || text.includes(q);
    const passSegment = segment === "all" ||
      (segment === "vip" && c.cls === "VIP") ||
      (segment === "debt" && c.debt > 0) ||
      (segment === "regular" && c.cls === "Daimi") ||
      (segment === "new" && c.cls === "Yeni");
    return passQuery && passSegment;
  }).sort((a,b)=>b.total-a.total);

  const selected = enriched.find(c => c.name === selectedName) || filteredCustomers[0] || enriched[0];
  const totalCustomers = enriched.length;
  const vipCount = enriched.filter(c=>c.cls === "VIP").length;
  const debtCustomers = enriched.filter(c=>c.debt > 0).length;
  const totalDebt = enriched.reduce((s,c)=>s+c.debt,0);

  const sendCustomerWhatsapp = (c, type="payment") => {
    if (!c?.phone) return alert("Bu müşterinin telefon numarası yok.");
    const row = {
      serial: "MÜŞTERİ-EKSTRE",
      tarih: new Date().toLocaleDateString("tr-TR"),
      musteri: c.name,
      phone: c.phone,
      nereden: "Hesap",
      nereye: "Ekstre",
      tutar: c.debt || c.total || 0,
      paidAmount: 0,
      tripStatus: c.debt > 0 ? "pending" : "delivered",
      not: `Toplam sefer: ${c.trips}`
    };
    whatsapp?.(row, type);
  };

  return <main className="panel full customer-crm-page">
    <div className="crm-hero">
      <div>
        <span className="crm-kicker">Müşteri CRM Pro</span>
        <h2>👥 Müşteri Yönetim Merkezi</h2>
        <p>Müşteri performansı, borç takibi, hızlı iletişim ve hesap ekstresi tek ekranda.</p>
      </div>
      <div className="crm-hero-actions">
        <Button onClick={()=>selected && printCustomerStatement(selected.name)}>📄 Seçili Müşteri Ekstresi</Button>
        <Button onClick={()=>selected && sendCustomerWhatsapp(selected,"payment")}>💬 WhatsApp Hatırlat</Button>
      </div>
    </div>

    <section className="crm-kpi-grid">
      <div className="crm-kpi"><span>Toplam Müşteri</span><b>{totalCustomers}</b><small>Aktif kayıt</small></div>
      <div className="crm-kpi gold"><span>VIP Müşteri</span><b>{vipCount}</b><small>Yüksek ciro</small></div>
      <div className="crm-kpi red"><span>Borçlu Müşteri</span><b>{debtCustomers}</b><small>{fmt(totalDebt)} açık bakiye</small></div>
      <div className="crm-kpi blue"><span>Ortalama Tahsilat</span><b>%{totalCustomers ? Math.round(enriched.reduce((s,c)=>s+c.collectionRate,0)/totalCustomers) : 0}</b><small>Genel oran</small></div>
    </section>

    <section className="crm-layout">
      <div className="crm-list-panel">
        <div className="crm-toolbar">
          <input className="control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Müşteri, telefon, güzergah veya not ara..." />
          <select className="control" value={segment} onChange={e=>setSegment(e.target.value)}>
            <option value="all">Tüm müşteriler</option>
            <option value="vip">VIP</option>
            <option value="debt">Borçlu</option>
            <option value="regular">Daimi</option>
            <option value="new">Yeni</option>
          </select>
        </div>

        <div className="crm-customer-list">
          {filteredCustomers.map(c => <button key={c.name} type="button" className={`crm-customer-card ${selected?.name===c.name ? "active" : ""}`} onClick={()=>setSelectedName(c.name)}>
            <div className="crm-card-top">
              <b>{c.name}</b>
              <span className={`customer-class ${c.cls.toLowerCase()}`}>{c.cls}</span>
            </div>
            <div className="crm-card-meta"><span>{c.phone || "Telefon yok"}</span><span>{c.trips} sefer</span></div>
            <div className="crm-money-row"><strong>{fmt(c.total)}</strong><small className={c.debt ? "red" : "green"}>Kalan: {fmt(c.debt)}</small></div>
            <div className="crm-progress"><i style={{width:`${Math.min(c.collectionRate,100)}%`}} /></div>
          </button>)}
          {!filteredCustomers.length && <div className="crm-empty">Uygun müşteri bulunamadı.</div>}
        </div>
      </div>

      <div className="crm-detail-panel">
        {selected ? <>
          <div className="crm-profile-head">
            <div className="crm-avatar">{String(selected.name || "M").slice(0,1)}</div>
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.phone || "Telefon numarası eklenmemiş"}</p>
            </div>
            <span className={`customer-class ${selected.cls.toLowerCase()}`}>{selected.cls}</span>
          </div>

          <div className="crm-detail-grid">
            <div><span>Toplam Ciro</span><b>{fmt(selected.total)}</b></div>
            <div><span>Tahsilat</span><b className="green">{fmt(selected.paid)}</b></div>
            <div><span>Açık Bakiye</span><b className={selected.debt ? "red" : "green"}>{fmt(selected.debt)}</b></div>
            <div><span>Ortalama Sefer</span><b>{fmt(selected.avg)}</b></div>
            <div><span>Tahsilat Oranı</span><b>%{selected.collectionRate}</b></div>
            <div><span>Son Sefer</span><b>{selected.last || "—"}</b></div>
          </div>

          <div className="crm-action-row">
            <Button onClick={()=>printCustomerStatement(selected.name)}>📄 Hesap Ekstresi</Button>
            <Button onClick={()=>sendCustomerWhatsapp(selected,"payment")}>💸 Ödeme Hatırlat</Button>
            <Button onClick={()=>sendCustomerWhatsapp(selected,"invoice")}>💬 WhatsApp</Button>
          </div>

          <label className="crm-note-box">
            <span>Müşteri Notu</span>
            <textarea value={notes[selected.name] || ""} onChange={e=>setNotes(prev=>({...prev,[selected.name]:e.target.value}))} placeholder="Özel not, fiyat anlaşması, ödeme alışkanlığı veya operasyon bilgisi..." />
          </label>

          <div className="crm-timeline-head"><h3>Son İşlemler</h3><span>{selected.rows.length} sefer</span></div>
          <div className="crm-timeline">
            {selected.rows.slice(0,8).map(r => <div className="crm-timeline-item" key={r.id}>
              <div className={`crm-dot ${paymentStatus(r)}`} />
              <div>
                <b>{r.tarih} • {r.nereden} → {r.nereye}</b>
                <p>{r.serial} • {r.driver || "Şoför yok"} • {statusLabel(r.tripStatus)}</p>
              </div>
              <div className="crm-timeline-money">
                <strong>{fmt(r.tutar)}</strong>
                <small className={Math.max(r.tutar-r.paidAmount,0) ? "red" : "green"}>Kalan {fmt(Math.max(r.tutar-r.paidAmount,0))}</small>
              </div>
            </div>)}
          </div>
        </> : <div className="crm-empty large">Müşteri seçiniz.</div>}
      </div>
    </section>
  </main>;
}
function CalendarPage({ rows }) { const grouped = rows.reduce((a,r)=>{ const k=r.tarih||"Tarihsiz"; (a[k] ||= []).push(r); return a; },{}); return <main className="panel full"><h2>📅 Sefer Takvimi</h2><div className="calendar-grid">{Object.entries(grouped).sort((a,b)=>dateKey(b[0]).localeCompare(dateKey(a[0]))).map(([day,list])=><div className="calendar-day" key={day}><h3>{day}</h3>{list.map(r=><div className="calendar-trip" key={r.id}><b>{r.musteri}</b><span>{r.nereden} → {r.nereye}</span><small>{statusLabel(r.tripStatus)}</small></div>)}</div>)}</div></main>; }
function DriversPage({ drivers, setDrivers, rows, setData, addLog }) {
  const [show,setShow]=useState(false);
  const [form,setForm]=useState({name:"",phone:"",status:"available"});
  const driverReport = drivers.map(d => {
    const trips = rows.filter(r=>r.driver===d.name);
    const total = trips.reduce((sum,r)=>sum+(Number(r.tutar)||0),0);
    const gider = trips.reduce((sum,r)=>sum+expenses(r),0);
    const profit = trips.reduce((sum,r)=>sum+realProfit(r),0);
    return { ...d, trips: trips.length, total, gider, profit };
  });
  const printDriverProfit = () => {
    const html = `<html><head><title>Şoför Kâr Raporu</title><style>body{font-family:Arial;padding:25px}.head{background:#1f4e79;color:white;padding:22px;border-radius:16px}.brand{font-size:26px;font-weight:900;color:#ffb36b}table{width:100%;border-collapse:collapse;margin-top:20px}td,th{border:1px solid #ddd;padding:10px}th{background:#dbeafe}</style></head><body><div class="head"><div class="brand">${COMPANY}</div><div>Şoför Kâr Raporu</div><div>Tel: ${PHONE}</div></div><table><thead><tr><th>Şoför</th><th>Durum</th><th>Sefer</th><th>Gelir</th><th>Gider</th><th>Gerçek Kâr</th></tr></thead><tbody>${driverReport.map(d=>`<tr><td>${safeHtml(d.name)}</td><td>${driverStatusLabel(d.status)}</td><td>${d.trips}</td><td>${fmt(d.total)}</td><td>${fmt(d.gider)}</td><td>${fmt(d.profit)}</td></tr>`).join("")}</tbody></table><script>window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 700); });</script></body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); addLog("Şoför kâr raporu oluşturuldu");
  };
  const save=()=>{ if(!form.name)return; setDrivers(p=>[{...form,id:Date.now()},...p]); setForm({name:"",phone:"",status:"available"}); setShow(false); addLog("Şoför eklendi"); };
  return <main className="panel full"><div className="topline"><h2>🚚 Şoför Yönetimi</h2><div className="buttons compact"><Button onClick={printDriverProfit}>📄 Şoför Kâr Raporu</Button><Button onClick={()=>setShow(!show)}>+ Şoför Ekle</Button></div></div>{show&&<div className="form driver-form"><Field label="Şoför Adı"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Telefon"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></Field><Field label="Durum"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="available">Müsait</option><option value="busy">Meşgul</option><option value="leave">İzinli</option></select></Field><div className="form-actions"><Button onClick={save}>Kaydet</Button></div></div>}<div className="cards small">{driverReport.map(d=> <div className="stat driver-stat" key={d.id}><span>{driverStatusLabel(d.status)}</span><b>{d.name}</b><p>{d.phone||"Telefon yok"}</p><p>{d.trips} sefer / {fmt(d.profit)} kâr</p><div className="buttons compact"><Button onClick={()=>setDrivers(p=>p.map(x=>x.id===d.id?{...x,status:x.status==='available'?'busy':'available'}:x))}>Durum Değiştir</Button><Button onClick={()=>setDrivers(p=>p.filter(x=>x.id!==d.id))}>Sil</Button></div></div>)}</div><div className="table-wrap driver-profit-table"><table><thead><tr><th>Şoför</th><th>Sefer</th><th>Gelir</th><th>Gider</th><th>Gerçek Kâr</th></tr></thead><tbody>{driverReport.map(d=><tr key={d.id}><td>{d.name}</td><td>{d.trips}</td><td>{fmt(d.total)}</td><td>{fmt(d.gider)}</td><td className="green">{fmt(d.profit)}</td></tr>)}</tbody></table></div></main>;
}


function DriverPayrollPage({ drivers, rows, printReport }) {
  const [period, setPeriod] = useState("all");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [settlement, setSettlement] = useState({ amount: "", note: "" });
  const [payments, setPayments] = useState(() => { try { return JSON.parse(localStorage.getItem("seyitogullari_driver_payments_v1")) || []; } catch { return []; } });
  useEffect(() => { localStorage.setItem("seyitogullari_driver_payments_v1", JSON.stringify(payments)); }, [payments]);
  const periodRows = rows.filter(r => {
    if (selectedDriver && r.driver !== selectedDriver) return false;
    if (period === "all") return true;
    const mk = monthKey(r.tarih);
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    if (period === "month") return mk === current;
    const d = parseTRDate(r.tarih);
    if (period === "week" && d) return (new Date() - d) / 86400000 <= 7;
    return true;
  });
  const summaries = drivers.map(d => {
    const trips = periodRows.filter(r => r.driver === d.name);
    const driverCost = trips.reduce((s,r)=>s+(Number(r.driverCost)||0),0);
    const turnover = trips.reduce((s,r)=>s+(Number(r.tutar)||0),0);
    const profit = trips.reduce((s,r)=>s+realProfit(r),0);
    const paid = payments.filter(p => p.driver === d.name).reduce((s,p)=>s+(Number(p.amount)||0),0);
    const due = Math.max(driverCost - paid, 0);
    const delivered = trips.filter(r=>r.tripStatus==='delivered').length;
    const onRoad = trips.filter(r=>r.tripStatus==='onRoad').length;
    const performance = trips.length ? Math.round((delivered / trips.length) * 100) : 0;
    return { ...d, trips, tripCount: trips.length, delivered, onRoad, turnover, profit, driverCost, paid, due, performance };
  }).sort((a,b)=>b.driverCost-a.driverCost);
  const selected = selectedDriver ? summaries.find(x=>x.name===selectedDriver) : summaries[0];
  const totalDue = summaries.reduce((s,d)=>s+d.due,0);
  const totalCost = summaries.reduce((s,d)=>s+d.driverCost,0);
  const totalPaid = summaries.reduce((s,d)=>s+d.paid,0);
  function addPayment() {
    if (!selected?.name) return alert("Lütfen önce bir şoför seçin.");
    const amount = Number(settlement.amount)||0;
    if (!amount || amount <= 0) return alert("Geçerli bir ödeme tutarı giriniz.");
    setPayments(prev => [{ id:Date.now(), driver:selected.name, amount, note:settlement.note, date:new Date().toLocaleDateString("tr-TR"), time:new Date().toLocaleTimeString("tr-TR") }, ...prev]);
    setSettlement({ amount:"", note:"" });
  }
  function printSettlement(driver) {
    const reportRows = driver?.trips || [];
    if (printReport) printReport(`${driver.name} Şoför Hakediş Raporu`, reportRows);
  }
  return <main className="panel full payroll-page">
    <div className="payroll-hero">
      <div><span>Profesyonel Şoför Finans Yönetimi</span><h2>💳 Şoför Hakediş ve Performans Merkezi</h2><p>Şoför bazlı sefer, hakediş, ödeme, performans ve kalan alacak takibini tek ekranda yönetin.</p></div>
      <div className="payroll-hero-actions"><Button onClick={()=>selected && printSettlement(selected)}>📄 Seçili Şoför Raporu</Button><Button onClick={()=>printReport?.("Tüm Şoför Hakediş Raporu", periodRows)}>📊 Genel Rapor</Button></div>
    </div>
    <section className="cards small payroll-kpis">
      <div className="stat"><span>Toplam Hakediş</span><b>{fmt(totalCost)}</b></div>
      <div className="stat"><span>Ödenen</span><b>{fmt(totalPaid)}</b></div>
      <div className="stat"><span>Kalan</span><b>{fmt(totalDue)}</b></div>
      <div className="stat"><span>Aktif Şoför</span><b>{summaries.filter(d=>d.tripCount>0).length}</b></div>
    </section>
    <div className="filters payroll-filters">
      <select className="control" value={selectedDriver} onChange={e=>setSelectedDriver(e.target.value)}><option value="">Tüm şoförler</option>{drivers.map(d=><option key={d.id}>{d.name}</option>)}</select>
      <select className="control" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Tüm dönem</option><option value="week">Son 7 gün</option><option value="month">Bu ay</option></select>
      <Button onClick={()=>{setSelectedDriver("");setPeriod("all")}}>Filtreleri Temizle</Button>
    </div>
    <section className="payroll-layout">
      <div className="payroll-list">
        {summaries.map(d => <button key={d.id || d.name} className={`payroll-driver-card ${selected?.name===d.name?'active':''}`} onClick={()=>setSelectedDriver(d.name)}>
          <div className="payroll-driver-top"><b>{d.name}</b><span>{driverStatusLabel(d.status)}</span></div>
          <div className="payroll-mini-grid"><span>Sefer <b>{d.tripCount}</b></span><span>Hakediş <b>{fmt(d.driverCost)}</b></span><span>Kalan <b className={d.due?'red':'green'}>{fmt(d.due)}</b></span></div>
          <div className="payroll-progress"><i style={{width:`${Math.min(d.performance,100)}%`}} /></div><small>Teslim performansı %{d.performance}</small>
        </button>)}
      </div>
      <div className="payroll-detail">
        {selected ? <>
          <div className="payroll-profile"><div className="payroll-avatar">{selected.name?.[0] || 'Ş'}</div><div><h3>{selected.name}</h3><p>{selected.phone || 'Telefon yok'} • {driverStatusLabel(selected.status)}</p></div><span className={selected.due?'badge unpaid':'badge paid'}>{selected.due ? 'Ödeme bekliyor' : 'Kapalı'}</span></div>
          <div className="payroll-detail-grid"><div><span>Sefer</span><b>{selected.tripCount}</b></div><div><span>Ciro</span><b>{fmt(selected.turnover)}</b></div><div><span>Kâr</span><b>{fmt(selected.profit)}</b></div><div><span>Hakediş</span><b>{fmt(selected.driverCost)}</b></div><div><span>Ödenen</span><b>{fmt(selected.paid)}</b></div><div><span>Kalan</span><b className={selected.due?'red':'green'}>{fmt(selected.due)}</b></div></div>
          <div className="payroll-payment-box"><h3>💸 Hakediş Ödemesi Ekle</h3><input className="control" type="number" placeholder="Ödeme tutarı" value={settlement.amount} onChange={e=>setSettlement({...settlement,amount:e.target.value})}/><input className="control" placeholder="Açıklama / not" value={settlement.note} onChange={e=>setSettlement({...settlement,note:e.target.value})}/><Button onClick={addPayment}>Ödeme Kaydet</Button></div>
          <div className="payroll-columns"><div><h3>Son Seferler</h3>{selected.trips.slice(0,6).map(r=><div className="payroll-trip-row" key={r.id}><b>{r.serial}</b><span>{r.nereden} → {r.nereye}</span><strong>{fmt(r.driverCost)}</strong></div>)}{!selected.trips.length && <div className="empty-state">Sefer bulunamadı.</div>}</div><div><h3>Ödeme Geçmişi</h3>{payments.filter(p=>p.driver===selected.name).slice(0,6).map(p=><div className="payroll-trip-row payment" key={p.id}><b>{p.date}</b><span>{p.note || 'Hakediş ödemesi'}</span><strong>{fmt(p.amount)}</strong></div>)}{!payments.filter(p=>p.driver===selected.name).length && <div className="empty-state">Ödeme kaydı yok.</div>}</div></div>
        </> : <div className="empty-state large">Şoför seçiniz.</div>}
      </div>
    </section>
  </main>;
}

function DocumentsPage({ documents, setDocuments, rows, customers, vehicles, addLog }) {
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [form, setForm] = useState({ title:"", category:"Sefer", ownerType:"sefer", ownerName:"", note:"", expireDate:"" });
  const categories = ["Sefer", "Müşteri", "Araç", "Sigorta", "Muayene", "Sözleşme", "Fatura", "Teslim", "Diğer"];
  const owners = form.ownerType === "sefer" ? rows.map(r=>r.serial).filter(Boolean) : form.ownerType === "musteri" ? customers.map(([n])=>n) : vehicles.map(v=>v.plate).filter(Boolean);
  const filteredDocs = documents.filter(d => {
    const text = normalizeText([d.title,d.category,d.ownerName,d.fileName,d.note,d.createdAt].join(" "));
    return (!query || text.includes(normalizeText(query))) && (!category || d.category === category);
  }).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
  const expiringDocs = documents.filter(d => d.expireDate && daysLeftISO(d.expireDate) <= 30);
  function readFile(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  async function onFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    const created = [];
    for (const file of list) {
      const dataUrl = await readFile(file);
      created.push({
        id: Date.now() + Math.random(),
        title: form.title || file.name.replace(/\.[^/.]+$/, ""),
        category: form.category,
        ownerType: form.ownerType,
        ownerName: form.ownerName || "Genel",
        fileName: file.name,
        fileType: file.type?.includes("pdf") ? "pdf" : file.type?.includes("image") ? "image" : "file",
        fileData: dataUrl,
        note: form.note,
        expireDate: form.expireDate,
        createdAt: new Date().toLocaleString("tr-TR")
      });
    }
    setDocuments(prev => [...created, ...prev]);
    setForm({ title:"", category:"Sefer", ownerType:"sefer", ownerName:"", note:"", expireDate:"" });
    setShow(false);
    addLog?.(`${created.length} evrak yüklendi`);
  }
  function removeDoc(id) {
    setDocuments(prev => prev.filter(d => d.id !== id));
    addLog?.("Evrak silindi");
  }
  function downloadDoc(doc) {
    if (!doc.fileData) return alert("Dosya verisi bulunamadı.");
    const a = document.createElement("a");
    a.href = doc.fileData;
    a.download = doc.fileName || doc.title || "evrak";
    a.click();
  }
  return <main className="panel full documents-page">
    <div className="topline"><div><h2>📁 Evrak ve Dosya Yönetimi</h2><p className="muted">Sefer, müşteri ve araç evraklarını tek merkezden yönetin.</p></div><Button onClick={()=>setShow(!show)}>+ Evrak Yükle</Button></div>
    <section className="cards small">
      <div className="stat"><span>Toplam Evrak</span><b>{documents.length}</b></div>
      <div className="stat"><span>Yaklaşan Süre</span><b>{expiringDocs.length}</b></div>
      <div className="stat"><span>Görsel</span><b>{documents.filter(d=>d.fileType==='image').length}</b></div>
      <div className="stat"><span>PDF</span><b>{documents.filter(d=>d.fileType==='pdf').length}</b></div>
    </section>
    {show && <div className="document-uploader" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); onFiles(e.dataTransfer.files);}}>
      <div className="doc-form-grid">
        <Field label="Başlık"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Örn: Teslim tutanağı" /></Field>
        <Field label="Kategori"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="Bağlantı Türü"><select value={form.ownerType} onChange={e=>setForm({...form,ownerType:e.target.value,ownerName:""})}><option value="sefer">Sefer</option><option value="musteri">Müşteri</option><option value="arac">Araç</option></select></Field>
        <Field label="Bağlantılı Kayıt"><select value={form.ownerName} onChange={e=>setForm({...form,ownerName:e.target.value})}><option value="">Genel</option>{owners.map(o=><option key={o}>{o}</option>)}</select></Field>
        <Field label="Bitiş Tarihi"><input type="date" value={form.expireDate} onChange={e=>setForm({...form,expireDate:e.target.value})}/></Field>
        <Field label="Not"><input value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></Field>
      </div>
      <label className="drop-zone"><input type="file" multiple accept="image/*,application/pdf" onChange={e=>onFiles(e.target.files)} /><b>Dosyaları buraya sürükleyin</b><span>veya tıklayıp görsel/PDF seçin</span></label>
    </div>}
    <div className="filters document-filters"><input className="control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Evrak ara: müşteri, plaka, sefer no, dosya adı..."/><select className="control" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Tüm kategoriler</option>{categories.map(c=><option key={c}>{c}</option>)}</select><Button onClick={()=>{setQuery("");setCategory("")}}>Filtreleri Temizle</Button></div>
    {!!expiringDocs.length && <div className="doc-alert-strip">{expiringDocs.slice(0,4).map(d=><div className="doc-alert" key={d.id}><b>⚠️ {d.title}</b><span>{d.expireDate} tarihinde bitiyor • {d.ownerName}</span></div>)}</div>}
    <div className="document-grid">{filteredDocs.map(doc => <div className="document-card" key={doc.id}>
      <div className="doc-preview">{doc.fileType === 'image' && doc.fileData ? <img src={doc.fileData} alt={doc.title}/> : doc.fileType === 'pdf' ? <div className="pdf-preview">PDF</div> : <div className="pdf-preview">FILE</div>}</div>
      <div className="doc-body"><div className="doc-title"><b>{doc.title}</b><span>{doc.category}</span></div><p>{doc.ownerName || "Genel"}</p><small>{doc.fileName} • {doc.createdAt}</small>{doc.expireDate && <small className={daysLeftISO(doc.expireDate) <= 30 ? 'red' : ''}>Bitiş: {doc.expireDate} ({daysLabel(daysLeftISO(doc.expireDate))})</small>}<em>{doc.note || "Not yok"}</em></div>
      <div className="doc-actions"><Button onClick={()=>downloadDoc(doc)}>İndir</Button>{doc.fileData && <Button onClick={()=>window.open(doc.fileData, '_blank')}>Önizle</Button>}<Button onClick={()=>removeDoc(doc.id)}>Sil</Button></div>
    </div>)}{!filteredDocs.length && <div className="empty-state">Evrak bulunamadı.</div>}</div>
  </main>;
}

function daysLeftISO(dateString) { if (!dateString) return null; const d = new Date(dateString + "T00:00:00"); return Math.ceil((d - new Date()) / 86400000); }
function daysLabel(days) { return days === null ? "—" : days < 0 ? `${Math.abs(days)} gün geçti` : `${days} gün kaldı`; }

function VehiclesPage({ vehicles, setVehicles, rows, addLog }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ plate:"", brand:"", model:"", inspectionDate:"", insuranceDate:"", status:"active", notes:"" });
  const vehicleRows = vehicles.map(v => {
    const trips = rows.filter(r => normalizeText(r.plaka) === normalizeText(v.plate));
    return { ...v, trips: trips.length, income: trips.reduce((s,r)=>s+(Number(r.tutar)||0),0), profit: trips.reduce((s,r)=>s+realProfit(r),0), inspectionLeft: daysUntil(v.inspectionDate), insuranceLeft: daysUntil(v.insuranceDate) };
  });
  const save = () => { if (!form.plate) return alert("Plaka gerekli."); setVehicles(p => [{ ...form, id: Date.now() }, ...p]); setForm({ plate:"", brand:"", model:"", inspectionDate:"", insuranceDate:"", status:"active", notes:"" }); setShow(false); addLog("Araç eklendi"); };
  const update = (id, patch) => setVehicles(p => p.map(v => v.id === id ? { ...v, ...patch } : v));
  const remove = (id) => { setVehicles(p => p.filter(v => v.id !== id)); addLog("Araç silindi"); };
  const warn = (days) => days === null ? "—" : days < 0 ? `${Math.abs(days)} gün geçti` : `${days} gün kaldı`;
  return <main className="panel full"><div className="topline"><h2>🚗 Araç Yönetimi</h2><Button onClick={()=>setShow(!show)}>+ Araç Ekle</Button></div>{show && <div className="form vehicle-form"><Field label="Plaka"><input value={form.plate} onChange={e=>setForm({...form,plate:e.target.value.toUpperCase()})}/></Field><Field label="Marka"><input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></Field><Field label="Model"><input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></Field><Field label="Muayene Tarihi"><input type="date" value={form.inspectionDate} onChange={e=>setForm({...form,inspectionDate:e.target.value})}/></Field><Field label="Sigorta Tarihi"><input type="date" value={form.insuranceDate} onChange={e=>setForm({...form,insuranceDate:e.target.value})}/></Field><Field label="Durum"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Aktif</option><option value="service">Serviste</option><option value="passive">Pasif</option></select></Field><Field label="Not"><input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field><div className="form-actions"><Button onClick={save}>Kaydet</Button></div></div>}<section className="cards small">{vehicleRows.filter(v => (v.inspectionLeft !== null && v.inspectionLeft <= 30) || (v.insuranceLeft !== null && v.insuranceLeft <= 30)).map(v => <div className="stat warning-stat" key={v.id}><span>Evrak Uyarısı</span><b>{v.plate}</b><p>Muayene: {warn(v.inspectionLeft)}</p><p>Sigorta: {warn(v.insuranceLeft)}</p></div>)}</section><div className="table-wrap"><table><thead><tr><th>Plaka</th><th>Marka/Model</th><th>Durum</th><th>Muayene</th><th>Sigorta</th><th>Sefer</th><th>Gelir</th><th>Kâr</th><th>Not</th><th>İşlem</th></tr></thead><tbody>{vehicleRows.map(v => <tr key={v.id}><td><b>{v.plate}</b></td><td>{v.brand} {v.model}</td><td><select className="mini-select" value={v.status} onChange={e=>update(v.id,{status:e.target.value})}><option value="active">Aktif</option><option value="service">Serviste</option><option value="passive">Pasif</option></select></td><td className={(v.inspectionLeft !== null && v.inspectionLeft <= 30) ? "red" : ""}>{v.inspectionDate || "—"}<br/><small>{warn(v.inspectionLeft)}</small></td><td className={(v.insuranceLeft !== null && v.insuranceLeft <= 30) ? "red" : ""}>{v.insuranceDate || "—"}<br/><small>{warn(v.insuranceLeft)}</small></td><td>{v.trips}</td><td>{fmt(v.income)}</td><td className="green">{fmt(v.profit)}</td><td>{v.notes || "—"}</td><td><Button onClick={()=>remove(v.id)}>Sil</Button></td></tr>)}</tbody></table></div></main>;
}


function notificationToneLabel(tone) {
  return tone === "red" ? "Kritik" : tone === "orange" ? "Yaklaşan" : "Bilgi";
}


function CommandPalette({ open, query, setQuery, items, onClose, onRun }) {
  const inputRef = useRef(null);
  useEffect(() => { if (open) setTimeout(()=>inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const q = normalizeText(query);
  const results = items.filter(item => !q || normalizeText(`${item.title} ${item.desc}`).includes(q)).slice(0, 18);
  return <div className="cmd-overlay" onMouseDown={onClose}>
    <div className="cmd-panel" onMouseDown={e=>e.stopPropagation()}>
      <div className="cmd-head">
        <div><b>Komut Merkezi</b><span>Sefer, müşteri, rapor ve sayfalara hızlı erişim</span></div>
        <button onClick={onClose}>×</button>
      </div>
      <div className="cmd-search"><span>⌘</span><input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Komut, müşteri, sefer veya sayfa ara..." /></div>
      <div className="cmd-results">
        {results.length ? results.map(item => <button className="cmd-item" key={item.id} onClick={()=>onRun(item)}>
          <span className="cmd-icon">{item.icon}</span>
          <span className="cmd-copy"><b>{item.title}</b><small>{item.desc}</small></span>
          <span className="cmd-enter">Enter</span>
        </button>) : <div className="cmd-empty">Sonuç bulunamadı.</div>}
      </div>
      <div className="cmd-foot"><span>Hızlı arama açık</span><span>Esc ile kapanır</span></div>
    </div>
  </div>;
}

function NotificationBell({ items, open, setOpen, onSelect, onShowAll }) {
  const preview = items.slice(0, 7);
  const critical = items.filter(i => i.tone === "red").length;
  return <div className="notification-bell-wrap">
    <button type="button" className={`notification-bell ${items.length ? "has-items" : ""}`} onClick={() => setOpen(v => !v)} aria-label="Bildirimler">
      <span>🔔</span>
      {items.length > 0 && <em>{items.length > 99 ? "99+" : items.length}</em>}
    </button>
    {open && <div className="notification-dropdown enterprise-panel">
      <div className="notification-dropdown-head">
        <div>
          <b>Bildirim Merkezi</b>
          <span>{critical} kritik uyarı · {items.length} toplam bildirim</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Kapat">×</button>
      </div>
      <div className="notification-tabs">
        <span className="active">Tümü <b>{items.length}</b></span>
        <span>Kritik <b>{critical}</b></span>
        <span>Bilgi <b>{items.filter(i=>i.tone==='blue').length}</b></span>
      </div>
      <div className="notification-dropdown-list">
        {preview.length ? preview.map(item => <NotificationCard key={item.id || item.title + item.text} item={item} onClick={() => onSelect(item)} compact />) : <div className="notification-empty">Şu anda önemli uyarı yok.</div>}
      </div>
      <button type="button" className="notification-show-all" onClick={onShowAll}>Tüm Bildirimleri Gör <span>→</span></button>
    </div>}
  </div>;
}

function NotificationCard({ item, onClick, compact = false }) {
  return <button type="button" className={`enterprise-notification-card ${item.tone || "blue"} ${compact ? "compact" : ""}`} onClick={onClick}>
    <span className="enterprise-notification-icon">{item.icon || "🔔"}</span>
    <span className="enterprise-notification-body">
      <span className="enterprise-notification-topline"><b>{item.title}</b><i>{notificationToneLabel(item.tone)}</i></span>
      <small>{item.text}</small>
      {item.meta && <em>{item.meta}</em>}
    </span>
    <span className="enterprise-notification-arrow">›</span>
  </button>;
}

function NotificationsPage({ items, onSelect }) {
  const critical = items.filter(i=>i.tone==='red').length;
  const warning = items.filter(i=>i.tone==='orange').length;
  const info = items.filter(i=>i.tone==='blue').length;
  return <main className="panel full notifications-page-pro">
    <div className="notifications-hero-pro">
      <div><span className="section-kicker">Operasyon Kontrol</span><h2>🔔 Bildirim Merkezi</h2><p>Ödeme, sefer, araç, evrak ve operasyon uyarılarını tek ekranda profesyonel şekilde yönetin.</p></div>
      <button type="button" className="notification-primary-action">{items.length} Aktif Bildirim</button>
    </div>
    <div className="notifications-summary-row"><div><b>{critical}</b><span>Kritik Uyarı</span></div><div><b>{warning}</b><span>Yaklaşan İşlem</span></div><div><b>{info}</b><span>Bilgilendirme</span></div></div>
    <div className="enterprise-notification-list">{items.length ? items.map(item => <NotificationCard key={item.id || item.title + item.text} item={item} onClick={() => onSelect?.(item)} />) : <div className="notification-empty large">Şu anda önemli uyarı yok.</div>}</div>
  </main>;
}


function OperationsPage({ rows, drivers, vehicles = [], setTab, setDriverFilter, updateTripStatus }) {
  const todayKey = dateKey(new Date().toLocaleDateString("tr-TR"));
  const todayRows = rows.filter(r => dateKey(r.tarih) === todayKey);
  const activeRows = rows.filter(r => r.tripStatus !== "delivered");
  const onRoadRows = rows.filter(r => r.tripStatus === "onRoad");
  const waitingRows = rows.filter(r => r.tripStatus === "pending" || r.tripStatus === "received");
  const delayed = activeRows.filter(r => Number(r.tutar || 0) > 0 && daysBetween(r.tarih) >= 2);
  const debtRows = rows.filter(r => paymentStatus(r) !== "paid" && Number(r.tutar || 0) > 0).slice(0, 8);
  const availableDrivers = drivers.filter(d => d.status === "available");
  const busyDrivers = drivers.filter(d => d.status === "busy");
  const criticalVehicles = vehicles.filter(v => {
    const inspection = daysUntil(v.inspectionDate);
    const insurance = daysUntil(v.insuranceDate);
    return (inspection !== null && inspection <= 30) || (insurance !== null && insurance <= 30) || v.status === "service";
  });
  const timeline = [...rows]
    .sort((a,b) => dateKey(b.tarih).localeCompare(dateKey(a.tarih)))
    .slice(0, 9)
    .map(r => ({
      id: r.id,
      time: r.tarih || "Tarihsiz",
      title: `${r.serial || "Sefer"} • ${statusLabel(r.tripStatus)}`,
      text: `${r.musteri || "Müşteri"} / ${r.nereden || "-"} → ${r.nereye || "-"}`,
      tone: r.tripStatus === "delivered" ? "green" : r.tripStatus === "onRoad" ? "blue" : "orange"
    }));
  const driverLoad = drivers.map(d => {
    const assigned = activeRows.filter(r => r.driver === d.name);
    return { ...d, active: assigned.length, onRoad: assigned.filter(r => r.tripStatus === "onRoad").length };
  });
  const openDriver = (name) => {
    setDriverFilter?.(name || "");
    setTab?.("trips");
  };
  return <main className="panel full operations-page">
    <div className="ops-hero">
      <div>
        <span className="ops-eyebrow">Canlı Operasyon Merkezi</span>
        <h2>🧭 Günlük Sevkiyat ve Saha Kontrol Paneli</h2>
        <p>Aktif seferleri, şoför durumlarını, geciken teslimatları ve kritik uyarıları tek ekrandan yönetin.</p>
      </div>
      <div className="ops-actions">
        <Button onClick={()=>setTab?.("trips")}>📋 Seferleri Aç</Button>
        <Button onClick={()=>setTab?.("map")}>🗺️ Harita</Button>
        <Button onClick={()=>setTab?.("notifications")}>🔔 Uyarılar</Button>
      </div>
    </div>

    <section className="ops-kpis">
      <div className="ops-kpi blue"><span>Bugünkü Sefer</span><b>{todayRows.length}</b><small>Gün içi operasyon</small></div>
      <div className="ops-kpi orange"><span>Aktif Sefer</span><b>{activeRows.length}</b><small>Bekleyen + yolda</small></div>
      <div className="ops-kpi green"><span>Müsait Şoför</span><b>{availableDrivers.length}</b><small>{busyDrivers.length} meşgul</small></div>
      <div className="ops-kpi red"><span>Kritik Uyarı</span><b>{delayed.length + debtRows.length + criticalVehicles.length}</b><small>Ödeme / gecikme / evrak</small></div>
    </section>

    <section className="dispatch-command-center">
      <div className="dispatch-map-board">
        <div className="dispatch-board-head">
          <div>
            <span className="ops-eyebrow">Dispatch Command</span>
            <h3>🛰️ Canlı Operasyon Haritası</h3>
          </div>
          <button type="button" onClick={()=>setTab?.("map")}>Haritayı Tam Ekran Aç</button>
        </div>
        <div className="dispatch-map-canvas">
          <div className="dispatch-route-line"></div>
          {activeRows.slice(0,7).map((r,i)=><button
            type="button"
            key={r.id}
            className={`dispatch-vehicle-dot ${r.tripStatus || "pending"}`}
            style={{left:`${12 + (i*13)%76}%`, top:`${22 + (i*17)%58}%`}}
            onClick={()=>{ setDriverFilter?.(r.driver || ""); setTab?.("trips"); }}
            title={`${r.serial} • ${r.musteri}`}
          >🚚<span>{r.driver || "Atanmadı"}</span></button>)}
          <div className="dispatch-city start">Çıkış</div>
          <div className="dispatch-city end">Teslim</div>
        </div>
      </div>
      <div className="dispatch-live-feed">
        <div className="dispatch-board-head compact"><h3>⚡ Canlı Akış</h3><span>{timeline.length} olay</span></div>
        {timeline.slice(0,6).map((t,i)=><button type="button" className={`dispatch-feed-item ${t.tone}`} key={t.id || i} onClick={()=>setTab?.("trips")}>
          <em>{String(i+1).padStart(2,"0")}</em>
          <div><b>{t.title}</b><span>{t.text}</span></div>
          <small>{t.time}</small>
        </button>)}
      </div>
      <div className="dispatch-control-card">
        <div className="dispatch-board-head compact"><h3>🎯 Hızlı Dispatch</h3><span>Tek tık işlem</span></div>
        <button onClick={()=>setTab?.("trips")}>Yeni Sefer Planla</button>
        <button onClick={()=>setTab?.("drivers")}>Şoför Atama</button>
        <button onClick={()=>setTab?.("vehicles")}>Araç Kontrolü</button>
        <button onClick={()=>setTab?.("notifications")}>Kritik Uyarılar</button>
      </div>
    </section>

    <section className="ops-layout">
      <div className="ops-panel wide">
        <div className="ops-panel-head"><h3>🚦 Canlı Sefer Akışı</h3><span>{activeRows.length} aktif kayıt</span></div>
        <div className="ops-lanes">
          <div className="ops-lane"><h4>Bekliyor</h4>{waitingRows.slice(0,6).map(r=><OperationTripCard key={r.id} row={r} tone="orange" updateTripStatus={updateTripStatus} />)}{!waitingRows.length && <div className="ops-empty">Bekleyen sefer yok.</div>}</div>
          <div className="ops-lane"><h4>Yolda</h4>{onRoadRows.slice(0,6).map(r=><OperationTripCard key={r.id} row={r} tone="blue" updateTripStatus={updateTripStatus} />)}{!onRoadRows.length && <div className="ops-empty">Yolda sefer yok.</div>}</div>
          <div className="ops-lane"><h4>Geciken / Riskli</h4>{delayed.slice(0,6).map(r=><OperationTripCard key={r.id} row={r} tone="red" updateTripStatus={updateTripStatus} />)}{!delayed.length && <div className="ops-empty">Kritik gecikme yok.</div>}</div>
        </div>
      </div>

      <aside className="ops-panel">
        <div className="ops-panel-head"><h3>👨‍✈️ Şoför Durumu</h3><span>{drivers.length} kişi</span></div>
        <div className="ops-driver-list">{driverLoad.map(d=><button className={`ops-driver ${d.status}`} key={d.id} onClick={()=>openDriver(d.name)}><b>{d.name}</b><span>{driverStatusLabel(d.status)} • {d.active} aktif</span><small>{d.phone || "Telefon yok"}</small></button>)}</div>
      </aside>
    </section>

    <section className="ops-layout three">
      <div className="ops-panel">
        <div className="ops-panel-head"><h3>⚠️ Acil İşler</h3><span>{delayed.length + debtRows.length}</span></div>
        <div className="ops-alert-list">
          {delayed.slice(0,4).map(r=><div className="ops-alert red" key={`d-${r.id}`}><b>Geciken sefer</b><span>{r.serial} • {r.musteri}</span><small>{r.nereden} → {r.nereye}</small></div>)}
          {debtRows.slice(0,4).map(r=><div className="ops-alert orange" key={`p-${r.id}`}><b>Ödeme eksiği</b><span>{r.musteri} • {fmt(Math.max(r.tutar-r.paidAmount,0))}</span><small>{r.serial}</small></div>)}
          {!delayed.length && !debtRows.length && <div className="ops-empty">Acil işlem bulunmuyor.</div>}
        </div>
      </div>
      <div className="ops-panel">
        <div className="ops-panel-head"><h3>🚗 Araç Evrak Kontrolü</h3><span>{criticalVehicles.length}</span></div>
        <div className="ops-alert-list">{criticalVehicles.slice(0,8).map(v=><div className="ops-alert blue" key={v.id}><b>{v.plate}</b><span>{v.brand} {v.model}</span><small>Muayene: {v.inspectionDate || "—"} • Sigorta: {v.insuranceDate || "—"}</small></div>)}{!criticalVehicles.length && <div className="ops-empty">Kritik araç uyarısı yok.</div>}</div>
      </div>
      <div className="ops-panel">
        <div className="ops-panel-head"><h3>🕒 Operasyon Zaman Çizelgesi</h3><span>Son kayıtlar</span></div>
        <div className="ops-timeline">{timeline.map(t=><div className={`ops-time ${t.tone}`} key={t.id}><i></i><div><b>{t.title}</b><span>{t.text}</span><small>{t.time}</small></div></div>)}</div>
      </div>
    </section>
  </main>;
}

function OperationTripCard({ row, tone, updateTripStatus }) {
  const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
  return <div className={`ops-trip ${tone}`}>
    <div className="ops-trip-top"><b>{row.serial}</b><span>{statusLabel(row.tripStatus)}</span></div>
    <h4>{row.musteri || "Müşteri"}</h4>
    <p>{row.nereden || "-"} → {row.nereye || "-"}</p>
    <div className="ops-trip-meta"><span>Şoför: {row.driver || "Atanmadı"}</span><span>Araç: {row.plaka || "—"}</span></div>
    <div className="ops-trip-bottom"><strong>{fmt(row.tutar)}</strong><small className={debt ? "red" : "green"}>Kalan: {fmt(debt)}</small></div>
    <select value={row.tripStatus} onChange={e=>updateTripStatus?.(row.id, e.target.value)}>
      <option value="pending">Bekliyor</option>
      <option value="received">Araç Alındı</option>
      <option value="onRoad">Yolda</option>
      <option value="delivered">Teslim Edildi</option>
    </select>
  </div>;
}

function MapPage({ rows }) {
  const active = rows.filter(r => r.nereden && r.nereye && r.tripStatus !== "delivered").slice(0, 18);
  const allRoutes = rows.filter(r => r.nereden && r.nereye).slice(0, 30);
  const selected = active[0] || allRoutes[0];
  const routeSrc = selected ? `https://www.google.com/maps?q=${encodeURIComponent(selected.nereden + " to " + selected.nereye)}&output=embed` : "";
  const cityPoints = {
    "İSTANBUL": [41.0082, 28.9784], "ANKARA": [39.9334, 32.8597], "REYHANLI": [36.2679, 36.5679], "HATAY": [36.2023, 36.1613],
    "İSKANDARUN": [36.5847, 36.1750], "ANTAKYA": [36.2023, 36.1613], "KIRIKHAN": [36.4994, 36.3576], "KOCAELİ": [40.8533, 29.8815], "KOCELİ": [40.8533, 29.8815]
  };
  const findPoint = (text, fallback) => {
    const t = normalizeText(text || "").toUpperCase();
    const key = Object.keys(cityPoints).find(k => t.includes(normalizeText(k).toUpperCase()));
    return key ? cityPoints[key] : fallback;
  };
  const gpsRows = allRoutes.map((r, i) => {
    const start = findPoint(r.nereden, [39.0 + (i%4), 32.0 + (i%5)]);
    const end = findPoint(r.nereye, [36.5 + (i%3), 36.0 + (i%4)]);
    const progress = r.tripStatus === "delivered" ? 100 : r.tripStatus === "onRoad" ? 62 + (i * 7) % 28 : r.tripStatus === "received" ? 28 + (i * 9) % 24 : 8 + (i * 5) % 16;
    const lat = start[0] + (end[0]-start[0]) * (progress/100);
    const lng = start[1] + (end[1]-start[1]) * (progress/100);
    const speed = r.tripStatus === "onRoad" ? 72 + (i*11)%28 : r.tripStatus === "delivered" ? 0 : 12 + (i*7)%18;
    const online = r.tripStatus === "onRoad" || r.tripStatus === "received" || i % 3 !== 0;
    const eta = r.tripStatus === "delivered" ? "Tamamlandı" : `${Math.max(1, Math.round((100-progress)/18))} saat`;
    return { ...r, lat, lng, progress, speed, online, eta };
  });
  const live = gpsRows.filter(r => r.tripStatus === "onRoad").length;
  const delayed = gpsRows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2).length;
  const onlineCount = gpsRows.filter(r => r.online).length;
  const avgSpeed = Math.round(gpsRows.reduce((s,r)=>s+r.speed,0) / Math.max(gpsRows.length,1));
  return <main className="panel full gps-page">
    <div className="topline gps-topline">
      <div><h2>🛰️ Canlı GPS Takip Merkezi</h2><p>Şoför, araç, rota ve teslimat durumlarını tek ekrandan izleyin.</p></div>
      <div className="gps-live-badge"><span></span> Canlı İzleme Aktif</div>
    </div>
    <section className="gps-kpis">
      <div className="gps-kpi"><small>Aktif Rota</small><b>{gpsRows.length}</b><span>Bugünkü operasyon</span></div>
      <div className="gps-kpi green"><small>Canlı Araç</small><b>{live}</b><span>Yolda takip ediliyor</span></div>
      <div className="gps-kpi blue"><small>Online Şoför</small><b>{onlineCount}</b><span>Son konum alındı</span></div>
      <div className="gps-kpi orange"><small>Ortalama Hız</small><b>{avgSpeed} km/s</b><span>Operasyon ortalaması</span></div>
      <div className="gps-kpi red"><small>Kritik Uyarı</small><b>{delayed}</b><span>Gecikme riski</span></div>
    </section>
    <section className="gps-grid">
      <div className="gps-map-card">
        <div className="gps-card-head"><div><h3>Canlı Harita</h3><span>Seçili rotanın harita görünümü</span></div>{selected && <Button onClick={()=>window.open(`https://www.google.com/maps/dir/${encodeURIComponent(selected.nereden)}/${encodeURIComponent(selected.nereye)}`,'_blank')}>Google Maps Aç</Button>}</div>
        <div className="gps-map-shell">
          {routeSrc ? <iframe title="Canlı GPS Rota" src={routeSrc} loading="lazy" /> : <div className="inner">Aktif rota bulunamadı.</div>}
          <div className="gps-map-overlay">
            {selected ? <><b>{selected.serial}</b><span>{selected.nereden} → {selected.nereye}</span></> : <span>Rota bekleniyor</span>}
          </div>
        </div>
      </div>
      <div className="gps-side-card">
        <div className="gps-card-head"><div><h3>Araç Durumları</h3><span>Son konum ve ETA</span></div></div>
        <div className="gps-vehicle-list">{gpsRows.slice(0,10).map((r,i)=><div className={`gps-vehicle ${r.online ? "online" : "offline"}`} key={r.id}>
          <div className="gps-vehicle-icon">{r.tripStatus === "delivered" ? "✅" : r.tripStatus === "onRoad" ? "🚚" : "🚗"}</div>
          <div className="gps-vehicle-copy"><div><b>{r.plaka || r.serial}</b><span>{r.online ? "Online" : "Offline"}</span></div><p>{r.musteri || "Müşteri"} • {r.driver || "Şoför atanmadı"}</p><small>{r.nereden} → {r.nereye}</small><div className="gps-progress"><i style={{width:`${Math.min(r.progress,100)}%`}} /></div></div>
          <div className="gps-vehicle-meta"><b>{r.eta}</b><span>{r.speed} km/s</span></div>
        </div>)}</div>
      </div>
    </section>
    <section className="gps-bottom-grid">
      <div className="gps-panel"><h3>🚨 Akıllı GPS Uyarıları</h3>{gpsRows.filter(r=>r.tripStatus!=="delivered").slice(0,6).map((r,i)=><div className="gps-alert" key={r.id}><b>{i%2 ? "Rota kontrolü" : "Teslimat takibi"}</b><span>{r.serial} • {r.musteri} • ETA: {r.eta}</span></div>)}</div>
      <div className="gps-panel"><h3>📍 Son Konum Kayıtları</h3>{gpsRows.slice(0,6).map(r=><div className="gps-location-row" key={r.id}><b>{r.plaka || r.serial}</b><span>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</span><small>{r.online ? "Az önce güncellendi" : "Sinyal bekleniyor"}</small></div>)}</div>
      <div className="gps-panel"><h3>🧭 Route Replay</h3><p className="gps-muted">Bu bölüm gerçek GPS entegrasyonunda geçmiş rota oynatma için hazırlandı.</p><div className="gps-replay-line"><span></span><span></span><span></span><span></span></div></div>
    </section>
  </main>;
}

function AccountingPage({ rows, receipts, printReport }) {
  const [period, setPeriod] = useState("all");
  const [driver, setDriver] = useState("");
  const [cashType, setCashType] = useState("all");

  const now = new Date();
  const periodRows = rows.filter(r => {
    const d = parseTRDate(r.tarih);
    if (!d) return period === "all";
    const diff = Math.floor((now - d) / 86400000);
    if (period === "today") return d.toDateString() === now.toDateString();
    if (period === "week") return diff <= 7;
    if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return true;
  }).filter(r => driver ? r.driver === driver : true).filter(r => {
    if (cashType === "paid") return paymentStatus(r) === "paid";
    if (cashType === "partial") return paymentStatus(r) === "partial";
    if (cashType === "debt") return paymentStatus(r) !== "paid";
    return true;
  });

  const summary = periodRows.reduce((a,r)=>{
    const total = Number(r.tutar)||0;
    const paid = Number(r.paidAmount)||0;
    const debt = Math.max(total-paid,0);
    const exp = expenses(r);
    const portif = Number(r.portifUcr)||0;
    a.turnover += total;
    a.cash += paid;
    a.debt += debt;
    a.expenses += exp;
    a.portif += portif;
    a.net += total - exp - portif;
    a.trips += 1;
    if (paymentStatus(r) !== "paid") a.openCount += 1;
    return a;
  }, { turnover:0, cash:0, debt:0, expenses:0, portif:0, net:0, trips:0, openCount:0 });

  const collectionRate = summary.turnover ? Math.round((summary.cash / summary.turnover) * 100) : 0;
  const profitRate = summary.turnover ? Math.round((summary.net / summary.turnover) * 100) : 0;
  const avgTrip = summary.trips ? Math.round(summary.turnover / summary.trips) : 0;
  const driverNames = [...new Set(rows.map(r=>r.driver).filter(Boolean))].sort();
  const cashFlow = [...periodRows].sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih))).slice(0,8);
  const driverFinance = Object.entries(periodRows.reduce((a,r)=>{
    const k = r.driver || "Şoför yok";
    if (!a[k]) a[k] = { trips:0, turnover:0, cash:0, debt:0, expenses:0, profit:0 };
    a[k].trips += 1;
    a[k].turnover += Number(r.tutar)||0;
    a[k].cash += Number(r.paidAmount)||0;
    a[k].debt += Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0);
    a[k].expenses += expenses(r);
    a[k].profit += realProfit(r);
    return a;
  },{})).sort((a,b)=>b[1].profit-a[1].profit);
  const topDebtors = [...periodRows].filter(r=>paymentStatus(r)!=="paid").sort((a,b)=>((b.tutar||0)-(b.paidAmount||0))-((a.tutar||0)-(a.paidAmount||0))).slice(0,6);
  const dailyFinance = Object.entries(periodRows.reduce((a,r)=>{
    const k = r.tarih || "Tarihsiz";
    if (!a[k]) a[k] = { turnover:0, cash:0, profit:0, trips:0 };
    a[k].turnover += Number(r.tutar)||0;
    a[k].cash += Number(r.paidAmount)||0;
    a[k].profit += realProfit(r);
    a[k].trips += 1;
    return a;
  },{})).sort((a,b)=>dateKey(a[0]).localeCompare(dateKey(b[0]))).slice(-7);
  const maxDay = Math.max(1, ...dailyFinance.map(([,v])=>v.turnover));

  function exportFinanceExcel() {
    const safe = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    const html = `<html><head><meta charset="UTF-8"><style>body{font-family:Arial}th{background:#12385c;color:#fff;padding:9px}td{border:1px solid #dbe7f3;padding:8px;font-weight:700}.money{text-align:right}</style></head><body><h2>Muhasebe Raporu</h2><p>Kayıt: ${periodRows.length} | Tahsilat Oranı: %${collectionRate}</p><table><thead><tr><th>No</th><th>Tarih</th><th>Müşteri</th><th>Şoför</th><th>Güzergah</th><th>Ciro</th><th>Tahsilat</th><th>Alacak</th><th>Gider</th><th>Net Kâr</th></tr></thead><tbody>${periodRows.map(r=>`<tr><td>${safe(r.serial)}</td><td>${safe(r.tarih)}</td><td>${safe(r.musteri)}</td><td>${safe(r.driver||"-")}</td><td>${safe(r.nereden)} → ${safe(r.nereye)}</td><td class="money">${Number(r.tutar)||0}</td><td class="money">${Number(r.paidAmount)||0}</td><td class="money">${Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0)}</td><td class="money">${expenses(r)}</td><td class="money">${realProfit(r)}</td></tr>`).join("")}</tbody></table></body></html>`;
    downloadText("\ufeff" + html, `muhasebe_raporu_${new Date().toISOString().slice(0,10)}.xls`, "application/vnd.ms-excel;charset=utf-8;");
  }

  return <main className="panel full finance-center">
    <div className="finance-hero">
      <div>
        <span className="finance-kicker">Merkezi Muhasebe Sistemi</span>
        <h2>💼 Akıllı Finans Merkezi</h2>
        <p>Gelir, tahsilat, alacak, gider ve net kâr tek ekranda profesyonel olarak takip edilir.</p>
      </div>
      <div className="finance-actions">
        <Button onClick={()=>printReport("Muhasebe Raporu", periodRows)}>📄 Yazdır</Button>
        <Button onClick={exportFinanceExcel}>📊 Excel</Button>
      </div>
    </div>

    <div className="finance-filters">
      <select className="control" value={period} onChange={e=>setPeriod(e.target.value)}>
        <option value="all">Tüm dönem</option>
        <option value="today">Bugün</option>
        <option value="week">Son 7 gün</option>
        <option value="month">Bu ay</option>
      </select>
      <select className="control" value={driver} onChange={e=>setDriver(e.target.value)}>
        <option value="">Tüm şoförler</option>
        {driverNames.map(n=><option key={n} value={n}>{n}</option>)}
      </select>
      <select className="control" value={cashType} onChange={e=>setCashType(e.target.value)}>
        <option value="all">Tüm ödemeler</option>
        <option value="paid">Ödenenler</option>
        <option value="partial">Kısmi ödemeler</option>
        <option value="debt">Alacaklı kayıtlar</option>
      </select>
    </div>

    <section className="finance-kpis">
      <div className="finance-card primary"><span>Toplam Ciro</span><b>{fmt(summary.turnover)}</b><small>{summary.trips} sefer</small></div>
      <div className="finance-card success"><span>Kasa / Tahsilat</span><b>{fmt(summary.cash)}</b><small>%{collectionRate} tahsilat oranı</small></div>
      <div className="finance-card danger"><span>Açık Alacak</span><b>{fmt(summary.debt)}</b><small>{summary.openCount} ödeme bekliyor</small></div>
      <div className="finance-card warning"><span>Toplam Gider</span><b>{fmt(summary.expenses + summary.portif)}</b><small>Operasyon + portif</small></div>
      <div className="finance-card dark"><span>Net Kâr</span><b>{fmt(summary.net)}</b><small>%{profitRate} kâr oranı</small></div>
      <div className="finance-card"><span>Ortalama Sefer</span><b>{fmt(avgTrip)}</b><small>Sefer başı ciro</small></div>
    </section>

    <section className="finance-layout">
      <div className="finance-panel wide">
        <div className="finance-panel-head"><h3>📈 Günlük Ciro Analizi</h3><span>Son {dailyFinance.length} gün</span></div>
        <div className="finance-bars">
          {dailyFinance.length ? dailyFinance.map(([day,v])=><div className="finance-bar-row" key={day}>
            <div className="bar-label"><b>{day}</b><small>{v.trips} sefer</small></div>
            <div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(8, Math.round((v.turnover/maxDay)*100))}%`}} /></div>
            <strong>{fmt(v.turnover)}</strong>
          </div>) : <div className="empty-state">Bu filtrede finans hareketi yok.</div>}
        </div>
      </div>

      <div className="finance-panel">
        <div className="finance-panel-head"><h3>🎯 KPI Durumu</h3><span>Canlı</span></div>
        <div className="kpi-line"><span>Tahsilat</span><b>%{collectionRate}</b></div>
        <div className="progress"><i style={{width:`${Math.min(collectionRate,100)}%`}} /></div>
        <div className="kpi-line"><span>Kâr oranı</span><b>%{profitRate}</b></div>
        <div className="progress"><i className="profit" style={{width:`${Math.max(0, Math.min(profitRate,100))}%`}} /></div>
        <div className="finance-alert-list">
          {summary.debt > 0 && <div className="finance-alert danger">⚠️ {fmt(summary.debt)} açık alacak var.</div>}
          {collectionRate < 50 && <div className="finance-alert warning">Tahsilat oranı düşük görünüyor.</div>}
          {summary.net < 0 && <div className="finance-alert danger">Net kâr negatif.</div>}
          {summary.net >= 0 && collectionRate >= 50 && <div className="finance-alert success">Finans durumu dengeli.</div>}
        </div>
      </div>
    </section>

    <section className="finance-layout three">
      <div className="finance-panel">
        <div className="finance-panel-head"><h3>🚚 Şoför Finans Performansı</h3><span>{driverFinance.length} kişi</span></div>
        <div className="finance-list">
          {driverFinance.slice(0,8).map(([name,v])=><div className="finance-row" key={name}>
            <div><b>{name}</b><small>{v.trips} sefer • gider {fmt(v.expenses)}</small></div>
            <strong className="green">{fmt(v.profit)}</strong>
          </div>)}
        </div>
      </div>
      <div className="finance-panel">
        <div className="finance-panel-head"><h3>💳 En Büyük Alacaklar</h3><span>Öncelikli</span></div>
        <div className="finance-list">
          {topDebtors.length ? topDebtors.map(r=><div className="finance-row debt" key={r.id}>
            <div><b>{r.musteri}</b><small>{r.serial} • {r.tarih}</small></div>
            <strong>{fmt((r.tutar||0)-(r.paidAmount||0))}</strong>
          </div>) : <div className="empty-state">Açık alacak yok.</div>}
        </div>
      </div>
      <div className="finance-panel">
        <div className="finance-panel-head"><h3>🧾 Son Kasa Hareketleri</h3><span>{cashFlow.length} kayıt</span></div>
        <div className="finance-list">
          {cashFlow.map(r=><div className="finance-row" key={r.id}>
            <div><b>{r.musteri}</b><small>{r.tarih} • {paymentLabel(paymentStatus(r))}</small></div>
            <strong>{fmt(r.paidAmount)}</strong>
          </div>)}
        </div>
      </div>
    </section>

    <div className="finance-table-title"><h3>📋 Finansal Sefer Detayları</h3><span>{periodRows.length} kayıt</span></div>
    <TripTable rows={periodRows} compact stats={{ total:summary.turnover, paidTotal:summary.cash, debt:summary.debt, gider:summary.expenses+summary.portif, profit:summary.net }} />
  </main>;
}


function DriverPortalPage({ tripKey, localRows = [], setData, addLog }) {
  const [trip, setTrip] = useState(() => localRows.find(r => String(r.local_id || r.id || r.serial) === String(tripKey)) || null);
  const [statusMessage, setStatusMessage] = useState("Yükleniyor...");
  const [docType, setDocType] = useState("Teslim Fotoğrafı");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [cloudDocs, setCloudDocs] = useState([]);

  useEffect(() => {
    let alive = true;
    async function loadTrip() {
      const local = localRows.find(r => String(r.local_id || r.id || r.serial) === String(tripKey));
      if (local) {
        setTrip(local);
        setStatusMessage("Sefer yerel listeden yüklendi.");
        try { setCloudDocs(await listTripEvrakFromCloud(local)); } catch {}
        return;
      }
      if (!isSupabaseConfigured || !supabase) {
        setStatusMessage("Supabase bağlantısı yok. Ofisten linki tekrar isteyin.");
        return;
      }
      const key = String(tripKey || "");
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .or(`local_id.eq.${key},serial.eq.${key}`)
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (error) { setStatusMessage(`Hata: ${error.message}`); return; }
      if (!data) { setStatusMessage("Sefer bulunamadı."); return; }
      const loaded = {
        ...(data.payload || {}),
        id: data.payload?.id ?? data.local_id,
        local_id: data.local_id,
        serial: data.serial || data.payload?.serial,
        tarih: data.tarih || data.payload?.tarih,
        musteri: data.musteri || data.payload?.musteri,
        phone: data.phone || data.payload?.phone,
        driver: data.driver || data.payload?.driver,
        plaka: data.plaka || data.payload?.plaka,
        nereden: data.nereden || data.payload?.nereden,
        nereye: data.nereye || data.payload?.nereye,
        tutar: Number(data.tutar) || 0,
        paidAmount: Number(data.paid_amount) || 0,
        tripStatus: data.trip_status || data.payload?.tripStatus || "new",
      };
      setTrip(loaded);
      setStatusMessage("Sefer cloud üzerinden yüklendi.");
      try { setCloudDocs(await listTripEvrakFromCloud(loaded)); } catch {}
    }
    loadTrip();
    return () => { alive = false; };
  }, [tripKey, localRows]);

  async function updateDriverStatus(nextStatus) {
    if (!trip) return;
    const updated = {
      ...trip,
      tripStatus: nextStatus,
      tripTimeline: [
        ...(trip.tripTimeline || []),
        { id: Date.now(), date: new Date().toLocaleString("tr-TR"), status: nextStatus, title: `Şoför durumu: ${statusLabel(nextStatus)}`, note: "Şoför portalından güncellendi" }
      ]
    };
    setTrip(updated);
    setData?.(prev => prev.map(r => String(r.local_id || r.id || r.serial) === String(tripKey) ? normalizeRow(updated) : r));
    addLog?.(`Şoför portal durumu: ${statusLabel(nextStatus)}`, updated);
    if (supabase) {
      const payload = { ...(updated.payload || {}), ...updated };
      const { error } = await supabase.from("trips").update({ trip_status: nextStatus, payload, updated_at: new Date().toISOString() }).eq("local_id", String(trip.local_id || trip.id || trip.serial));
      if (error) setStatusMessage(`Durum yerelde güncellendi, cloud hata: ${error.message}`);
      else setStatusMessage("Durum güncellendi ve ofise gönderildi.");
    } else {
      setStatusMessage("Durum yerelde güncellendi. İnternet/Supabase hazır olunca senkronize olur.");
    }
  }

  async function uploadDriverFile() {
    if (!file || !trip) return setStatusMessage("Önce dosya seçin.");
    setUploading(true);
    setStatusMessage("Dosya yükleniyor...");
    try {
      const uploaded = await uploadTripEvrakToCloud({
        file,
        trip,
        docType,
        note,
        user: { username: trip.driver || "driver-portal", full_name: trip.driver || "Şoför" },
      });
      setCloudDocs(prev => [uploaded, ...prev]);
      setFile(null);
      setNote("");
      setStatusMessage("Dosya yüklendi. Ofis ekranında görünecek.");
      addLog?.("Şoför portalından evrak yüklendi", trip);
    } catch (err) {
      setStatusMessage(`Hata: ${err?.message || "Dosya yüklenemedi."}`);
    } finally {
      setUploading(false);
    }
  }

  function docUrl(d) { return d.public_url || d.cloudUrl || d.fileData || ""; }
  function docName(d) { return d.file_name || d.fileName || "Evrak"; }

  if (!trip) return <div className="driver-portal-page"><div className="driver-portal-card"><h1>🚚 Şoför Portal</h1><p>{statusMessage}</p><button onClick={() => window.location.reload()}>Tekrar Dene</button></div></div>;

  return <div className="driver-portal-page">
    <div className="driver-portal-hero">
      <div><span>ŞOFÖR PORTAL</span><h1>{trip.serial || "Sefer"}</h1><p>{trip.nereden || "—"} → {trip.nereye || "—"}</p></div>
      <strong>{statusLabel(trip.tripStatus)}</strong>
    </div>
    <div className="driver-portal-grid">
      <section className="driver-portal-card wide">
        <h2>Sefer Bilgileri</h2>
        <div className="driver-info-grid">
          <div><span>Müşteri</span><b>{trip.musteri || "—"}</b></div>
          <div><span>Tarih</span><b>{trip.tarih || "—"}</b></div>
          <div><span>Araç</span><b>{trip.plaka || "—"}</b></div>
          <div><span>Şoför</span><b>{trip.driver || "—"}</b></div>
        </div>
      </section>
      <section className="driver-portal-card">
        <h2>Durum Güncelle</h2>
        <div className="driver-status-buttons">
          <button onClick={() => updateDriverStatus("received")}>✅ Araç Alındı</button>
          <button onClick={() => updateDriverStatus("onRoad")}>🚚 Yolda</button>
          <button onClick={() => updateDriverStatus("delivered")}>🏁 Teslim Edildi</button>
        </div>
      </section>
      <section className="driver-portal-card wide">
        <h2>📎 Evrak / Fotoğraf Yükle</h2>
        <div className="driver-upload-form">
          <select value={docType} onChange={e => setDocType(e.target.value)}>{TRIP_DOCUMENT_TYPES.map(x => <option key={x}>{x}</option>)}</select>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Not yazın" />
          <label><input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} /><span>{file ? file.name : "Dosya / Kamera Seç"}</span></label>
          <button disabled={uploading || !file} onClick={uploadDriverFile}>{uploading ? "Yükleniyor..." : "☁️ Ofise Gönder"}</button>
        </div>
        <p className={statusMessage.startsWith("Hata") ? "driver-msg error" : "driver-msg"}>{statusMessage}</p>
      </section>
      <section className="driver-portal-card wide">
        <h2>Yüklenen Evraklar</h2>
        <div className="driver-doc-list">{cloudDocs.map(d => <a key={d.id || d.local_id || d.storage_path} href={docUrl(d)} target="_blank" rel="noreferrer"><b>{d.doc_type || d.type || "Evrak"}</b><span>{docName(d)}</span></a>)}{!cloudDocs.length && <p>Henüz evrak yok.</p>}</div>
      </section>
    </div>
  </div>;
}

function DriverPanelPage({ rows, currentUser, updateTripStatus, whatsapp }) {
  const myRows = currentUser?.role === "driver" ? rows.filter(r => normalizeText(r.driver) === normalizeText(currentUser.name)) : rows.filter(r => r.tripStatus !== "delivered");
  return <main className="panel full"><div className="topline"><h2>📱 Şoför Paneli</h2><span className="pill">{myRows.length} aktif sefer</span></div><div className="driver-panel-grid">{myRows.map(r=><div className="mobile-card driver-job" key={r.id}><div className="mobile-top"><b>{r.serial}</b><span className={`badge ${paymentStatus(r)}`}>{statusLabel(r.tripStatus)}</span></div><div className="mobile-route">{r.nereden} → {r.nereye}</div><p><b>Müşteri:</b> {r.musteri} / {r.phone || "Telefon yok"}</p><p><b>Araç:</b> {r.plaka}</p><div className="buttons compact"><Button onClick={()=>updateTripStatus(r.id,"received")}>Araç Alındı</Button><Button onClick={()=>updateTripStatus(r.id,"onRoad")}>Yolda</Button><Button onClick={()=>updateTripStatus(r.id,"delivered")}>Teslim</Button><Button onClick={()=>window.open(`https://www.google.com/maps/dir/${encodeURIComponent(r.nereden)}/${encodeURIComponent(r.nereye)}`,'_blank')}>Rota</Button>{r.phone && <Button onClick={()=>whatsapp(r,"received")}>Müşteriye Mesaj</Button>}</div></div>)}</div></main>;
}














function AIOperatingSystem({ rows = [], drivers = [], vehicles = [], customers = [], stats = {}, users = [], setTab }) {
  const [mode, setMode] = useState("learning");
  const [voiceText, setVoiceText] = useState("");
  const [language, setLanguage] = useState("tr");

  const delayed = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const unpaid = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0);
  const active = rows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received" || r.tripStatus === "pending");

  const driverLearning = drivers.map(d => {
    const trips = rows.filter(r => r.driver === d.name);
    const profit = trips.reduce((s,r)=>s+realProfit(r),0);
    const delay = trips.filter(r=>r.tripStatus !== "delivered" && daysBetween(r.tarih)>=2).length;
    return { name:d.name, trips:trips.length, profit, delay, score:Math.max(20, Math.min(99, Math.round(65 + trips.length*3 + profit/15000 - delay*8))) };
  }).sort((a,b)=>b.score-a.score);

  const customerLearning = customers.map(([name,c]) => ({
    name,
    trips:c.trips,
    total:c.total,
    debt:c.debt,
    score:Math.max(10, Math.min(99, Math.round(70 + c.trips*2 + c.total/50000 - c.debt/10000)))
  })).sort((a,b)=>b.score-a.score);

  const forecast = {
    nextRevenue: Math.round((Number(stats.total)||0) * 1.18 + active.length * 1200),
    nextProfit: Math.round((Number(stats.profit)||0) * 1.14),
    risk: Math.min(99, delayed.length*12 + unpaid.length*4),
    demand: Math.min(100, 62 + active.length*3 + customers.length)
  };

  const executiveDecisions = [
    { title:"Yeni şube fırsatı", text:"İstanbul ve Hatay hattında gelir yoğunluğu yüksek. Yeni operasyon noktası değerlendirilebilir.", impact:"Yüksek" },
    { title:"Fiyat optimizasyonu", text:"Gecikme riski yüksek hatlarda minimum fiyat artırımı önerilir.", impact:"Orta" },
    { title:"Araç yatırımı", text:"Aktif sefer yoğunluğu artıyor. 1-2 yeni araç eklemek kârı artırabilir.", impact:"Yüksek" },
    { title:"Tahsilat politikası", text:`${unpaid.length} açık alacak var. Otomatik hatırlatma sistemi aktif edilmeli.`, impact:"Kritik" }
  ];

  const copilotCards = [
    ["Seferler", delayed.length ? `${delayed.length} gecikme riski var` : "Sefer akışı normal", "trips"],
    ["Muhasebe", unpaid.length ? `${unpaid.length} tahsilat bekliyor` : "Tahsilat dengeli", "accounting"],
    ["Şoförler", driverLearning[0]?.name ? `En iyi: ${driverLearning[0].name}` : "Veri yok", "drivers"],
    ["CRM", customerLearning[0]?.name ? `VIP: ${customerLearning[0].name}` : "Müşteri verisi yok", "customers"],
    ["AI Brain", "Gelişmiş karar motoru hazır", "aibrain"],
    ["Control Tower", "Global operasyon izleme hazır", "tower"]
  ];

  const translations = {
    tr:["Operasyon normal", "Risk analizi", "Tahsilat", "Kâr tahmini"],
    ar:["العمليات مستقرة", "تحليل المخاطر", "التحصيل", "توقع الأرباح"],
    en:["Operation normal", "Risk analysis", "Collection", "Profit forecast"],
    ku:["Operasyon aram e", "Analîza rîskê", "Berhevkirin", "Pêşbîniya qazancê"]
  };

  function voiceCommand() {
    const q = normalizeText(voiceText);
    if (q.includes("borc") || q.includes("دين") || q.includes("tahsilat")) return setTab("accounting");
    if (q.includes("sefer") || q.includes("رحله") || q.includes("trip")) return setTab("seferler");
    if (q.includes("rapor") || q.includes("تقرير")) return setTab("reports");
    if (q.includes("musteri") || q.includes("عميل")) return setTab("customers");
    if (q.includes("sofor") || q.includes("سائق")) return setTab("drivers");
    alert("Komut algılandı: " + (voiceText || "boş komut"));
  }

  const tabs = [
    ["learning","Self-Learning AI"],
    ["automation","Business Automation"],
    ["forecast","Forecast Lab"],
    ["hyper","Hyper Analytics"],
    ["voice","Voice Command OS"],
    ["copilot","Copilot Everywhere"],
    ["language","Multi-Language AI"],
    ["decision","Executive Decision"]
  ];

  return <main className="panel full ai-os-page">
    <div className="ai-os-hero">
      <div>
        <span className="section-kicker">AI Operating System</span>
        <h2>🧠 AI OS — Akıllı İşletim Sistemi</h2>
        <p>Kendi kendine öğrenen, tahmin eden, otomasyon kuran, karar öneren ve çok dilli çalışan merkezi yapay zeka katmanı.</p>
      </div>
      <div className="ai-os-core"><span></span><b>AI Core Online</b><small>Local Intelligence • Cloud Ready</small></div>
    </div>

    <div className="ai-os-tabs">
      {tabs.map(([k,l])=><button key={k} className={mode===k?"active":""} onClick={()=>setMode(k)}>{l}</button>)}
    </div>

    <div className="ai-os-kpis">
      <div><small>AI Öğrenme Skoru</small><b>%94</b><span>Veri modeli aktif</span></div>
      <div><small>Risk Skoru</small><b>%{forecast.risk}</b><span>Gecikme + tahsilat</span></div>
      <div><small>Gelir Tahmini</small><b>{fmt(forecast.nextRevenue)}</b><span>Gelecek dönem</span></div>
      <div><small>Kâr Tahmini</small><b>{fmt(forecast.nextProfit)}</b><span>AI forecast</span></div>
      <div><small>Talep Skoru</small><b>%{forecast.demand}</b><span>Pazar eğilimi</span></div>
      <div><small>Otomasyon</small><b>8</b><span>Aktif senaryo</span></div>
    </div>

    {mode === "learning" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>1. Self-Learning AI Engine</h3><button onClick={()=>setTab("aibrain")}>AI Brain Aç</button></div>
      <div className="learning-grid">
        <div><h4>Şoför Öğrenme Modeli</h4>{driverLearning.slice(0,6).map(d=><p key={d.name}><b>{d.name}</b><span>{d.trips} sefer</span><em>Skor %{d.score}</em></p>)}</div>
        <div><h4>Müşteri Öğrenme Modeli</h4>{customerLearning.slice(0,6).map(c=><p key={c.name}><b>{c.name}</b><span>{fmt(c.total)}</span><em>Skor %{c.score}</em></p>)}</div>
      </div>
    </section>}

    {mode === "automation" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>2. Autonomous Business Automation</h3><button onClick={()=>setTab("collabpro")}>Görev Merkezi</button></div>
      <div className="automation-os-grid">
        {["Sefer oluşturma", "Şoför atama", "Fatura gönderme", "Tahsilat hatırlatma", "Risk bildirimi", "Günlük rapor", "Evrak kontrol", "Bakım uyarısı"].map((x,i)=><div key={x}><b>{x}</b><span>{i<4 ? "Aktif senaryo" : "Hazır"}</span><button>Otomasyonu kur</button></div>)}
      </div>
    </section>}

    {mode === "forecast" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>3. AI Forecasting Laboratory</h3><button onClick={()=>setTab("reports")}>Raporlar</button></div>
      <div className="forecast-lab">
        <div><small>Gelecek Gelir</small><b>{fmt(forecast.nextRevenue)}</b><i style={{height:"82%"}}></i></div>
        <div><small>Gelecek Kâr</small><b>{fmt(forecast.nextProfit)}</b><i style={{height:"68%"}}></i></div>
        <div><small>Pazar Talebi</small><b>%{forecast.demand}</b><i style={{height:forecast.demand+"%"}}></i></div>
        <div><small>Risk</small><b>%{forecast.risk}</b><i style={{height:forecast.risk+"%"}}></i></div>
      </div>
    </section>}

    {mode === "hyper" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>4. Hyper Analytics Center</h3><button onClick={()=>setTab("tower")}>Control Tower</button></div>
      <div className="hyper-grid">
        {["Heatmap", "Performance Matrix", "Cost Intelligence", "Customer Movement", "Branch Benchmark", "Route Profitability"].map((x,i)=><div key={x}><b>{x}</b><span>%{78+i*3}</span><div><i style={{width:(55+i*7)+"%"}}></i></div></div>)}
      </div>
    </section>}

    {mode === "voice" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>5. AI Voice Command OS</h3><button onClick={voiceCommand}>Komutu Çalıştır</button></div>
      <div className="voice-os-box">
        <textarea value={voiceText} onChange={e=>setVoiceText(e.target.value)} placeholder='Örn: "Borçları göster", "رحلات اليوم", "müşterileri aç", "rapor hazırla"...'></textarea>
        <div><button onClick={()=>setVoiceText("Borçları göster")}>Borçları göster</button><button onClick={()=>setVoiceText("Seferleri aç")}>Seferleri aç</button><button onClick={()=>setVoiceText("Rapor hazırla")}>Rapor hazırla</button></div>
      </div>
    </section>}

    {mode === "copilot" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>6. AI Copilot Everywhere</h3><button onClick={()=>setTab("ai")}>AI Asistan</button></div>
      <div className="copilot-grid">
        {copilotCards.map(([name,text,tab])=><div key={name}><b>{name}</b><span>{text}</span><button onClick={()=>setTab(tab)}>Sayfaya git</button></div>)}
      </div>
    </section>}

    {mode === "language" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>7. Global Multi-Language AI</h3><select value={language} onChange={e=>setLanguage(e.target.value)}><option value="tr">Türkçe</option><option value="ar">العربية</option><option value="en">English</option><option value="ku">Kurdî</option></select></div>
      <div className="language-panel">
        {translations[language].map(x=><div key={x}>{x}</div>)}
      </div>
    </section>}

    {mode === "decision" && <section className="ai-os-section">
      <div className="ai-os-head"><h3>8. AI Executive Decision System</h3><button onClick={()=>setTab("saas")}>SaaS Merkezi</button></div>
      <div className="decision-list">
        {executiveDecisions.map(d=><div key={d.title} className={normalizeText(d.impact)}><strong>{d.impact}</strong><b>{d.title}</b><span>{d.text}</span><button>Kararı değerlendir</button></div>)}
      </div>
    </section>}
  </main>;
}

function EnterpriseEcosystemExpansion({ rows = [], drivers = [], vehicles = [], users = [], customers = [], stats = {}, setTab }) {
  const [active, setActive] = useState("customer");
  const [brand, setBrand] = useState("Seyitoğulları");
  const [ocrText, setOcrText] = useState("");

  const openTrips = rows.filter(r => r.tripStatus !== "delivered");
  const delivered = rows.filter(r => r.tripStatus === "delivered");
  const unpaid = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0);
  const activeDrivers = drivers.filter(d => d.status === "available" || d.status === "busy" || d.status === "active").length;

  const plugins = [
    ["WhatsApp Business API","Müşteri ve şoför bildirimleri","Ready","💬"],
    ["Stripe / Iyzico","Online ödeme ve abonelik","Demo","💳"],
    ["Google Maps","GPS, rota, trafik","Ready","🗺️"],
    ["Firebase","Realtime database & auth","Ready","🔥"],
    ["Logo e-Fatura","Türkiye e-Fatura entegrasyonu","Planlandı","🧾"],
    ["Paraşüt","Muhasebe otomasyonu","Planlandı","📊"],
    ["Twilio SMS","SMS ve voice call","Ready","📱"],
    ["AI OCR API","Belge okuma ve otomatik form","Demo","🤖"]
  ];

  const employees = [
    { name:"Operasyon Müdürü", role:"Operasyon", status:"Aktif", score:92 },
    { name:"Muhasebe Uzmanı", role:"Finans", status:"Aktif", score:88 },
    { name:"Saha Sorumlusu", role:"Saha", status:"İzinli", score:81 },
    { name:"Şoför Lideri", role:"Şoför", status:"Aktif", score:90 }
  ];

  const securityEvents = [
    { level:"Normal", title:"Başarılı giriş", user:users?.[0]?.name || "Admin", time:"Bugün" },
    { level:"Uyarı", title:"Yeni cihaz oturumu", user:"Operasyon", time:"09:40" },
    { level:"Normal", title:"2FA önerisi", user:"Sistem", time:"Canlı" },
    { level:"Kritik", title:"Hassas finans ekranı erişimi", user:"Muhasebe", time:"11:20" }
  ];

  function simulateOCR() {
    setOcrText("AI OCR Sonucu:\nBelge Türü: Fatura\nMüşteri: Örnek Müşteri\nTutar: ₺12.500\nTarih: Bugün\nDurum: Form alanlarına aktarılmaya hazır.");
  }

  const tabs = [
    ["customer","Customer Mobile App"],
    ["driver","Driver Native Pro"],
    ["gps","Live GPS System"],
    ["ocr","AI OCR Engine"],
    ["invoice","E-Invoice Automation"],
    ["hr","HR Management"],
    ["security","AI Security Center"],
    ["market","Plugin Marketplace"]
  ];

  return <main className="panel full ecosystem-page">
    <div className="ecosystem-hero">
      <div>
        <span className="section-kicker">Enterprise Ecosystem Expansion</span>
        <h2>🚀 Global SaaS Ecosystem Suite</h2>
        <p>Customer App, Driver App, GPS, OCR, e‑Invoice, HR, Security ve Marketplace modülleri tek merkezde.</p>
      </div>
      <div className="eco-brand">
        <small>White Label</small>
        <input value={brand} onChange={e=>setBrand(e.target.value)} />
      </div>
    </div>

    <div className="eco-tabs">
      {tabs.map(([k,l])=><button key={k} className={active===k?"active":""} onClick={()=>setActive(k)}>{l}</button>)}
    </div>

    <div className="eco-kpis">
      <div><small>Müşteri</small><b>{customers.length}</b><span>Portal & mobil app</span></div>
      <div><small>Şoför</small><b>{drivers.length}</b><span>{activeDrivers} aktif</span></div>
      <div><small>GPS Sefer</small><b>{openTrips.length}</b><span>Canlı izleme</span></div>
      <div><small>e-Fatura</small><b>{delivered.length}</b><span>Hazır kayıt</span></div>
      <div><small>Güvenlik</small><b>{securityEvents.length}</b><span>AI izleme</span></div>
      <div><small>Plugin</small><b>{plugins.length}</b><span>Marketplace</span></div>
    </div>

    {active === "customer" && <section className="eco-section">
      <div className="eco-head"><h3>📱 Customer Mobile App</h3><button onClick={()=>setTab("portal")}>Müşteri Portalı Aç</button></div>
      <div className="phone-showcase">
        <div className="client-phone">
          <div className="phone-top">{brand} Client</div>
          <div className="client-card"><b>Canlı Sefer Takibi</b><span>{openTrips[0]?.nereden || "Reyhanlı"} → {openTrips[0]?.nereye || "İstanbul"}</span><div className="app-route"><i></i></div></div>
          <div className="client-actions"><button>Yeni Rezervasyon</button><button>Ödeme Yap</button><button>Şoförü Değerlendir</button></div>
          <div className="chat-preview">💬 Şirket ile canlı destek hazır.</div>
        </div>
        <div className="feature-list"><h4>Özellikler</h4><ul><li>Hızlı rezervasyon</li><li>Canlı takip linki</li><li>Online ödeme</li><li>Bildirimler</li><li>Şoför puanlama</li><li>Chat destek</li></ul></div>
      </div>
    </section>}

    {active === "driver" && <section className="eco-section">
      <div className="eco-head"><h3>🚚 Driver Native Mobile App Pro</h3><button onClick={()=>setTab("drivermobile")}>Şoför Mobil Aç</button></div>
      <div className="native-grid">
        {["GPS Direkt Aktarım","Kamera & Evrak","Müşteri İmzası","Voice Commands","Offline Queue","Masraf Girişi"].map((x,i)=><div key={x}><span>{["📍","📷","✍️","🎙️","📴","⛽"][i]}</span><b>{x}</b><small>Native app hazır altyapı</small></div>)}
      </div>
    </section>}

    {active === "gps" && <section className="eco-section">
      <div className="eco-head"><h3>🛰️ Live GPS Tracking System</h3><button onClick={()=>setTab("map")}>GPS Takip Aç</button></div>
      <div className="gps-ecosystem-map">
        {openTrips.slice(0,10).map((r,i)=><button key={r.id} style={{left:(10+(i*13)%78)+"%", top:(18+(i*19)%62)+"%"}}><span>🚗</span><b>{r.plaka || r.serial}</b><small>{28+i*4} km/s</small></button>)}
        <div className="gps-line one"></div><div className="gps-line two"></div>
      </div>
    </section>}

    {active === "ocr" && <section className="eco-section">
      <div className="eco-head"><h3>🤖 AI Camera & OCR Engine</h3><button onClick={simulateOCR}>Demo OCR Çalıştır</button></div>
      <div className="ocr-grid">
        <div className="ocr-drop">📄 Belge / Fotoğraf Yükleme Alanı<br/><small>Fatura, ruhsat, kimlik, sözleşme</small></div>
        <pre>{ocrText || "OCR sonucu burada görünecek..."}</pre>
      </div>
    </section>}

    {active === "invoice" && <section className="eco-section">
      <div className="eco-head"><h3>🧾 E‑Invoice & Accounting Automation</h3><button onClick={()=>setTab("accounting")}>Muhasebe Aç</button></div>
      <div className="einvoice-grid">
        {["Logo e‑Fatura","Paraşüt","QuickBooks","Vergi Otomasyonu","PDF Arşiv","Cari Mutabakat"].map((x,i)=><div key={x}><b>{x}</b><span>{i<3 ? "Entegrasyon hazır" : "Otomasyon hazır"}</span><em>{i<2 ? "TR" : "Global"}</em></div>)}
      </div>
    </section>}

    {active === "hr" && <section className="eco-section">
      <div className="eco-head"><h3>👥 HR & Employee Management</h3><button onClick={()=>setTab("settings")}>Kullanıcılar</button></div>
      <div className="hr-grid">
        {employees.map(e=><div key={e.name}><b>{e.name}</b><span>{e.role}</span><small>{e.status}</small><div className="hr-score"><i style={{width:e.score+"%"}}></i></div><em>Performans %{e.score}</em></div>)}
      </div>
    </section>}

    {active === "security" && <section className="eco-section">
      <div className="eco-head"><h3>🛡️ AI Security Center</h3><button onClick={()=>setTab("logs")}>Audit Log</button></div>
      <div className="security-grid">
        <div className="security-main"><b>Security Score</b><strong>%91</strong><span>2FA, session tracking ve davranış analizi önerilir.</span></div>
        <div className="security-events">{securityEvents.map(e=><div key={e.title} className={normalizeText(e.level)}><b>{e.level}</b><span>{e.title}</span><small>{e.user} • {e.time}</small></div>)}</div>
      </div>
    </section>}

    {active === "market" && <section className="eco-section">
      <div className="eco-head"><h3>🧩 Marketplace & Plugin System</h3><button onClick={()=>setTab("saas")}>SaaS Merkezi</button></div>
      <div className="plugin-grid">
        {plugins.map(([name,desc,status,icon])=><div key={name}><span>{icon}</span><b>{name}</b><small>{desc}</small><em>{status}</em><button>Kur / Ayarla</button></div>)}
      </div>
    </section>}
  </main>;
}

function GlobalControlTower({ rows = [], drivers = [], vehicles = [], customers = [], notificationItems = [], stats = {}, setTab }) {
  const [mode, setMode] = useState("map");

  const activeRows = rows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received" || r.tripStatus === "pending");
  const delayedRows = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const unpaidRows = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0);

  const branches = [
    { name:"Reyhanlı", lat:34, lng:52, revenue:1240000, risk:delayedRows.length, color:"#2563eb" },
    { name:"İstanbul", lat:21, lng:28, revenue:2120000, risk:2, color:"#16a34a" },
    { name:"Gaziantep", lat:40, lng:47, revenue:980000, risk:1, color:"#f97316" },
    { name:"Hatay", lat:38, lng:58, revenue:1540000, risk:3, color:"#7c3aed" }
  ];

  const twinItems = [
    { type:"Sefer", count:rows.length, active:activeRows.length, health:delayedRows.length ? 72 : 94, icon:"📦" },
    { type:"Araç", count:vehicles.length || new Set(rows.map(r=>r.plaka).filter(Boolean)).size, active:activeRows.length, health:86, icon:"🚗" },
    { type:"Şoför", count:drivers.length, active:drivers.filter(d=>d.status==="available" || d.status==="busy").length, health:91, icon:"🚚" },
    { type:"Müşteri", count:customers.length, active:unpaidRows.length, health:unpaidRows.length ? 78 : 96, icon:"👥" },
    { type:"Şube", count:branches.length, active:branches.length, health:88, icon:"🏢" }
  ];

  const incidents = [
    ...delayedRows.slice(0,4).map(r=>({ level:"Kritik", title:"Geciken sefer", text:`${r.serial} • ${r.musteri}`, action:"Operasyona yönlendir" })),
    ...unpaidRows.slice(0,3).map(r=>({ level:"Orta", title:"Tahsilat riski", text:`${r.musteri} • ${fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}`, action:"WhatsApp hatırlat" })),
    { level:"Düşük", title:"Sistem kontrolü", text:"Günlük yedekleme ve audit kontrolü önerilir.", action:"Kontrol et" }
  ].slice(0,8);

  const marketplace = [
    ["WhatsApp API","Mesaj & bildirim","Aktif"],
    ["SMS Provider","SMS uyarıları","Hazır"],
    ["Stripe / Ödeme","Online ödeme","Demo"],
    ["Logo / e-Fatura","Muhasebe entegrasyonu","Planlandı"],
    ["Maps API","Gerçek harita & trafik","Hazır"],
    ["Firebase","Realtime database","Ready"],
    ["SAP / ERP","Kurumsal entegrasyon","Enterprise"],
    ["AI API","Gelişmiş yapay zeka","Opsiyonel"]
  ];

  const costSaving = Math.round((Number(stats.total)||0) * 0.07 + activeRows.length * 450);
  const nextMonth = Math.round((Number(stats.total)||0) * 1.14);
  const profitForecast = Math.round((Number(stats.profit)||0) * 1.11);

  const mapPins = [
    ...branches.map((b,i)=>({ label:b.name, left:b.lat, top:b.lng, type:"branch", color:b.color, text:fmt(b.revenue) })),
    ...activeRows.slice(0,9).map((r,i)=>({ label:r.plaka || r.serial, left:12 + (i*11)%76, top:18 + (i*17)%62, type: delayedRows.some(d=>d.id===r.id) ? "risk" : "vehicle", color: delayedRows.some(d=>d.id===r.id) ? "#dc2626" : "#0ea5e9", text:r.musteri }))
  ];

  function autoDispatchPlan() {
    return activeRows.slice(0,5).map((r,i)=>({
      trip:r,
      driver:drivers[i % Math.max(drivers.length,1)]?.name || "En yakın şoför",
      vehicle:r.plaka || "En uygun araç",
      eta:`${28 + i*7} dk`,
      saving:fmt(350 + i*120)
    }));
  }

  return <main className="panel full tower-page">
    <div className="tower-hero">
      <div>
        <span className="section-kicker">Global AI Control Tower</span>
        <h2>🌍 Global Control Tower + Digital Twin</h2>
        <p>Harita, Digital Twin, trafik/ hava durumu, maliyet optimizasyonu, otonom dispatch, CEO dashboard, kriz merkezi ve entegrasyon pazarı.</p>
      </div>
      <div className="tower-status"><span></span> Global Live Mode</div>
    </div>

    <div className="tower-tabs">
      {[["map","World Map"],["twin","Digital Twin"],["traffic","Traffic & Weather"],["cost","Cost AI"],["auto","Autonomous Dispatch"],["ceo","CEO Dashboard"],["crisis","Crisis Center"],["api","API Marketplace"]].map(([k,l])=>
        <button key={k} className={mode===k?"active":""} onClick={()=>setMode(k)}>{l}</button>
      )}
    </div>

    <div className="tower-kpis">
      <div><small>Global Sefer</small><b>{rows.length}</b><span>Toplam operasyon</span></div>
      <div><small>Aktif Araç</small><b>{activeRows.length}</b><span>Canlı takip</span></div>
      <div><small>Kriz / Risk</small><b>{delayedRows.length}</b><span>AI uyarı</span></div>
      <div><small>Gelir Tahmini</small><b>{fmt(nextMonth)}</b><span>Sonraki ay</span></div>
      <div><small>Kâr Tahmini</small><b>{fmt(profitForecast)}</b><span>AI forecast</span></div>
      <div><small>Tasarruf</small><b>{fmt(costSaving)}</b><span>Optimizasyon</span></div>
    </div>

    {mode === "map" && <section className="tower-section">
      <div className="tower-section-head"><h3>🗺️ Live World Map Control Tower</h3><button onClick={()=>setTab("map")}>GPS Takip Aç</button></div>
      <div className="world-map">
        <div className="world-grid"></div>
        <div className="world-route r1"></div><div className="world-route r2"></div><div className="world-route r3"></div>
        {mapPins.map((p,i)=><button key={i} className={`world-pin ${p.type}`} style={{left:p.left+"%", top:p.top+"%", "--c":p.color}} title={`${p.label} ${p.text}`}>
          <span>{p.type==="branch" ? "🏢" : p.type==="risk" ? "🚨" : "🚗"}</span><b>{p.label}</b>
        </button>)}
      </div>
    </section>}

    {mode === "twin" && <section className="tower-section">
      <div className="tower-section-head"><h3>🧬 Digital Twin System</h3><button onClick={()=>setTab("ops2")}>Operasyon 2.0</button></div>
      <div className="twin-grid">
        {twinItems.map(t=><div key={t.type} className="twin-card">
          <div><span>{t.icon}</span><b>{t.type}</b></div>
          <strong>{t.count}</strong>
          <small>{t.active} aktif</small>
          <div className="health"><i style={{width:t.health+"%"}}></i></div>
          <em>Sağlık skoru %{t.health}</em>
        </div>)}
      </div>
    </section>}

    {mode === "traffic" && <section className="tower-section">
      <div className="tower-section-head"><h3>🌦️ AI Traffic & Weather Engine</h3><button onClick={()=>setTab("aibrain")}>AI Brain</button></div>
      <div className="traffic-grid">
        {["İstanbul: Yoğun trafik, rota değişikliği önerilir.","Hatay: Hava açık, teslimat riski düşük.","Gaziantep: Bölgesel yoğunluk orta seviyede.","Reyhanlı: Sınır hattı bekleme riski izlenmeli."].map((x,i)=><div key={i}><b>{x.split(":")[0]}</b><span>{x.split(":")[1]}</span><em>{i===0 ? "Kritik" : i===3 ? "Orta" : "Normal"}</em></div>)}
      </div>
    </section>}

    {mode === "cost" && <section className="tower-section">
      <div className="tower-section-head"><h3>💸 Smart Cost Optimization</h3><button onClick={()=>setTab("accounting")}>Muhasebe</button></div>
      <div className="cost-panel">
        <div><small>Potansiyel Tasarruf</small><b>{fmt(costSaving)}</b><span>Rota + yakıt + boş dönüş</span></div>
        <div><small>Birleşebilir Sefer</small><b>{Math.min(12, activeRows.length)}</b><span>Aynı bölge önerisi</span></div>
        <div><small>Boş Dönüş Riski</small><b>%18</b><span>AI azaltma hedefi</span></div>
      </div>
      <div className="tower-advice">AI önerisi: Yakın bölge teslimatlarını birleştirerek yakıt ve şoför maliyetini azaltın.</div>
    </section>}

    {mode === "auto" && <section className="tower-section">
      <div className="tower-section-head"><h3>🤖 Autonomous Dispatch Mode</h3><button onClick={()=>setTab("collabpro")}>Collab Pro</button></div>
      <div className="auto-dispatch-list">
        {autoDispatchPlan().map((p,i)=><div key={i}>
          <b>{p.trip.serial} • {p.trip.musteri}</b>
          <span>{p.driver} → {p.vehicle}</span>
          <small>ETA {p.eta}</small>
          <em>{p.saving} tasarruf</em>
          <button>Otomatik ata</button>
        </div>)}
        {!autoDispatchPlan().length && <div className="tower-empty">Atanacak aktif sefer yok.</div>}
      </div>
    </section>}

    {mode === "ceo" && <section className="tower-section">
      <div className="tower-section-head"><h3>👔 Executive CEO Dashboard</h3><button onClick={()=>setTab("reports")}>Raporlar</button></div>
      <div className="ceo-grid">
        <div><b>{fmt(stats.total)}</b><span>Toplam Gelir</span></div>
        <div><b>{fmt(stats.profit)}</b><span>Net Kâr</span></div>
        <div><b>{customers?.[0]?.[0] || "-"}</b><span>En Değerli Müşteri</span></div>
        <div><b>{delayedRows.length}</b><span>Kritik Operasyon</span></div>
      </div>
      <div className="heatmap-demo">{branches.map(b=><span key={b.name} style={{height:40 + b.risk*18, background:b.color}} title={b.name}></span>)}</div>
    </section>}

    {mode === "crisis" && <section className="tower-section">
      <div className="tower-section-head"><h3>🚨 Incident & Crisis Center</h3><button onClick={()=>setTab("notifications")}>Bildirimler</button></div>
      <div className="incident-list">
        {incidents.map((i,idx)=><div key={idx} className={`incident ${normalizeText(i.level)}`}>
          <strong>{i.level}</strong><b>{i.title}</b><span>{i.text}</span><button>{i.action}</button>
        </div>)}
      </div>
    </section>}

    {mode === "api" && <section className="tower-section">
      <div className="tower-section-head"><h3>🧩 API & Integration Marketplace</h3><button onClick={()=>setTab("saas")}>SaaS Merkezi</button></div>
      <div className="marketplace-grid">
        {marketplace.map(([name,desc,status])=><div key={name}>
          <b>{name}</b><span>{desc}</span><em>{status}</em><button>Bağlantı Ayarla</button>
        </div>)}
      </div>
    </section>}
  </main>;
}

function CollaborationSuitePro({ rows = [], users = [], drivers = [], logs = [], notificationItems = [], currentUser, setTab }) {
  const [activeRoom, setActiveRoom] = useState("Operasyon");
  const [message, setMessage] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [callLog, setCallLog] = useState([
    { id:1, name:"Müşteri Araması", phone:"+90 5xx xxx xx xx", result:"Ödeme hatırlatıldı", time:"10:20" },
    { id:2, name:"Şoför Görüşmesi", phone:"+90 5xx xxx xx xx", result:"Teslimat teyidi alındı", time:"11:05" }
  ]);
  const [tasks, setTasks] = useState([
    { id:1, title:"Geciken seferleri kontrol et", priority:"Kritik", owner:"Operasyon", status:"Açık", due:"Bugün" },
    { id:2, title:"Tahsilat hatırlatma gönder", priority:"Yüksek", owner:"Muhasebe", status:"Devam", due:"Bugün" },
    { id:3, title:"Eksik evrakları tamamla", priority:"Orta", owner:"Evrak", status:"Açık", due:"Yarın" }
  ]);
  const [messages, setMessages] = useState([
    { room:"Operasyon", user:"Sistem", text:"Canlı işbirliği merkezi aktif.", time:"09:00" },
    { room:"Operasyon", user:"AI Assistant", text:"Geciken seferler için görev oluşturulması önerilir.", time:"09:15" },
    { room:"Muhasebe", user:"Muhasebe", text:"Borçlu müşteriler listesi güncellendi.", time:"09:42" },
    { room:"Şoförler", user:"Şoför Mobil", text:"GPS ve teslimat durumları senkronize edildi.", time:"10:05" }
  ]);

  const delayed = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const unpaid = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0),0) > 0);
  const activeTrips = rows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received");
  const activeUsers = [currentUser?.name || "Admin", ...users.slice(0,6).map(u=>u.name || u.username).filter(Boolean)].filter((v,i,a)=>v && a.indexOf(v)===i);

  const auditRows = [
    ...logs.slice(-8).reverse().map((l,i)=>({ id:"log"+i, type:"Audit", user:l.user || "Sistem", action:l.action || "İşlem", time:l.time || "—", device:"Web", ip:"192.168.1."+ (20+i) })),
    { id:"a1", type:"Security", user:currentUser?.name || "Admin", action:"Collab Pro görüntülendi", time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}), device:"Chrome", ip:"local" }
  ];

  const liveFeed = [
    ...notificationItems.slice(0,5).map(n=>({ icon:n.icon || "🔔", title:n.title || "Bildirim", text:n.text || "", time:"canlı", tone:n.tone || "blue" })),
    ...delayed.slice(0,4).map(r=>({ icon:"🚨", title:"Gecikme", text:`${r.serial} • ${r.musteri}`, time:`${daysBetween(r.tarih)} gün`, tone:"red" })),
    ...unpaid.slice(0,4).map(r=>({ icon:"₺", title:"Tahsilat", text:`${r.musteri} • ${fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}`, time:"açık", tone:"orange" }))
  ].slice(0,12);

  const rooms = ["Operasyon", "Şoförler", "Muhasebe", "Şube", "Acil Durum"];
  const roomMessages = messages.filter(m => m.room === activeRoom);

  function send(e) {
    e?.preventDefault();
    if(!message.trim()) return;
    setMessages(prev => [...prev, { room:activeRoom, user:currentUser?.name || "Admin", text:message.trim(), time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}) }]);
    setMessage("");
  }

  function addTask(e) {
    e?.preventDefault();
    if(!taskTitle.trim()) return;
    setTasks(prev => [{ id:Date.now(), title:taskTitle.trim(), priority:"Yüksek", owner:currentUser?.name || "Admin", status:"Açık", due:"Bugün" }, ...prev]);
    setTaskTitle("");
  }

  function aiTasks() {
    const next = [];
    if(delayed.length) next.push({ id:Date.now()+1, title:`${delayed.length} geciken sefer için acil takip`, priority:"Kritik", owner:"Operasyon", status:"Açık", due:"Bugün" });
    if(unpaid.length) next.push({ id:Date.now()+2, title:`${unpaid.length} tahsilat için WhatsApp hatırlatma`, priority:"Yüksek", owner:"Muhasebe", status:"Açık", due:"Bugün" });
    next.push({ id:Date.now()+3, title:"Günlük operasyon raporu yönetime gönder", priority:"Orta", owner:"AI", status:"Açık", due:"Bugün" });
    setTasks(prev => [...next, ...prev]);
  }

  function requestPush() {
    if (!("Notification" in window)) return alert("Tarayıcı bildirimleri desteklemiyor.");
    Notification.requestPermission().then(p => {
      if (p === "granted") new Notification("Seyitoğulları", { body:"Realtime Notification Hub aktif." });
      else alert("Bildirim izni verilmedi.");
    });
  }

  return <main className="panel full collab-pro-page">
    <div className="collab-pro-hero">
      <div>
        <span className="section-kicker">Enterprise Collaboration</span>
        <h2>🧬 Real-Time Collaboration & Command Center Pro</h2>
        <p>1-8 tüm modüller: live collaboration, chat, activity feed, tasks, AI team, call center, push hub, audit system.</p>
      </div>
      <div className="collab-pro-state"><span></span> Realtime Ready</div>
    </div>

    <div className="collab-pro-kpis">
      <div><small>Live Kullanıcı</small><b>{activeUsers.length}</b><em>Online ekip</em></div>
      <div><small>Aktif Sefer</small><b>{activeTrips.length}</b><em>Canlı operasyon</em></div>
      <div><small>Kritik Risk</small><b>{delayed.length}</b><em>AI uyarı</em></div>
      <div><small>Görev</small><b>{tasks.length}</b><em>Mission center</em></div>
      <div><small>Audit</small><b>{auditRows.length}</b><em>İşlem kaydı</em></div>
      <div><small>Call Log</small><b>{callLog.length}</b><em>Çağrı merkezi</em></div>
    </div>

    <div className="collab-pro-grid">
      <section className="collab-pro-card chat">
        <div className="collab-pro-head"><h3>💬 Operasyon Chat System</h3><div>{rooms.map(r=><button key={r} className={activeRoom===r?"active":""} onClick={()=>setActiveRoom(r)}>{r}</button>)}</div></div>
        <div className="pro-chat-list">{roomMessages.map((m,i)=><div key={i} className="pro-chat-row"><span>{m.user?.[0] || "S"}</span><div><b>{m.user}</b><p>{m.text}</p><small>{m.time}</small></div></div>)}</div>
        <form className="pro-chat-input" onSubmit={send}><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Mesaj yaz..." /><button>Gönder</button></form>
      </section>

      <aside className="collab-pro-card users">
        <h3>👥 Live Multi-User Collaboration</h3>
        {activeUsers.map((u,i)=><div key={u} className="pro-user-row"><span>{u[0]}</span><div><b>{u}</b><small>{i===0 ? "Bu ekranı düzenliyor" : "Online"}</small></div><em></em></div>)}
        <div className="editing-box">✍️ {activeUsers[0]} şu anda operasyon verilerini görüntülüyor.</div>
      </aside>
    </div>

    <div className="collab-pro-bottom">
      <section className="collab-pro-card task">
        <div className="collab-pro-head"><h3>✅ Task & Mission Center</h3><button onClick={aiTasks}>AI Görevleri Üret</button></div>
        <form className="pro-task-input" onSubmit={addTask}><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="Yeni görev..." /><button>Ekle</button></form>
        <div className="pro-task-list">{tasks.map(t=><div key={t.id} className={`pro-task-row ${normalizeText(t.priority)}`}><div><b>{t.title}</b><small>{t.owner} • {t.due}</small></div><span>{t.priority}</span><em>{t.status}</em></div>)}</div>
      </section>

      <section className="collab-pro-card feed">
        <div className="collab-pro-head"><h3>📡 Live Activity Feed</h3><button onClick={()=>setTab("notifications")}>Bildirimler</button></div>
        <div className="pro-feed-list">{liveFeed.map((f,i)=><div key={i} className={`pro-feed-row ${f.tone}`}><span>{f.icon}</span><div><b>{f.title}</b><small>{f.text}</small></div><em>{f.time}</em></div>)}</div>
      </section>
    </div>

    <div className="collab-pro-three">
      <section className="collab-pro-card call">
        <div className="collab-pro-head"><h3>☎️ Voice & Call Center</h3><button onClick={()=>setCallLog(prev=>[{id:Date.now(),name:"Yeni Arama",phone:"+90",result:"Not bekliyor",time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})},...prev])}>Arama Ekle</button></div>
        {callLog.map(c=><div key={c.id} className="call-row"><b>{c.name}</b><span>{c.phone}</span><small>{c.result}</small><em>{c.time}</em></div>)}
      </section>

      <section className="collab-pro-card push">
        <h3>🔔 Realtime Notification Hub</h3>
        <p>Browser push, popup, sesli uyarı ve mobil bildirim altyapısı.</p>
        <button onClick={requestPush}>Browser Push İzni Al</button>
        <button onClick={()=>alert("Sesli uyarı demo: Ding!")}>Sesli Uyarı Testi</button>
        <button onClick={()=>setTab("notifications")}>Bildirim Merkezi</button>
      </section>

      <section className="collab-pro-card audit">
        <div className="collab-pro-head"><h3>🛡️ Enterprise Audit System</h3><button onClick={()=>setTab("logs")}>Kayıtlar</button></div>
        <div className="audit-list">{auditRows.slice(0,7).map(a=><div key={a.id} className="audit-row"><b>{a.action}</b><span>{a.user}</span><small>{a.device} • {a.ip}</small><em>{a.time}</em></div>)}</div>
      </section>
    </div>

    <section className="ai-team-pro">
      <div><h3>🤖 AI Team Assistant</h3><p>{delayed.length ? `${delayed.length} gecikme riski ve ${unpaid.length} tahsilat riski tespit edildi. AI görev oluşturma önerilir.` : "Operasyon dengeli görünüyor. Günlük rapor ve ekip kontrolü önerilir."}</p></div>
      <div><button onClick={()=>setTab("ai")}>AI Asistan</button><button onClick={()=>setTab("aibrain")}>AI Brain</button><button onClick={aiTasks}>Otomatik Görev</button></div>
    </section>
  </main>;
}

function RealtimeCollaborationCenter({ rows = [], users = [], drivers = [], notificationItems = [], logs = [], currentUser, setTab }) {
  const [room, setRoom] = useState("Operasyon");
  const [chatText, setChatText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [priority, setPriority] = useState("Yüksek");
  const [messages, setMessages] = useState([
    { room:"Operasyon", user:"Sistem", text:"Canlı komuta merkezi başlatıldı.", time:"09:12", tone:"system" },
    { room:"Operasyon", user:"Operasyon", text:"Geciken seferler kontrol ediliyor.", time:"09:25", tone:"info" },
    { room:"Şoförler", user:"Şoför Panel", text:"GPS durumu senkronize edildi.", time:"09:34", tone:"success" }
  ]);
  const [tasks, setTasks] = useState([
    { id:1, title:"Geciken seferleri ara", owner:"Operasyon", due:"Bugün", priority:"Kritik", status:"Açık" },
    { id:2, title:"Borçlu müşterilere hatırlatma gönder", owner:"Muhasebe", due:"Bugün", priority:"Yüksek", status:"Devam" },
    { id:3, title:"Eksik evrakları kontrol et", owner:"Evrak", due:"Yarın", priority:"Orta", status:"Açık" }
  ]);

  const activeUsers = [
    currentUser?.name || "Admin",
    ...users.slice(0,4).map(u=>u.name || u.username).filter(Boolean)
  ].filter((v,i,a)=>v && a.indexOf(v)===i);

  const delayed = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const unpaid = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0),0) > 0);
  const activeTrips = rows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received");

  const liveFeed = [
    ...notificationItems.slice(0,5).map(n=>({ icon:n.icon || "🔔", title:n.title || "Bildirim", text:n.text || "", time:"canlı", tone:n.tone || "blue" })),
    ...logs.slice(-6).reverse().map(l=>({ icon:"🕒", title:l.action || "Kayıt", text:l.user || "Sistem", time:l.time || "", tone:"gray" })),
    ...delayed.slice(0,3).map(r=>({ icon:"🚨", title:"Geciken sefer", text:`${r.serial} • ${r.musteri}`, time:`${daysBetween(r.tarih)} gün`, tone:"red" }))
  ].slice(0,12);

  function sendMessage(e) {
    e?.preventDefault();
    if (!chatText.trim()) return;
    setMessages(prev => [...prev, {
      room,
      user: currentUser?.name || "Admin",
      text: chatText.trim(),
      time: new Date().toLocaleTimeString("tr-TR", {hour:"2-digit", minute:"2-digit"}),
      tone:"user"
    }]);
    setChatText("");
  }

  function addTask(e) {
    e?.preventDefault();
    if (!taskText.trim()) return;
    setTasks(prev => [{
      id: Date.now(),
      title: taskText.trim(),
      owner: currentUser?.role === "driver" ? "Şoför" : "Operasyon",
      due:"Bugün",
      priority,
      status:"Açık"
    }, ...prev]);
    setTaskText("");
  }

  function aiCreateTasks() {
    const created = [];
    if (delayed.length) created.push({ id:Date.now()+1, title:`${delayed.length} geciken sefer için müşteri aranacak`, owner:"Operasyon", due:"Bugün", priority:"Kritik", status:"Açık" });
    if (unpaid.length) created.push({ id:Date.now()+2, title:`${unpaid.length} tahsilat kaydı için WhatsApp hatırlatma`, owner:"Muhasebe", due:"Bugün", priority:"Yüksek", status:"Açık" });
    if (!created.length) created.push({ id:Date.now()+3, title:"Günlük operasyon raporu hazırlanacak", owner:"Yönetim", due:"Bugün", priority:"Orta", status:"Açık" });
    setTasks(prev => [...created, ...prev]);
  }

  const rooms = ["Operasyon", "Şoförler", "Muhasebe", "Şube", "Acil Durum"];
  const roomMessages = messages.filter(m => m.room === room);

  return <main className="panel full collab-page">
    <div className="collab-hero">
      <div>
        <span className="section-kicker">Realtime Collaboration</span>
        <h2>🛰️ Komuta Merkezi & Canlı Ekip Çalışması</h2>
        <p>Operasyon chat, görev merkezi, canlı aktivite akışı, audit sistemi ve AI takım asistanı.</p>
      </div>
      <div className="collab-live"><span></span> Live Team Mode</div>
    </div>

    <div className="collab-kpis">
      <div><small>Aktif Kullanıcı</small><b>{activeUsers.length}</b><span>Canlı oturum</span></div>
      <div><small>Aktif Sefer</small><b>{activeTrips.length}</b><span>Operasyon</span></div>
      <div><small>Kritik Uyarı</small><b>{delayed.length}</b><span>Gecikme riski</span></div>
      <div><small>Görev</small><b>{tasks.length}</b><span>Takım işi</span></div>
      <div><small>Audit Kayıt</small><b>{logs.length}</b><span>İşlem geçmişi</span></div>
    </div>

    <div className="collab-layout">
      <section className="collab-chat">
        <div className="collab-card-head">
          <h3>💬 Operasyon Chat</h3>
          <div className="room-tabs">
            {rooms.map(r=><button key={r} className={room===r?"active":""} onClick={()=>setRoom(r)}>{r}</button>)}
          </div>
        </div>
        <div className="chat-messages">
          {roomMessages.map((m,i)=><div key={i} className={`chat-row ${m.tone}`}>
            <div className="chat-avatar">{m.user?.[0] || "S"}</div>
            <div><b>{m.user}</b><p>{m.text}</p><small>{m.time}</small></div>
          </div>)}
        </div>
        <form className="chat-input" onSubmit={sendMessage}>
          <input value={chatText} onChange={e=>setChatText(e.target.value)} placeholder={`${room} odasına mesaj yaz...`} />
          <button>Gönder</button>
        </form>
      </section>

      <aside className="collab-users">
        <h3>🟢 Canlı Kullanıcılar</h3>
        {activeUsers.map((u,i)=><div key={u} className="user-live-row">
          <span>{u[0]}</span><div><b>{u}</b><small>{i===0 ? "Aktif düzenliyor" : "Online"}</small></div><em></em>
        </div>)}
        <button onClick={()=>setTab("settings")}>Kullanıcıları Yönet</button>
      </aside>
    </div>

    <div className="collab-bottom">
      <section className="task-center">
        <div className="collab-card-head">
          <h3>✅ Task & Mission Center</h3>
          <button onClick={aiCreateTasks}>AI Görev Oluştur</button>
        </div>
        <form className="task-input" onSubmit={addTask}>
          <input value={taskText} onChange={e=>setTaskText(e.target.value)} placeholder="Yeni görev yaz..." />
          <select value={priority} onChange={e=>setPriority(e.target.value)}>
            <option>Kritik</option><option>Yüksek</option><option>Orta</option><option>Düşük</option>
          </select>
          <button>Ekle</button>
        </form>
        <div className="task-list">
          {tasks.map(t=><div key={t.id} className={`task-row ${normalizeText(t.priority)}`}>
            <div><b>{t.title}</b><small>{t.owner} • {t.due}</small></div>
            <span>{t.priority}</span>
            <em>{t.status}</em>
          </div>)}
        </div>
      </section>

      <section className="live-feed">
        <div className="collab-card-head">
          <h3>📡 Live Activity Feed</h3>
          <button onClick={()=>setTab("logs")}>Audit Aç</button>
        </div>
        <div className="feed-list">
          {liveFeed.map((f,i)=><div key={i} className={`feed-row ${f.tone}`}>
            <span>{f.icon}</span><div><b>{f.title}</b><small>{f.text}</small></div><em>{f.time}</em>
          </div>)}
        </div>
      </section>
    </div>

    <section className="collab-ai-panel">
      <div>
        <h3>🤖 AI Team Assistant</h3>
        <p>{delayed.length ? `${delayed.length} geciken sefer tespit edildi. Operasyon ekibine görev oluşturulması önerilir.` : "Operasyon normal görünüyor. Günlük rapor hazırlanabilir."}</p>
      </div>
      <div className="ai-team-actions">
        <button onClick={()=>setTab("ai")}>AI Asistan</button>
        <button onClick={()=>setTab("aibrain")}>AI Brain</button>
        <button onClick={()=>setTab("notifications")}>Bildirim Hub</button>
      </div>
    </section>
  </main>;
}

function AILogisticsBrain({ rows = [], drivers = [], vehicles = [], customers = [], stats = {}, setTab }) {
  const [mode, setMode] = useState("dispatcher");

  const openRows = rows.filter(r => r.tripStatus !== "delivered");
  const unpaidRows = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0);
  const delayedRows = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const availableDrivers = drivers.filter(d => d.status === "available" || d.status === "active" || !d.status);
  const vehiclePool = vehicles.length ? vehicles : rows.map(r => ({ plate:r.plaka, model:r.vehicleType || "Araç" })).filter(v=>v.plate);

  const driverScores = drivers.map(d => {
    const trips = rows.filter(r => r.driver === d.name);
    const revenue = trips.reduce((s,r)=>s+(Number(r.tutar)||0),0);
    const delivered = trips.filter(r=>r.tripStatus==="delivered").length;
    const delays = trips.filter(r=>daysBetween(r.tarih)>=2 && r.tripStatus!=="delivered").length;
    const score = Math.max(10, Math.min(99, Math.round((delivered*12) + (revenue/10000) - (delays*9) + 50)));
    return { ...d, trips:trips.length, revenue, delivered, delays, score };
  }).sort((a,b)=>b.score-a.score);

  const vehicleScores = Object.entries(rows.reduce((a,r)=>{
    const k = r.plaka || "Plaka Yok";
    if(!a[k]) a[k]={plate:k,trips:0,revenue:0,profit:0,cost:0};
    a[k].trips++;
    a[k].revenue += Number(r.tutar)||0;
    a[k].profit += realProfit(r);
    a[k].cost += (Number(r.fuelCost)||0)+(Number(r.otherCost)||0);
    return a;
  },{})).map(([,v])=>({...v, score:Math.max(10,Math.min(99,Math.round(v.profit/10000 + v.trips*4 - v.cost/15000 + 55)))})).sort((a,b)=>b.score-a.score);

  const riskCustomers = customers.map(([name,c]) => ({
    name, trips:c.trips, total:c.total, debt:c.debt, risk: Math.min(99, Math.round((c.debt/Math.max(c.total,1))*100 + (c.debt>0?20:0)))
  })).sort((a,b)=>b.risk-a.risk);

  const monthlyPrediction = Math.round((Number(stats.total)||0) * 1.12 + (openRows.length * 950));
  const profitPrediction = Math.round((Number(stats.profit)||0) * 1.08);

  function bestAssignment(row) {
    const driver = driverScores[0];
    const vehicle = vehicleScores[0];
    const estimatedProfit = Math.max((Number(row?.tutar)||0) - (Number(row?.fuelCost)||0) - (Number(row?.driverCost)||0) - 750, 0);
    return {
      row,
      driver,
      vehicle,
      estimatedProfit,
      eta:"42 dk",
      reason:`${driver?.name || "Uygun şoför"} yüksek skor, düşük gecikme ve iyi teslim oranı nedeniyle önerildi.`
    };
  }

  const recommended = openRows.slice(0,5).map(bestAssignment);

  const automations = [
    { icon:"💬", title:"Borç hatırlatma", text:`${unpaidRows.length} müşteriye WhatsApp hatırlatma önerilir.`, action:"WhatsApp kuyruğu oluştur" },
    { icon:"🚨", title:"Gecikme alarmı", text:`${delayedRows.length} geciken sefer için operasyon uyarısı oluştur.`, action:"Bildirim oluştur" },
    { icon:"🛠️", title:"Bakım tahmini", text:`${vehicleScores.filter(v=>v.score<55).length} araç riskli görünüyor.`, action:"Servis planla" },
    { icon:"📄", title:"Günlük rapor", text:"Günün gelir, borç ve operasyon özetini PDF raporla.", action:"Rapor hazırla" }
  ];

  const insights = [
    { label:"Aylık Gelir Tahmini", value:fmt(monthlyPrediction), tone:"blue" },
    { label:"Kâr Tahmini", value:fmt(profitPrediction), tone:"green" },
    { label:"Riskli Müşteri", value:riskCustomers[0]?.name || "-", tone:"red" },
    { label:"En İyi Şoför", value:driverScores[0]?.name || "-", tone:"purple" },
    { label:"En İyi Araç", value:vehicleScores[0]?.plate || "-", tone:"orange" },
    { label:"Otomasyon Fırsatı", value:automations.length, tone:"blue" }
  ];

  return <main className="panel full ai-brain-page">
    <div className="ai-brain-hero">
      <div>
        <span className="section-kicker">AI Logistics Brain</span>
        <h2>🧠 Merkezi Yapay Zeka Operasyon Beyni</h2>
        <p>Dispatch, rota, finans, bakım, müşteri riski, otomasyon ve tahminleri tek merkezde analiz eder.</p>
      </div>
      <div className="brain-health"><b>AI Engine</b><small>Local Analysis • Cloud Ready</small></div>
    </div>

    <div className="brain-tabs">
      {[["dispatcher","Auto Dispatcher"],["route","Route Optimization"],["finance","Financial Prediction"],["maintenance","Predictive Maintenance"],["automation","Automation Engine"],["analytics","Analytics Center"]].map(([k,l])=>
        <button key={k} className={mode===k?"active":""} onClick={()=>setMode(k)}>{l}</button>
      )}
    </div>

    <div className="brain-insights">
      {insights.map(i=><div key={i.label} className={`brain-insight ${i.tone}`}><small>{i.label}</small><b>{i.value}</b></div>)}
    </div>

    {mode === "dispatcher" && <section className="brain-section">
      <div className="brain-section-head"><h3>🚚 AI Auto Dispatcher</h3><button onClick={()=>setTab("operations")}>Operasyona Git</button></div>
      <div className="assignment-grid">
        {recommended.map((x,i)=><div key={x.row?.id || i} className="assignment-card">
          <div className="assignment-top"><b>{x.row?.serial || "-"}</b><span>{fmt(x.estimatedProfit)} tahmini kâr</span></div>
          <h4>{x.row?.musteri || "Müşteri"} · {x.row?.nereden || "-"} → {x.row?.nereye || "-"}</h4>
          <div className="assignment-choice"><div><small>Önerilen Şoför</small><b>{x.driver?.name || "-"}</b><em>Skor %{x.driver?.score || 0}</em></div><div><small>Önerilen Araç</small><b>{x.vehicle?.plate || "-"}</b><em>Skor %{x.vehicle?.score || 0}</em></div><div><small>ETA</small><b>{x.eta}</b><em>Rota tahmini</em></div></div>
          <p>{x.reason}</p>
          <button>Atama önerisini kaydet</button>
        </div>)}
        {!recommended.length && <div className="brain-empty">Atanacak açık sefer bulunamadı.</div>}
      </div>
    </section>}

    {mode === "route" && <section className="brain-section">
      <div className="brain-section-head"><h3>🗺️ Smart Route Optimization</h3><button onClick={()=>setTab("map")}>Haritayı Aç</button></div>
      <div className="route-optimizer">
        <div className="route-map-ai"><span>A</span><i></i><b>B</b><em>C</em></div>
        <div className="route-suggestions">
          <h4>AI Rota Önerileri</h4>
          <ul>
            <li>Yakın teslimatları gruplayarak yakıt maliyetini azaltın.</li>
            <li>Geciken seferleri öncelikli rotaya alın.</li>
            <li>Boş dönüş yapan araçları yeni göreve atayın.</li>
            <li>Yoğun saatlerde şehir içi operasyonu azaltın.</li>
          </ul>
        </div>
      </div>
    </section>}

    {mode === "finance" && <section className="brain-section">
      <div className="brain-section-head"><h3>💰 AI Financial Predictions</h3><button onClick={()=>setTab("accounting")}>Muhasebeyi Aç</button></div>
      <div className="finance-prediction-grid">
        <div><small>Beklenen Aylık Gelir</small><b>{fmt(monthlyPrediction)}</b><span>+%12 tahmin</span></div>
        <div><small>Beklenen Kâr</small><b>{fmt(profitPrediction)}</b><span>Operasyon trendi</span></div>
        <div><small>Alacak Riski</small><b>{fmt(unpaidRows.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0))}</b><span>{unpaidRows.length} kayıt</span></div>
      </div>
      <div className="brain-warning">AI Notu: Tahsilat gecikmesi azaltılırsa kâr marjı belirgin şekilde artabilir.</div>
    </section>}

    {mode === "maintenance" && <section className="brain-section">
      <div className="brain-section-head"><h3>🛠️ Predictive Maintenance</h3><button onClick={()=>setTab("vehicles")}>Araçları Aç</button></div>
      <div className="vehicle-risk-list">
        {vehicleScores.slice(0,8).map(v=><div key={v.plate}><b>{v.plate}</b><span>{v.trips} sefer</span><em>Skor %{v.score}</em><small>{v.score<55 ? "Servis önerilir" : "Normal"}</small></div>)}
      </div>
    </section>}

    {mode === "automation" && <section className="brain-section">
      <div className="brain-section-head"><h3>⚙️ AI Automation Engine</h3><button onClick={()=>setTab("notifications")}>Bildirimleri Aç</button></div>
      <div className="automation-grid">
        {automations.map(a=><div key={a.title} className="automation-card"><span>{a.icon}</span><b>{a.title}</b><p>{a.text}</p><button>{a.action}</button></div>)}
      </div>
    </section>}

    {mode === "analytics" && <section className="brain-section">
      <div className="brain-section-head"><h3>📊 Full Analytics Center</h3><button onClick={()=>setTab("reports")}>Raporlara Git</button></div>
      <div className="analytics-brain-grid">
        <div><b>{driverScores[0]?.name || "-"}</b><span>En yüksek şoför skoru</span></div>
        <div><b>{vehicleScores[0]?.plate || "-"}</b><span>En iyi araç</span></div>
        <div><b>{riskCustomers[0]?.name || "-"}</b><span>Riskli müşteri</span></div>
        <div><b>{delayedRows.length}</b><span>Operasyon riski</span></div>
      </div>
    </section>}
  </main>;
}

function SaaSManagementCenter({ rows = [], users = [], drivers = [], vehicles = [] }) {
  const [plan, setPlan] = useState("Pro");
  const [brand, setBrand] = useState({
    company:"Seyitoğulları Oto Transfer",
    domain:"app.seyitogullari.com",
    color:"#2563eb",
    currency:"TRY",
    language:"tr"
  });

  const packages = [
    { name:"Starter", price:"₺999/ay", users:"3 kullanıcı", branches:"1 şube", features:["Sefer yönetimi","PDF fatura","WhatsApp"] },
    { name:"Pro", price:"₺2499/ay", users:"15 kullanıcı", branches:"5 şube", features:["CRM","Muhasebe","Bildirim","Şoför mobil"] },
    { name:"Enterprise", price:"Özel", users:"Sınırsız", branches:"Sınırsız", features:["Franchise","Cloud Sync","White Label","API"] }
  ];

  const permissions = [
    ["Sefer Görüntüleme","Admin","Operasyon","Muhasebe","Şube Müdürü"],
    ["Sefer Silme","Super Admin","Admin"],
    ["Finans Erişimi","Super Admin","Admin","Muhasebe"],
    ["Şube Yönetimi","Super Admin","Bölge Müdürü"],
    ["Kullanıcı Yönetimi","Super Admin","Admin"],
    ["PDF / Excel Export","Admin","Muhasebe","Operasyon"],
    ["Cloud Ayarları","Super Admin"],
    ["White Label","Super Admin","Franchise Owner"]
  ];

  const branchKpis = [
    { name:"Reyhanlı", revenue:1240000, profit:325000, users:6, active:18 },
    { name:"İstanbul", revenue:2120000, profit:640000, users:11, active:29 },
    { name:"Gaziantep", revenue:980000, profit:221000, users:4, active:11 },
    { name:"Hatay", revenue:1540000, profit:430000, users:8, active:21 }
  ];

  const totalRevenue = branchKpis.reduce((s,b)=>s+b.revenue,0);
  const totalProfit = branchKpis.reduce((s,b)=>s+b.profit,0);

  return <main className="panel full saas-page">
    <div className="saas-hero">
      <div>
        <span className="section-kicker">SaaS Enterprise Suite</span>
        <h2>🧩 SaaS Yönetim Merkezi</h2>
        <p>Franchise, yetki matrisi, cloud database, white label, abonelik ve global ayarları tek merkezden yönetin.</p>
      </div>
      <div className="saas-health">
        <b>Enterprise Ready</b>
        <small>Cloud • Franchise • White Label</small>
      </div>
    </div>

    <div className="saas-kpi-row">
      <div><small>Toplam Gelir</small><b>{fmt(totalRevenue)}</b><span>Şubeler toplamı</span></div>
      <div><small>Net Kâr</small><b>{fmt(totalProfit)}</b><span>Canlı analiz</span></div>
      <div><small>Kullanıcı</small><b>{users.length}</b><span>Yetki matrisi hazır</span></div>
      <div><small>Araç / Şoför</small><b>{vehicles.length} / {drivers.length}</b><span>Operasyon portföyü</span></div>
    </div>

    <div className="saas-layout">
      <section className="saas-main">
        <div className="saas-section">
          <div className="saas-section-head"><h3>🏢 Franchise Yönetimi</h3><span>Multi Company Ready</span></div>
          <div className="tenant-grid">
            {["Seyitoğulları","Anadolu Transfer","Marmara Lojistik"].map((t,i)=><div className="tenant-card" key={t}>
              <div className="tenant-logo">{t[0]}</div>
              <b>{t}</b>
              <span>{i+1}.tenant.app</span>
              <em>{i===0 ? "Aktif" : "Demo"}</em>
            </div>)}
          </div>
        </div>

        <div className="saas-section">
          <div className="saas-section-head"><h3>📊 Live Branch Dashboard</h3><span>{branchKpis.length} şube</span></div>
          <div className="branch-compare-table">
            {branchKpis.map(b=><div key={b.name} className="branch-compare-row">
              <b>{b.name}</b>
              <span>{fmt(b.revenue)}</span>
              <span>{fmt(b.profit)} kâr</span>
              <small>{b.users} kullanıcı</small>
              <em>{b.active} aktif operasyon</em>
            </div>)}
          </div>
        </div>

        <div className="saas-section">
          <div className="saas-section-head"><h3>🔐 Yetki Matrisi Pro</h3><span>Role Based Access</span></div>
          <div className="permission-matrix">
            {permissions.map((p,i)=><div key={i} className="permission-row">
              <b>{p[0]}</b>
              <div>{p.slice(1).map(r=><span key={r}>{r}</span>)}</div>
            </div>)}
          </div>
        </div>
      </section>

      <aside className="saas-side">
        <div className="saas-side-box cloud">
          <h3>☁️ Enterprise Cloud Database</h3>
          <p>Firestore / Supabase bağlantısına hazır servis mimarisi.</p>
          <ul>
            <li>Realtime Sync</li>
            <li>Cloud Backup</li>
            <li>Multi User Session</li>
            <li>Storage Upload</li>
          </ul>
        </div>

        <div className="saas-side-box">
          <h3>🎨 White Label</h3>
          <label>Firma adı<input value={brand.company} onChange={e=>setBrand({...brand, company:e.target.value})}/></label>
          <label>Domain<input value={brand.domain} onChange={e=>setBrand({...brand, domain:e.target.value})}/></label>
          <label>Renk<input type="color" value={brand.color} onChange={e=>setBrand({...brand, color:e.target.value})}/></label>
        </div>
      </aside>
    </div>

    <section className="saas-packages">
      <div className="saas-section-head"><h3>💳 Subscription System</h3><span>Plan yönetimi</span></div>
      <div className="package-grid">
        {packages.map(p=><button key={p.name} className={plan===p.name ? "active" : ""} onClick={()=>setPlan(p.name)}>
          <h3>{p.name}</h3>
          <b>{p.price}</b>
          <span>{p.users} • {p.branches}</span>
          <ul>{p.features.map(f=><li key={f}>{f}</li>)}</ul>
        </button>)}
      </div>
    </section>

    <section className="global-settings-panel">
      <div className="saas-section-head"><h3>⚙️ Global Settings Center</h3><span>Kurumsal ayarlar</span></div>
      <div className="global-settings-grid">
        <label>Para Birimi<select value={brand.currency} onChange={e=>setBrand({...brand,currency:e.target.value})}><option>TRY</option><option>USD</option><option>EUR</option></select></label>
        <label>Dil<select value={brand.language} onChange={e=>setBrand({...brand,language:e.target.value})}><option value="tr">Türkçe</option><option value="en">English</option><option value="ar">Arabic</option></select></label>
        <label>Fatura Şablonu<select><option>Kurumsal A4</option><option>Minimal</option><option>Premium</option></select></label>
        <label>WhatsApp Sağlayıcı<select><option>wa.me</option><option>WhatsApp Business API</option><option>Twilio</option></select></label>
        <label>SMS Sağlayıcı<select><option>Kapalı</option><option>NetGSM</option><option>Twilio</option></select></label>
        <label>Cloud Provider<select><option>Firebase</option><option>Supabase</option><option>AWS</option></select></label>
      </div>
    </section>
  </main>;
}

function MultiBranchFranchiseCenter({ rows = [], users = [], drivers = [], vehicles = [] }) {
  const [activeBranch, setActiveBranch] = useState("Reyhanlı");
  const branches = [
    { name:"Reyhanlı", color:"#2563eb", manager:"Ahmet Kaya", revenue:1240000, profit:325000, active:18 },
    { name:"İstanbul", color:"#16a34a", manager:"Mehmet Yıldız", revenue:2120000, profit:640000, active:29 },
    { name:"Gaziantep", color:"#f97316", manager:"Mustafa Demir", revenue:980000, profit:221000, active:11 },
    { name:"Hatay", color:"#7c3aed", manager:"Yusuf Çelik", revenue:1540000, profit:430000, active:21 }
  ];

  const roles = [
    ["Super Admin","Tam erişim"],
    ["Bölge Müdürü","Tüm şubeleri yönetir"],
    ["Şube Müdürü","Kendi şubesini yönetir"],
    ["Operasyon","Sefer ve dispatch"],
    ["Muhasebe","Finans ve tahsilat"],
    ["Şoför","Mobil sürücü erişimi"],
    ["Müşteri","Portal erişimi"]
  ];

  const current = branches.find(b=>b.name===activeBranch) || branches[0];

  return <main className="panel full franchise-page">
    <div className="franchise-hero">
      <div>
        <span className="section-kicker">Enterprise SaaS</span>
        <h2>🏢 Multi Branch & Franchise System</h2>
        <p>Çoklu şube yönetimi, franchise altyapısı, rol sistemi ve SaaS merkezi.</p>
      </div>
      <div className="franchise-live">Cloud Enterprise Ready</div>
    </div>

    <div className="franchise-layout">
      <section className="franchise-main">
        <div className="branch-tabs">
          {branches.map(b=><button key={b.name} className={activeBranch===b.name?"active":""} style={{"--branch":b.color}} onClick={()=>setActiveBranch(b.name)}>
            <b>{b.name}</b>
            <small>{fmt(b.revenue)}</small>
          </button>)}
        </div>

        <div className="branch-dashboard">
          <div className="branch-card big">
            <div>
              <small>Şube Geliri</small>
              <b>{fmt(current.revenue)}</b>
            </div>
            <span style={{background:current.color}}></span>
          </div>

          <div className="branch-card">
            <small>Net Kâr</small>
            <b>{fmt(current.profit)}</b>
          </div>

          <div className="branch-card">
            <small>Aktif Operasyon</small>
            <b>{current.active}</b>
          </div>

          <div className="branch-card">
            <small>Şube Müdürü</small>
            <b>{current.manager}</b>
          </div>
        </div>

        <div className="franchise-grid">
          <div className="franchise-board">
            <h3>📊 Live Branch Dashboard</h3>

            <div className="franchise-rows">
              {branches.map(b=><div key={b.name} className="franchise-row">
                <div className="franchise-dot" style={{background:b.color}}></div>
                <strong>{b.name}</strong>
                <span>{fmt(b.revenue)}</span>
                <small>{fmt(b.profit)} kâr</small>
                <em>{b.active} aktif operasyon</em>
              </div>)}
            </div>
          </div>

          <div className="franchise-board">
            <h3>🔐 Yetki & Rol Sistemi</h3>

            <div className="role-list">
              {roles.map(([r,d])=><div key={r} className="role-item">
                <b>{r}</b>
                <span>{d}</span>
              </div>)}
            </div>
          </div>
        </div>

        <div className="saas-center">
          <div className="saas-box">
            <h3>☁️ Enterprise Cloud</h3>
            <p>Firebase / Supabase realtime sync sistemi hazır.</p>
            <ul>
              <li>Realtime Database</li>
              <li>Cloud Backup</li>
              <li>Live Sync</li>
              <li>Offline Cache</li>
            </ul>
          </div>

          <div className="saas-box">
            <h3>🎨 White Label SaaS</h3>
            <p>Her firma için özel görünüm ve alan adı desteği.</p>
            <ul>
              <li>Özel logo</li>
              <li>Özel renkler</li>
              <li>Firma bazlı veriler</li>
              <li>Subdomain sistemi</li>
            </ul>
          </div>

          <div className="saas-box">
            <h3>💳 Subscription System</h3>
            <p>Aylık / yıllık abonelik altyapısı.</p>
            <ul>
              <li>Kullanıcı bazlı</li>
              <li>Paket sistemi</li>
              <li>Aktif lisans</li>
              <li>Faturalandırma</li>
            </ul>
          </div>
        </div>
      </section>

      <aside className="franchise-side">
        <div className="franchise-side-box">
          <small>Toplam Şube</small>
          <b>{branches.length}</b>
        </div>

        <div className="franchise-side-box">
          <small>Toplam Kullanıcı</small>
          <b>{users.length}</b>
        </div>

        <div className="franchise-side-box">
          <small>Şoför</small>
          <b>{drivers.length}</b>
        </div>

        <div className="franchise-side-box">
          <small>Araç</small>
          <b>{vehicles.length}</b>
        </div>

        <div className="franchise-alert">
          🤖 AI Enterprise Notu:
          <p>İstanbul şubesi en yüksek gelir performansına sahip görünüyor.</p>
        </div>
      </aside>
    </div>
  </main>;
}

function DriverMobilePro({ rows = [], drivers = [], setData, addLog, currentUser }) {
  const driverName = currentUser?.role === "driver" ? currentUser?.name : (drivers[0]?.name || "");
  const [selectedDriver, setSelectedDriver] = useState(driverName);
  const [activeTab, setActiveTab] = useState("gorevler");
  const [expense, setExpense] = useState({ type:"Yakıt", amount:"", note:"" });
  const [proof, setProof] = useState({ note:"", signature:"" });

  const myRows = rows.filter(r => !selectedDriver || r.driver === selectedDriver);
  const activeTrips = myRows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received" || r.tripStatus === "pending");
  const deliveredTrips = myRows.filter(r => r.tripStatus === "delivered");
  const todayEarnings = myRows.reduce((s,r)=>s+(Number(r.driverCost)||0),0);
  const totalRevenue = myRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
  const delayed = myRows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const currentTrip = activeTrips[0];

  function setStatus(row, status) {
    if (!row) return;
    setData(prev => prev.map(r => r.id === row.id ? { ...r, tripStatus: status } : r));
    addLog?.(`Şoför mobil durum güncelledi: ${statusLabel(status)}`, row);
  }

  function addExpense(row = currentTrip) {
    if (!row || !expense.amount) return alert("Tutar giriniz.");
    const value = Number(expense.amount) || 0;
    setData(prev => prev.map(r => r.id === row.id ? { ...r, otherCost: (Number(r.otherCost)||0) + value, not: `${r.not || ""} | Şoför masrafı: ${expense.type} ${fmt(value)} ${expense.note}` } : r));
    addLog?.(`Şoför masraf ekledi: ${expense.type} ${fmt(value)}`, row);
    setExpense({ type:"Yakıt", amount:"", note:"" });
    alert("Masraf kaydedildi.");
  }

  function saveProof(row = currentTrip) {
    if (!row) return;
    const note = `Teslim kanıtı: ${proof.note || "-"} İmza: ${proof.signature || "-"}`;
    setData(prev => prev.map(r => r.id === row.id ? { ...r, tripStatus:"delivered", not: `${r.not || ""} | ${note}` } : r));
    addLog?.("Teslim kanıtı kaydedildi", row);
    setProof({ note:"", signature:"" });
    alert("Teslim kanıtı kaydedildi ve sefer teslim edildi.");
  }

  function fakeGps() {
    const lat = (36.2 + Math.random()).toFixed(5);
    const lng = (36.1 + Math.random()).toFixed(5);
    alert(`Canlı konum simülasyonu:\nLat: ${lat}\nLng: ${lng}`);
  }

  return <main className="driver-mobile-pro-page">
    <div className="driver-phone-shell">
      <div className="driver-mobile-hero">
        <div>
          <span>Şoför Uygulaması</span>
          <h2>📲 Mobil Operasyon</h2>
          <p>{selectedDriver || "Şoför"} için canlı görev paneli</p>
        </div>
        <button onClick={fakeGps}>GPS Gönder</button>
      </div>

      <div className="driver-selector">
        <label>Şoför</label>
        <select value={selectedDriver} onChange={e=>setSelectedDriver(e.target.value)}>
          <option value="">Tüm Şoförler</option>
          {drivers.map(d=><option key={d.id || d.name} value={d.name}>{d.name}</option>)}
        </select>
      </div>

      <div className="driver-mobile-kpis">
        <div><b>{activeTrips.length}</b><span>Aktif Görev</span></div>
        <div><b>{deliveredTrips.length}</b><span>Teslim</span></div>
        <div><b>{fmt(todayEarnings)}</b><span>Hakediş</span></div>
        <div><b>{delayed.length}</b><span>Risk</span></div>
      </div>

      <div className="driver-bottom-tabs">
        {[["gorevler","Görevler"],["kanit","Teslimat"],["masraf","Masraf"],["performans","Performans"]].map(([k,l])=><button key={k} className={activeTab===k?"active":""} onClick={()=>setActiveTab(k)}>{l}</button>)}
      </div>

      {activeTab === "gorevler" && <section className="driver-mobile-section">
        <h3>Aktif Görevler</h3>
        {activeTrips.length ? activeTrips.map(r=><div key={r.id} className="driver-task-card">
          <div className="driver-task-top"><b>{r.serial}</b><span>{statusLabel(r.tripStatus)}</span></div>
          <h4>{r.musteri}</h4>
          <p>{r.nereden} → {r.nereye}</p>
          <div className="driver-task-meta"><span>{r.tarih}</span><span>{fmt(r.tutar)}</span></div>
          <div className="driver-task-actions">
            <button onClick={()=>setStatus(r,"received")}>Kabul Et</button>
            <button onClick={()=>setStatus(r,"onRoad")}>Yola Çık</button>
            <button onClick={()=>setStatus(r,"delivered")}>Teslim Et</button>
          </div>
        </div>) : <div className="driver-empty">Aktif görev bulunamadı.</div>}
      </section>}

      {activeTab === "kanit" && <section className="driver-mobile-section">
        <h3>Teslimat Kanıtı</h3>
        <div className="proof-card">
          <div className="proof-drop">📷 Fotoğraf / Evrak Yükleme Alanı<br/><small>Demo mod: gerçek bulut için Cloud Storage bağlanır.</small></div>
          <textarea value={proof.note} onChange={e=>setProof({...proof,note:e.target.value})} placeholder="Teslimat notu..." />
          <input value={proof.signature} onChange={e=>setProof({...proof,signature:e.target.value})} placeholder="Müşteri imzası / ad soyad" />
          <button onClick={()=>saveProof(currentTrip)}>Kanıtı Kaydet ve Teslim Et</button>
        </div>
      </section>}

      {activeTab === "masraf" && <section className="driver-mobile-section">
        <h3>Yakıt ve Masraf</h3>
        <div className="expense-card">
          <select value={expense.type} onChange={e=>setExpense({...expense,type:e.target.value})}>
            <option>Yakıt</option><option>Yol Ücreti</option><option>Yemek</option><option>Servis</option><option>Diğer</option>
          </select>
          <input type="number" value={expense.amount} onChange={e=>setExpense({...expense,amount:e.target.value})} placeholder="Tutar" />
          <input value={expense.note} onChange={e=>setExpense({...expense,note:e.target.value})} placeholder="Açıklama" />
          <button onClick={()=>addExpense(currentTrip)}>Masraf Ekle</button>
        </div>
      </section>}

      {activeTab === "performans" && <section className="driver-mobile-section">
        <h3>Performans</h3>
        <div className="driver-performance-grid">
          <div><b>{myRows.length}</b><span>Toplam Sefer</span></div>
          <div><b>{fmt(totalRevenue)}</b><span>Ciro</span></div>
          <div><b>{fmt(todayEarnings)}</b><span>Hakediş</span></div>
          <div><b>%{Math.min(100, Math.round((deliveredTrips.length/Math.max(myRows.length,1))*100))}</b><span>Teslim Oranı</span></div>
        </div>
        <div className="driver-ai-note">🤖 AI Notu: {delayed.length ? "Gecikme riski var, aktif görevleri önceliklendirin." : "Operasyon performansı dengeli görünüyor."}</div>
      </section>}
    </div>
  </main>;
}

function CustomerPortalCenter({ rows = [], customers = [], whatsapp, printCustomerStatement }) {
  const [selectedCustomer, setSelectedCustomer] = useState(customers?.[0]?.[0] || "");
  const [template, setTemplate] = useState("tracking");
  const customerRows = rows.filter(r => r.musteri === selectedCustomer);
  const customer = customers.find(([name]) => name === selectedCustomer)?.[1] || {};
  const lastTrip = customerRows.slice().sort((a,b)=>dateKey(b.tarih).localeCompare(dateKey(a.tarih)))[0];
  const total = customerRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
  const paid = customerRows.reduce((s,r)=>s+(Number(r.paidAmount)||0),0);
  const debt = customerRows.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0);

  function trackingLink(row = lastTrip) {
    if (!row) return "";
    return `${window.location.origin || "https://seyitogullari.local"}/portal/takip/${encodeURIComponent(`${row.serial}-${row.musteri}`)}`;
  }
  function portalLink() { return `${window.location.origin || "https://seyitogullari.local"}/portal/musteri/${encodeURIComponent(selectedCustomer || "musteri")}`; }
  function messageText(row = lastTrip) {
    const base = `${COMPANY}\nTel: ${PHONE}\n`;
    if (template === "tracking") return `${base}Sayın ${selectedCustomer}, sefer takip bağlantınız:\n${trackingLink(row)}\n\nSefer: ${row?.nereden || "-"} → ${row?.nereye || "-"}\nDurum: ${statusLabel(row?.tripStatus)}`;
    if (template === "payment") return `${base}Sayın ${selectedCustomer}, cari hesabınızda kalan ödeme: ${fmt(debt)}.\nMüşteri portalı: ${portalLink()}\nTeşekkür ederiz.`;
    if (template === "invoice") return `${base}Sayın ${selectedCustomer}, fatura ve sefer bilgileriniz hazırdır.\nMüşteri portalı: ${portalLink()}\nToplam: ${fmt(total)}\nÖdenen: ${fmt(paid)}\nKalan: ${fmt(debt)}`;
    return `${base}Sayın ${selectedCustomer}, sefer bilgilendirmesi:\n${row?.serial || "-"} • ${row?.nereden || "-"} → ${row?.nereye || "-"}\n${portalLink()}`;
  }
  function openWhatsApp(row = lastTrip) {
    const phone = String(row?.phone || customer?.phone || "").replace(/\D/g, "");
    const normalized = phone.startsWith("90") ? phone : phone.startsWith("0") ? "9" + phone : phone ? "90" + phone : "";
    const url = normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(messageText(row))}` : `https://wa.me/?text=${encodeURIComponent(messageText(row))}`;
    window.open(url, "_blank");
  }
  async function copyMsg() {
    try { await navigator.clipboard.writeText(messageText(lastTrip)); alert("Mesaj kopyalandı."); }
    catch { window.prompt("Mesajı kopyalayın:", messageText(lastTrip)); }
  }

  return <main className="panel full customer-portal-page">
    <div className="portal-hero"><div><span className="section-kicker">Müşteri Deneyimi</span><h2>💬 WhatsApp Center & Müşteri Portalı</h2><p>Takip linki, ödeme hatırlatma, fatura bildirimi ve müşteri özel portalını tek yerden yönetin.</p></div><div className="portal-live-pill">Portal Ready</div></div>
    <div className="portal-layout">
      <section className="portal-main">
        <div className="portal-toolbar">
          <label><span>Müşteri</span><select value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}>{customers.map(([name])=><option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>Mesaj Türü</span><select value={template} onChange={e=>setTemplate(e.target.value)}><option value="tracking">Sefer Takip Linki</option><option value="payment">Ödeme Hatırlatma</option><option value="invoice">Fatura Bilgilendirme</option><option value="custom">Genel Bilgilendirme</option></select></label>
          <button onClick={()=>openWhatsApp(lastTrip)}>WhatsApp Aç</button><button onClick={copyMsg}>Mesajı Kopyala</button>
        </div>
        <div className="portal-preview-grid">
          <div className="portal-phone"><div className="portal-phone-top">WhatsApp Önizleme</div><div className="portal-bubble">{messageText(lastTrip)}</div></div>
          <div className="customer-mini-portal">
            <div className="mini-portal-head"><b>{selectedCustomer || "Müşteri"}</b><span>{debt > 0 ? "Ödeme Bekliyor" : "Hesap Temiz"}</span></div>
            <div className="mini-portal-kpis"><div><small>Sefer</small><b>{customerRows.length}</b></div><div><small>Toplam</small><b>{fmt(total)}</b></div><div><small>Ödenen</small><b>{fmt(paid)}</b></div><div><small>Kalan</small><b>{fmt(debt)}</b></div></div>
            <div className="mini-tracking-card"><h3>Canlı Takip</h3><p>{lastTrip ? `${lastTrip.nereden} → ${lastTrip.nereye}` : "Sefer bulunamadı"}</p><div className="mini-route"><span></span><i></i><b></b></div><code>{trackingLink(lastTrip)}</code></div>
            <div className="portal-actions"><button onClick={()=>printCustomerStatement?.(selectedCustomer)}>Cari PDF / Yazdır</button><button onClick={()=>navigator.clipboard?.writeText(portalLink())}>Portal Linkini Kopyala</button></div>
          </div>
        </div>
      </section>
      <aside className="portal-side"><h3>Akıllı Müşteri İçgörüleri</h3><div className={debt > 0 ? "portal-alert red" : "portal-alert green"}>{debt > 0 ? `${fmt(debt)} kalan ödeme var. Otomatik hatırlatma önerilir.` : "Bu müşterinin açık borcu görünmüyor."}</div><div className="portal-side-list"><div><b>Son Sefer</b><span>{lastTrip?.serial || "-"}</span></div><div><b>Son Durum</b><span>{statusLabel(lastTrip?.tripStatus)}</span></div><div><b>Portal Linki</b><small>{portalLink()}</small></div></div><button onClick={()=>openWhatsApp(lastTrip)}>Müşteriye Gönder</button></aside>
    </div>
    <section className="portal-trip-list"><h3>📦 Müşteri Seferleri</h3><div>{customerRows.slice(0,10).map(r=><div key={r.id} className="portal-trip-row"><b>{r.serial}</b><span>{r.tarih}</span><small>{r.nereden} → {r.nereye}</small><em>{statusLabel(r.tripStatus)}</em><strong>{fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}</strong><button onClick={()=>openWhatsApp(r)}>WhatsApp</button></div>)}{!customerRows.length && <div className="portal-empty">Bu müşteri için sefer bulunamadı.</div>}</div></section>
  </main>;
}

function OperationCenterV2({ rows = [], drivers = [], vehicles = [], notificationItems = [], setTab }) {
  const active = rows.filter(r => r.tripStatus === "onRoad" || r.tripStatus === "received");
  const waiting = rows.filter(r => r.tripStatus === "pending");
  const delivered = rows.filter(r => r.tripStatus === "delivered");
  const delayed = rows.filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2);
  const unpaid = rows.filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0);
  const onlineDrivers = drivers.filter(d => d.status === "available" || d.status === "busy").length;
  const totalToday = rows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
  const operationalLoad = Math.min(100, Math.round(((active.length + waiting.length + delayed.length) / Math.max(rows.length,1)) * 100));

  const timeline = [
    ...active.slice(0,4).map(r=>({icon:"🟦", title:"Aktif sefer takipte", text:`${r.serial} • ${r.musteri} • ${r.nereden} → ${r.nereye}`, tone:"blue"})),
    ...delayed.slice(0,4).map(r=>({icon:"🔴", title:"Gecikme riski", text:`${r.serial} • ${daysBetween(r.tarih)} gündür açık`, tone:"red"})),
    ...unpaid.slice(0,4).map(r=>({icon:"₺", title:"Tahsilat bekleniyor", text:`${r.musteri} • ${fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}`, tone:"orange"})),
  ].slice(0,10);

  const lanes = [
    {key:"waiting", title:"Bekleyen İşler", icon:"⏳", rows:waiting, tone:"orange"},
    {key:"active", title:"Yolda / Aktif", icon:"🛣️", rows:active, tone:"blue"},
    {key:"delayed", title:"Acil / Geciken", icon:"🚨", rows:delayed, tone:"red"},
    {key:"delivered", title:"Tamamlanan", icon:"✅", rows:delivered, tone:"green"}
  ];

  const mapPoints = rows.slice(0,8).map((r,i)=>({
    ...r,
    left: 8 + ((i*17)%78),
    top: 12 + ((i*23)%66),
    tone: r.tripStatus === "delivered" ? "green" : delayed.some(d=>d.id===r.id) ? "red" : r.tripStatus === "onRoad" ? "blue" : "orange"
  }));

  function riskText() {
    if (delayed.length > 0) return `${delayed.length} sefer gecikme riski taşıyor. Öncelik listesine alınmalı.`;
    if (unpaid.length > 3) return `${unpaid.length} tahsilat bekleyen kayıt var. Finans takibi önerilir.`;
    return "Operasyon genel durumu dengeli görünüyor.";
  }

  return <main className="panel full ops2-page">
    <div className="ops2-hero">
      <div>
        <span className="section-kicker">Canlı Komuta Ekranı</span>
        <h2>🧭 Canlı Operasyon Merkezi 2.0</h2>
        <p>Sefer, şoför, araç, risk, tahsilat ve canlı operasyon durumunu tek ekranda takip edin.</p>
      </div>
      <div className="ops2-live">
        <span></span> Canlı İzleme
      </div>
    </div>

    <div className="ops2-kpis">
      <div><small>Aktif Sefer</small><b>{active.length}</b><em>Yolda / teslim bekliyor</em></div>
      <div><small>Geciken</small><b>{delayed.length}</b><em>Kritik operasyon</em></div>
      <div><small>Online Şoför</small><b>{onlineDrivers}</b><em>{drivers.length} toplam</em></div>
      <div><small>Günlük Gelir</small><b>{fmt(totalToday)}</b><em>Seçili veri</em></div>
      <div><small>Operasyon Yükü</small><b>%{operationalLoad}</b><em>Canlı yoğunluk</em></div>
    </div>

    <div className="ops2-grid">
      <section className="ops2-map-card">
        <div className="ops2-card-head"><h3>🛰️ Canlı Operasyon Haritası</h3><button onClick={()=>setTab("map")}>Haritayı Aç</button></div>
        <div className="ops2-map">
          <div className="ops2-route r1"></div>
          <div className="ops2-route r2"></div>
          <div className="ops2-route r3"></div>
          {mapPoints.map(p=><button key={p.id} className={`ops2-map-pin ${p.tone}`} style={{left:p.left+"%", top:p.top+"%"}} title={`${p.serial} ${p.musteri}`}>
            <span>🚗</span><b>{p.plaka || "Araç"}</b>
          </button>)}
        </div>
      </section>

      <aside className="ops2-ai-risk">
        <h3>🤖 AI Risk Engine</h3>
        <div className={delayed.length ? "risk-red" : "risk-green"}>{riskText()}</div>
        <ul>
          <li>{unpaid.length} tahsilat takibi</li>
          <li>{notificationItems.length} aktif bildirim</li>
          <li>{vehicles.length} araç portföyü</li>
          <li>{drivers.length} şoför kaydı</li>
        </ul>
        <button onClick={()=>setTab("ai")}>AI Asistan ile analiz et</button>
      </aside>
    </div>

    <section className="ops2-dispatch">
      <div className="ops2-card-head"><h3>📌 Live Dispatch Board</h3><button onClick={()=>setTab("seferler")}>Seferlere Git</button></div>
      <div className="ops2-lanes">
        {lanes.map(lane=><div key={lane.key} className={`ops2-lane ${lane.tone}`}>
          <h4>{lane.icon} {lane.title} <span>{lane.rows.length}</span></h4>
          <div className="ops2-lane-list">
            {lane.rows.slice(0,5).map(r=><div key={r.id} className="ops2-trip-card">
              <div><b>{r.serial}</b><span>{r.musteri}</span></div>
              <p>{r.nereden} → {r.nereye}</p>
              <footer><em>{r.driver || "Şoför yok"}</em><strong>{fmt(r.tutar)}</strong></footer>
            </div>)}
            {!lane.rows.length && <div className="ops2-empty">Kayıt yok</div>}
          </div>
        </div>)}
      </div>
    </section>

    <div className="ops2-bottom">
      <section className="ops2-timeline">
        <h3>🕒 Operasyon Timeline</h3>
        {timeline.length ? timeline.map((t,i)=><div key={i} className={`ops2-time-row ${t.tone}`}>
          <span>{t.icon}</span><div><b>{t.title}</b><small>{t.text}</small></div><em>şimdi</em>
        </div>) : <div className="ops2-empty">Canlı olay bulunamadı</div>}
      </section>

      <section className="ops2-command">
        <h3>⚡ Hızlı Komutlar</h3>
        <div>
          <button onClick={()=>setTab("seferler")}>Yeni Sefer</button>
          <button onClick={()=>setTab("notifications")}>Bildirimler</button>
          <button onClick={()=>setTab("accounting")}>Tahsilat</button>
          <button onClick={()=>setTab("documents")}>Evraklar</button>
          <button onClick={()=>setTab("driverpanel")}>Şoför Panel</button>
          <button onClick={()=>setTab("reports")}>Raporlar</button>
        </div>
      </section>
    </div>
  </main>;
}

function AiAssistantPage({ rows, customers, stats }) {
  const [question, setQuestion] = useState("Bugünün operasyon özetini hazırla");
  const [history, setHistory] = useState([
    { role:"assistant", text:"Merhaba. Ben AI Operasyon Asistanı. Sefer, müşteri, ödeme, şoför, fatura ve rapor konularında analiz hazırlayabilirim." }
  ]);
  const [lastReport, setLastReport] = useState(null);

  const debtors = rows
    .filter(r => Math.max((Number(r.tutar)||0) - (Number(r.paidAmount)||0), 0) > 0)
    .sort((a,b)=>Math.max((Number(b.tutar)||0)-(Number(b.paidAmount)||0),0)-Math.max((Number(a.tutar)||0)-(Number(a.paidAmount)||0),0));

  const delayed = rows
    .filter(r => r.tripStatus !== "delivered" && daysBetween(r.tarih) >= 2)
    .sort((a,b)=>daysBetween(b.tarih)-daysBetween(a.tarih));

  const driverStats = Object.entries(rows.reduce((a,r)=>{
    const k=r.driver||"Şoför Yok";
    if(!a[k]) a[k]={trips:0,total:0,paid:0,debt:0,profit:0};
    const total=Number(r.tutar)||0, paid=Number(r.paidAmount)||0;
    a[k].trips++; a[k].total+=total; a[k].paid+=paid; a[k].debt+=Math.max(total-paid,0); a[k].profit+=realProfit(r);
    return a;
  },{})).sort((a,b)=>b[1].profit-a[1].profit);

  const vehicleStats = Object.entries(rows.reduce((a,r)=>{
    const k=r.plaka||"Plaka Yok";
    if(!a[k]) a[k]={trips:0,total:0,profit:0};
    a[k].trips++; a[k].total+=(Number(r.tutar)||0); a[k].profit+=realProfit(r);
    return a;
  },{})).sort((a,b)=>b[1].profit-a[1].profit);

  function makeReport(kind, sourceRows = rows) {
    const total = sourceRows.reduce((s,r)=>s+(Number(r.tutar)||0),0);
    const paid = sourceRows.reduce((s,r)=>s+(Number(r.paidAmount)||0),0);
    const debt = sourceRows.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0);
    const profit = sourceRows.reduce((s,r)=>s+realProfit(r),0);
    return {
      kind,
      title: kind,
      date: new Date().toLocaleString("tr-TR"),
      summary: [
        `Toplam sefer: ${sourceRows.length}`,
        `Toplam gelir: ${fmt(total)}`,
        `Tahsilat: ${fmt(paid)}`,
        `Alacak: ${fmt(debt)}`,
        `Net kâr: ${fmt(profit)}`
      ],
      rows: sourceRows.slice(0, 12),
      recommendations: [
        debt > 0 ? "Ödemesi eksik müşteriler için otomatik WhatsApp hatırlatma gönderin." : "Tahsilat durumu sağlıklı görünüyor.",
        delayed.length ? "Geciken seferleri operasyon ekranında öncelikli takip edin." : "Gecikme riski düşük.",
        driverStats[0] ? `En yüksek performanslı şoför: ${driverStats[0][0]}.` : "Şoför verisi bulunamadı.",
        vehicleStats[0] ? `En çok kazandıran araç: ${vehicleStats[0][0]}.` : "Araç verisi bulunamadı."
      ]
    };
  }

  function answerFor(input) {
    const q = normalizeText(input);
    if (!q) return { title:"Komut bekleniyor", text:"Bir analiz isteği yazın veya hazır komutlardan birini seçin.", rows:[], actions:[] };

    if (q.includes("fatura") || q.includes("invoice")) {
      const target = rows.find(r => q.includes(normalizeText(r.serial)) || q.includes(normalizeText(r.musteri))) || rows[0];
      return {
        title:"Fatura Asistanı",
        text: target ? `${target.serial} numaralı ${target.musteri} kaydı için fatura hazırlanabilir. Tutar: ${fmt(target.tutar)}, kalan: ${fmt(Math.max((Number(target.tutar)||0)-(Number(target.paidAmount)||0),0))}.` : "Fatura oluşturmak için uygun sefer bulunamadı.",
        rows: target ? [target] : [],
        actions: target ? [{label:"Sefer bilgisini getir", run:()=>setQuestion(target.serial)}] : []
      };
    }

    if (q.includes("rapor") || q.includes("report") || q.includes("ozet") || q.includes("özet")) {
      const report = makeReport("AI Operasyon Raporu", rows);
      setLastReport(report);
      return {
        title:"AI Operasyon Raporu",
        text: `${report.summary.join(" • ")}. Öneriler: ${report.recommendations.join(" ")}`,
        rows: report.rows,
        report,
        actions:[{label:"Raporu kopyala", run:()=>navigator.clipboard?.writeText(report.summary.concat(report.recommendations).join("\n"))}]
      };
    }

    if (q.includes("borc") || q.includes("borç") || q.includes("alacak") || q.includes("odeme") || q.includes("ödeme")) {
      const totalDebt = debtors.reduce((s,r)=>s+Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0),0);
      return {
        title:"Borç ve Tahsilat Analizi",
        text:`${debtors.length} adet alacak kaydı var. Toplam alacak ${fmt(totalDebt)}. En yüksek borç: ${debtors[0]?.musteri || "-"} ${debtors[0] ? fmt(Math.max((Number(debtors[0].tutar)||0)-(Number(debtors[0].paidAmount)||0),0)) : ""}.`,
        rows:debtors.slice(0,10),
        actions:[{label:"Tahsilat listesi oluştur", run:()=>setLastReport(makeReport("Tahsilat Raporu", debtors))}]
      };
    }

    if (q.includes("gec") || q.includes("geç") || q.includes("delay") || q.includes("risk")) {
      return {
        title:"Gecikme ve Risk Analizi",
        text:`${delayed.length} geciken veya riskli sefer bulundu. Öncelik: ${delayed[0]?.serial || "-"} ${delayed[0]?.musteri || ""}.`,
        rows:delayed.slice(0,10),
        actions:[{label:"Risk raporu hazırla", run:()=>setLastReport(makeReport("Gecikme Risk Raporu", delayed))}]
      };
    }

    if (q.includes("sofor") || q.includes("şoför") || q.includes("surucu") || q.includes("sürücü") || q.includes("driver")) {
      return {
        title:"Şoför Performans Analizi",
        text:`En yüksek kâr sağlayan şoför ${driverStats[0]?.[0] || "-"}. Toplam ${driverStats.length} şoför analiz edildi.`,
        driverStats,
        actions:[{label:"Şoför performans raporu", run:()=>setLastReport(makeReport("Şoför Performans Raporu", rows))}]
      };
    }

    if (q.includes("musteri") || q.includes("müşteri") || q.includes("vip") || q.includes("en iyi")) {
      return {
        title:"Müşteri CRM Analizi",
        text:`En değerli müşteri: ${customers?.[0]?.[0] || "-"}. Toplam ${customers.length} müşteri analiz edildi.`,
        customerStats: customers.slice(0,10),
        actions:[{label:"Müşteri raporu hazırla", run:()=>setLastReport(makeReport("Müşteri CRM Raporu", rows))}]
      };
    }

    if (q.includes("arac") || q.includes("araç") || q.includes("plaka") || q.includes("vehicle")) {
      return {
        title:"Araç Performans Analizi",
        text:`En çok kazandıran araç ${vehicleStats[0]?.[0] || "-"}. Toplam ${vehicleStats.length} araç analiz edildi.`,
        vehicleStats,
        actions:[{label:"Araç raporu hazırla", run:()=>setLastReport(makeReport("Araç Performans Raporu", rows))}]
      };
    }

    return {
      title:"Genel Akıllı Analiz",
      text:`Sistemde ${rows.length} sefer var. Toplam gelir ${fmt(stats.total)}, tahsilat ${fmt(stats.paidTotal)}, alacak ${fmt(stats.debt)}, net kâr ${fmt(stats.profit)}. ${debtors.length} alacak, ${delayed.length} gecikme riski tespit edildi.`,
      rows:rows.slice(0,8),
      actions:[{label:"Genel rapor hazırla", run:()=>setLastReport(makeReport("Genel AI Raporu", rows))}]
    };
  }

  function ask(text = question) {
    const result = answerFor(text);
    setHistory(prev => [...prev, {role:"user", text}, {role:"assistant", text:result.text, title:result.title, result}]);
  }

  const quick = [
    "Bugünün operasyon raporunu hazırla",
    "Borçlu müşterileri analiz et",
    "Geciken seferleri göster",
    "Şoför performansını analiz et",
    "En iyi müşterileri bul",
    "Araç kârlılık raporu",
    "Fatura için son seferi hazırla",
    "Riskleri ve önerileri söyle"
  ];

  return <main className="panel full ai-pro-page">
    <div className="ai-pro-hero">
      <div><span className="section-kicker">Enterprise AI</span><h2>🤖 AI Operasyon Asistanı Pro</h2><p>Rapor, fatura, tahsilat, risk, müşteri, şoför ve araç analizlerini yerel verilerle hazırlar.</p></div>
      <span className="ai-pro-pill">Offline Analiz • Cloud Ready</span>
    </div>

    <div className="ai-pro-layout">
      <section className="ai-pro-chat">
        <div className="ai-pro-messages">
          {history.slice(-8).map((m,i)=><div key={i} className={`ai-message ${m.role}`}>
            {m.title && <b>{m.title}</b>}
            <span>{m.text}</span>
            {m.result?.rows?.length > 0 && <div className="ai-mini-table">{m.result.rows.slice(0,5).map(r=><div key={r.id||r.serial}><b>{r.serial}</b><span>{r.musteri}</span><small>{r.nereden} → {r.nereye}</small><em>{fmt(Math.max((Number(r.tutar)||0)-(Number(r.paidAmount)||0),0))}</em></div>)}</div>}
            {m.result?.driverStats && <div className="ai-mini-table">{m.result.driverStats.slice(0,5).map(([n,v])=><div key={n}><b>{n}</b><span>{v.trips} sefer</span><small>Kâr</small><em>{fmt(v.profit)}</em></div>)}</div>}
            {m.result?.customerStats && <div className="ai-mini-table">{m.result.customerStats.slice(0,5).map(([n,c])=><div key={n}><b>{n}</b><span>{c.trips} sefer</span><small>Alacak</small><em>{fmt(c.debt)}</em></div>)}</div>}
            {m.result?.actions?.length > 0 && <div className="ai-message-actions">{m.result.actions.map(a=><button key={a.label} onClick={a.run}>{a.label}</button>)}</div>}
          </div>)}
        </div>

        <form className="ai-pro-input" onSubmit={e=>{e.preventDefault(); ask();}}>
          <textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ne yapmak istiyorsunuz? Örn: 'Bu haftanın tahsilat raporunu hazırla', 'İbrahim için fatura hazırla', 'geciken seferleri analiz et'..." />
          <button type="submit">Analiz Et</button>
        </form>

        <div className="ai-pro-quick">{quick.map(q=><button key={q} onClick={()=>{setQuestion(q); ask(q);}}>{q}</button>)}</div>
      </section>

      <aside className="ai-pro-side">
        <div><b>{rows.length}</b><span>Toplam Sefer</span></div>
        <div><b>{fmt(stats.total)}</b><span>Toplam Gelir</span></div>
        <div><b>{fmt(stats.debt)}</b><span>Alacak</span></div>
        <div><b>{delayed.length}</b><span>Riskli Sefer</span></div>
        {lastReport && <div className="ai-report-box"><h3>{lastReport.title}</h3>{lastReport.summary.map(x=><p key={x}>{x}</p>)}<button onClick={()=>navigator.clipboard?.writeText(lastReport.summary.concat(lastReport.recommendations).join("\n"))}>Raporu Kopyala</button></div>}
      </aside>
    </div>
  </main>;
}


function CloudFirebasePage() {
  const [cfg, setCfg] = useState(() => { try { return JSON.parse(localStorage.getItem("seyitogullari_firebase_demo") || "{}"); } catch { return {}; } });
  function save() { localStorage.setItem("seyitogullari_firebase_demo", JSON.stringify(cfg)); alert("Firebase ayar taslağı kaydedildi. Gerçek bağlantı için Firebase SDK kurulumu gerekir."); }
  return <main className="panel full cloud-page">
    <div className="topline"><h2>☁️ Firebase / Cloud Hazırlık</h2><span className="badge partial">Demo bağlantı paneli</span></div>
    <div className="settings-grid">
      <div className="inner"><h3>Bulut özellikleri</h3><p>Bu panel gerçek Firebase anahtarlarını saklamak ve projeyi online veritabanına taşımak için hazırlandı.</p><ul><li>Çoklu kullanıcı</li><li>Canlı senkronizasyon</li><li>Gerçek yedekleme</li><li>Güvenli giriş</li></ul></div>
      <div className="inner cloud-form">
        {['apiKey','authDomain','projectId','storageBucket','appId'].map(k=><label key={k} className="field"><span>{k}</span><input value={cfg[k]||''} onChange={e=>setCfg({...cfg,[k]:e.target.value})} placeholder={k}/></label>)}
        <Button onClick={save}>Firebase Ayarlarını Kaydet</Button>
      </div>
    </div>
  </main>;
}

function PwaPage() {
  return <main className="panel full pwa-page">
    <div className="topline"><h2>📱 PWA / Telefon Uygulaması</h2><span className="badge paid">Hazır dosyalar eklendi</span></div>
    <div className="settings-grid">
      <div className="inner"><h3>Nasıl kullanılır?</h3><p>ZIP içinde <b>manifest.json</b> ve <b>service-worker.js</b> dosyaları var. Bunları <b>public</b> klasörüne koyun.</p><p>Sonra index.html içine manifest linkini ekleyin.</p></div>
      <div className="inner"><h3>Kazanımlar</h3><ul><li>Telefona uygulama gibi kurulum</li><li>Hızlı açılış</li><li>Temel offline cache</li><li>Şirket adı ve tema rengi</li></ul></div>
    </div>
  </main>;
}


function SplashScreen({ company }) {
  return <div className="splash-screen"><div className="splash-card"><div className="splash-logo">🚗</div><h1>{company}</h1><p>Profesyonel oto transfer sistemi yükleniyor...</p><div className="splash-bar"><span /></div></div></div>;
}

function FloatingTabs({ tabs, onClose }) {
  if (!tabs?.length) return null;
  return <div className="floating-tabs">{tabs.map(t=><div className="floating-tab" key={t.id}><b>{t.title}</b><button onClick={()=>onClose(t.id)}>×</button></div>)}</div>;
}

function ProToolsPage({ themeName, setThemeName, brandAssets, setBrandAssets, backup, openWorkTab }) {
  const upload = (key, file) => { if (!file) return; const reader = new FileReader(); reader.onload = () => setBrandAssets(prev => ({...prev, [key]: reader.result})); reader.readAsDataURL(file); };
  const exportLocalPdfNote = () => alert("PDF motoru eklendi. Gerçek PDF için npm install jspdf html2canvas komutunu çalıştırın; sistem güvenli şekilde hazırlandı.");
  return <main className="panel full pro-tools-page">
    <div className="topline"><h2>🧩 Profesyonel Araçlar</h2><span className="badge paid">V6 Ultimate</span></div>
    <div className="settings-grid">
      <div className="inner"><h3>🏷️ Logo / Kaşe / İmza</h3><p>Fatura ve raporlara gerçek şirket kimliği eklemek için hazır alanlar.</p><label className="field"><span>Logo PNG</span><input type="file" accept="image/*" onChange={e=>upload('logo', e.target.files?.[0])}/></label><label className="field"><span>Kaşe PNG</span><input type="file" accept="image/*" onChange={e=>upload('stamp', e.target.files?.[0])}/></label><label className="field"><span>İmza PNG</span><input type="file" accept="image/*" onChange={e=>upload('signature', e.target.files?.[0])}/></label><div className="brand-preview">{brandAssets.logo && <img src={brandAssets.logo} alt="logo"/>}{brandAssets.stamp && <img src={brandAssets.stamp} alt="stamp"/>}{brandAssets.signature && <img src={brandAssets.signature} alt="signature"/>}</div></div>
      <div className="inner"><h3>🎨 Kurumsal Tema</h3><p>Blue Corporate / Gold Executive / Dark Professional.</p><select className="control" value={themeName} onChange={e=>setThemeName(e.target.value)}><option value="corporate">Blue Corporate</option><option value="gold">Gold Executive</option><option value="darkpro">Dark Professional</option></select><div className="theme-swatches"><span className="sw blue"/><span className="sw gold"/><span className="sw dark"/></div></div>
      <div className="inner"><h3>⚡ Kısayollar</h3><p><b>Ctrl+N</b> yeni sefer, <b>Ctrl+F</b> arama, <b>Ctrl+P</b> hızlı rapor.</p><Button onClick={()=>openWorkTab('invoice','Yeni Fatura Sekmesi')}>Sekme Demo Aç</Button></div>
      <div className="inner"><h3>☁️ Akıllı Yedek</h3><p>Yerel otomatik yedek aktif. Bulut yedek için Firebase/Google Drive bağlantısı hazırlanmış durumda.</p><Button onClick={backup}>JSON Yedek İndir</Button></div>
      <div className="inner"><h3>📄 PDF Motoru</h3><p>V7 Phase 3 PDF motoru hazır. jsPDF/html2canvas kurulunca gerçek PDF dışa aktarımına bağlanabilir.</p><Button onClick={exportLocalPdfNote}>PDF Notu</Button></div>
      <div className="inner"><h3>🧠 AI Komutları</h3><p>AI sayfasında yerel veri analizi hazır: borçlular, şoför kârı, müşteri analizi, gelir/kâr.</p><Button onClick={()=>alert('AI Asistan sayfasına gidip örnek komutları kullanabilirsiniz.')}>AI Bilgi</Button></div>
    </div>
  </main>;
}

function ExpensesPage({ rows, stats, printReport }) { return <main className="panel full"><div className="topline"><h2>⛽ Giderler</h2><Button onClick={()=>printReport('Gider Raporu', rows)}>📄 Gider Raporu</Button></div><section className="cards small"><div className="stat"><span>Yakıt</span><b>{fmt(rows.reduce((s,r)=>s+(r.fuelCost||0),0))}</b></div><div className="stat"><span>Şoför</span><b>{fmt(rows.reduce((s,r)=>s+(r.driverCost||0),0))}</b></div><div className="stat"><span>Yol</span><b>{fmt(rows.reduce((s,r)=>s+(r.tollCost||0),0))}</b></div><div className="stat"><span>Toplam Gider</span><b>{fmt(stats.gider)}</b></div></section><TripTable rows={rows} compact stats={stats} /></main>; }
function ArchivePage({ rows, printReport }) { const grouped = rows.reduce((a,r)=>{ const k=monthKey(r.tarih)||"Tarihsiz"; (a[k] ||= []).push(r); return a; },{}); return <main className="panel full"><h2>🗂️ Aylık Arşiv</h2><div className="archive-grid">{Object.entries(grouped).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,list])=>{ const s = list.reduce((sum,r)=>sum+r.tutar,0); return <div className="archive-card" key={m}><h3>{m}</h3><b>{list.length} sefer</b><p>{fmt(s)}</p><Button onClick={()=>printReport(`${m} Aylık Rapor`, list)}>📄 Rapor Al</Button></div>})}</div></main>; }
function ReportsPage(props) { const {filtered,stats,printReport,reportPdf}=props; return <main className="panel full"><h2>📄 Raporlar</h2><Filters {...props}/><section className="cards small"><div className="stat"><span>Toplam Gelir</span><b>{fmt(stats.total)}</b></div><div className="stat"><span>Tahsilat</span><b>{fmt(stats.paidTotal)}</b></div><div className="stat"><span>Alacaklar</span><b>{fmt(stats.debt)}</b></div><div className="stat"><span>Gerçek Kâr</span><b>{fmt(stats.profit)}</b></div></section><div className="report-buttons"><Button onClick={()=>printReport("Seçili Filtre Raporu")}>📄 Seçili Filtre Raporu</Button>{reportPdf && <Button onClick={()=>reportPdf("Seçili Filtre Raporu", filtered)}>⬇️ PDF İndir</Button>}<Button onClick={()=>printReport("Aylık Rapor", filtered)}>📆 Aylık Rapor</Button>{props.exportExcel && <Button onClick={()=>props.exportExcel("Raporlar", filtered)}>📊 Excel İndir</Button>}{props.bulkPaymentReminder && <Button onClick={()=>props.bulkPaymentReminder(filtered)}>💬 Toplu Hatırlat</Button>}</div><TripTable rows={filtered} compact stats={stats}/></main>; }
function LogsPage({ logs }) { return <main className="panel full"><h2>🕒 İşlem Geçmişi</h2><div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Detay</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{l.date}</td><td>{l.user}</td><td>{l.action}</td><td>{l.detail}</td></tr>)}</tbody></table></div></main>; }


function BulkReminderModal({ data, onClose, onSend }) {
  const targets = data?.targets || [];
  const missing = data?.missing || [];
  return <div className="bulk-modal-backdrop" onMouseDown={onClose}>
    <div className="bulk-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="bulk-modal-head">
        <div>
          <h2>💬 Toplu Ödeme Hatırlatma</h2>
          <p>{targets.length} müşteriye WhatsApp mesajı hazır. Tarayıcı engellemesin diye tek tek gönderin.</p>
        </div>
        <button className="bulk-close" onClick={onClose}>×</button>
      </div>
      <div className="bulk-summary">
        <span>Gönderilebilir: <b>{targets.length}</b></span>
        <span>Telefon eksik: <b>{missing.length}</b></span>
      </div>
      <div className="bulk-list">
        {targets.map(row => {
          const debt = Math.max((Number(row.tutar)||0) - (Number(row.paidAmount)||0), 0);
          return <div className="bulk-row" key={row.id}>
            <div>
              <b>{row.musteri}</b>
              <span>{row.phone} • {row.serial} • {row.nereden} → {row.nereye}</span>
            </div>
            <strong>{fmt(debt)}</strong>
            <Button onClick={()=>onSend(row)}>WhatsApp Aç</Button>
          </div>;
        })}
      </div>
      {missing.length > 0 && <details className="bulk-missing">
        <summary>Telefon numarası olmayan kayıtlar ({missing.length})</summary>
        {missing.map(row => <div key={row.id}>{row.musteri} — {row.serial} — {fmt(Math.max((Number(row.tutar)||0)-(Number(row.paidAmount)||0),0))}</div>)}
      </details>}
    </div>
  </div>;
}

function ConfirmModal({
  icon = "⚠️",
  title,
  message,
  details,
  confirmText = "Onayla",
  cancelText = "Vazgeç",
  danger = false,
  onConfirm,
  onCancel
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15,23,42,.58)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }}
      onMouseDown={onCancel}
    >
      <div
        style={{
          width: "min(440px, 94vw)",
          background: "#ffffff",
          borderRadius: 26,
          border: "1px solid #e2e8f0",
          boxShadow: "0 28px 80px rgba(15,23,42,.32)",
          overflow: "hidden"
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          style={{
            padding: "24px 26px 18px",
            background: danger
              ? "linear-gradient(135deg,#fff7ed,#fee2e2)"
              : "linear-gradient(135deg,#eff6ff,#f8fafc)",
            borderBottom: "1px solid #e2e8f0"
          }}
        >
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              background: danger ? "#ef4444" : "#1f6fae",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              boxShadow: danger
                ? "0 14px 30px rgba(239,68,68,.28)"
                : "0 14px 30px rgba(31,111,174,.25)",
              marginBottom: 16
            }}
          >
            {icon}
          </div>

          <h3
            style={{
              margin: 0,
              color: "#0f172a",
              fontSize: 23,
              fontWeight: 1000,
              letterSpacing: "-.3px"
            }}
          >
            {title}
          </h3>

          <p
            style={{
              margin: "10px 0 0",
              color: "#475569",
              fontSize: 15,
              fontWeight: 800,
              lineHeight: 1.6
            }}
          >
            {message}
          </p>

          {details && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 14,
                background: "rgba(255,255,255,.75)",
                border: "1px solid #e2e8f0",
                color: "#173c60",
                fontSize: 13,
                fontWeight: 900
              }}
            >
              {details}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 18,
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            background: "#fff"
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#173c60",
              borderRadius: 14,
              padding: "12px 18px",
              fontWeight: 1000,
              cursor: "pointer"
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              border: "none",
              background: danger ? "#ef4444" : "#ff7a1a",
              color: "#fff",
              borderRadius: 14,
              padding: "12px 20px",
              fontWeight: 1000,
              cursor: "pointer",
              boxShadow: danger
                ? "0 12px 26px rgba(239,68,68,.25)"
                : "0 12px 26px rgba(255,122,26,.25)"
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ backup, importBackup, users, setUsers, currentUser, setCurrentUser }) {
  const savedCompanySettings = getCompanySettings();
  const [companyForm, setCompanyForm] = useState(savedCompanySettings);
  const emptyUserForm = {
    username: "",
    password: "",
    name: "",
    role: "staff",
    active: true,
    permissions: { edit: true, delete: false, reports: false, settings: false }
  };

  const [showUser, setShowUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [u, setU] = useState(emptyUserForm);

  const isAdmin = currentUser?.role === "admin";

  const permissionLabels = {
    edit: "Düzenleme",
    delete: "Silme",
    reports: "Raporlar",
    settings: "Ayarlar"
  };

  function roleLabel(role) {
    if (role === "admin") return "Yönetici";
    if (role === "staff") return "Personel";
    return "Şoför";
  }

  function defaultPermissions(role) {
    if (role === "admin") return { edit: true, delete: true, reports: true, settings: true };
    if (role === "staff") return { edit: true, delete: false, reports: true, settings: false };
    return { edit: false, delete: false, reports: false, settings: false };
  }

  function resetUserForm() {
    setU(emptyUserForm);
    setEditingUserId(null);
    setShowUser(false);
  }

  function openAddUser() {
    setU(emptyUserForm);
    setEditingUserId(null);
    setShowUser(true);
  }

  function editUser(user) {
    if (!isAdmin) return alert("Bu işlem için yönetici yetkisi gerekiyor.");
    setEditingUserId(user.id);
    setU({
      username: user.username || "",
      password: user.password || "",
      name: user.name || "",
      role: user.role || "staff",
      active: user.active !== false,
      permissions: { ...defaultPermissions(user.role || "staff"), ...(user.permissions || {}) }
    });
    setShowUser(true);
  }

  function saveUser() {
    if (!isAdmin) return alert("Bu işlem için yönetici yetkisi gerekiyor.");
    if (!u.username || !u.password || !u.name) return alert("Ad, kullanıcı adı ve şifre gerekli.");

    const exists = users.some(x =>
      x.username.toLowerCase() === u.username.toLowerCase() && x.id !== editingUserId
    );
    if (exists) return alert("Bu kullanıcı adı zaten var.");

    const savedUser = {
      username: u.username,
      password: u.password.startsWith("h_") ? u.password : hashPassword(u.password),
      name: u.name,
      role: u.role,
      active: u.active !== false,
      permissions: u.permissions || defaultPermissions(u.role)
    };

    if (editingUserId) {
      setUsers(p => p.map(user =>
        user.id === editingUserId
          ? { ...user, ...savedUser }
          : user
      ));

      if (editingUserId === currentUser?.id && setCurrentUser) {
        setCurrentUser(prev => prev ? { ...prev, ...savedUser } : prev);
      }
    } else {
      setUsers(p => [{ ...savedUser, id: Date.now() }, ...p]);
    }

    resetUserForm();
  }

  function updateUser(id, patch) {
    if (!isAdmin) return alert("Bu işlem için yönetici yetkisi gerekiyor.");
    setUsers(p => p.map(x => x.id === id ? { ...x, ...patch } : x));

    if (id === currentUser?.id && setCurrentUser) {
      setCurrentUser(prev => prev ? { ...prev, ...patch } : prev);
    }
  }

  function updatePermission(id, key) {
    if (!isAdmin) return alert("Bu işlem için yönetici yetkisi gerekiyor.");

    setUsers(p => p.map(x => {
      if (x.id !== id) return x;
      const base = { ...defaultPermissions(x.role), ...(x.permissions || {}) };
      const permissions = { ...base, [key]: !base[key] };

      if (id === currentUser?.id && setCurrentUser) {
        setCurrentUser(prev => prev ? { ...prev, permissions } : prev);
      }

      return { ...x, permissions };
    }));
  }

  function deleteUser(user) {
    if (!isAdmin) return alert("Sadece yönetici kullanıcı silebilir.");

    if (user.id === currentUser?.id) {
      return alert("Kendi hesabınızı silemezsiniz.");
    }

    const adminCount = users.filter(x => x.role === "admin" && x.active).length;
    if (user.role === "admin" && adminCount <= 1) {
      return alert("Son aktif yönetici silinemez.");
    }

    setDeleteTarget(user);
  }

  function confirmDeleteUser() {
    if (!deleteTarget) return;
    setUsers(p => p.filter(x => x.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function saveCompanySettings() {
    if (!companyForm.name.trim()) return alert("Firma adı gerekli.");
    if (!companyForm.phone.trim()) return alert("Telefon numarası gerekli.");
    localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(companyForm));
    alert("Firma bilgileri kaydedildi. Sayfa yenilenecek.");
    window.location.reload();
  }

  return (
    <main className="panel full settings-page">
      {deleteTarget && (
        <ConfirmModal
          icon="👤"
          title="Kullanıcı silinsin mi?"
          message={`${deleteTarget.name} kullanıcısı kalıcı olarak silinecek.`}
          details={`${deleteTarget.username} • ${roleLabel(deleteTarget.role)}`}
          confirmText="Evet, sil"
          cancelText="Vazgeç"
          danger
          onConfirm={confirmDeleteUser}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="topline">
        <h2>⚙️ Ayarlar</h2>
        {isAdmin && (
          <Button onClick={() => showUser ? resetUserForm() : openAddUser()}>
            {showUser ? "Kapat" : "＋ Kullanıcı / Şoför Ekle"}
          </Button>
        )}
      </div>

      <div className="settings-grid">
        <div className="panel inner">
          <h3>Firma Bilgileri</h3>
          <p className="muted">Firma adı ve telefon bilgisi başlık, fatura, WhatsApp ve raporlarda kullanılır.</p>
          <div className="form" style={{margin:0}}>
            <Field label="Firma Adı">
              <input value={companyForm.name} onChange={e=>setCompanyForm({...companyForm, name:e.target.value})} />
            </Field>
            <Field label="Telefon">
              <input value={companyForm.phone} onChange={e=>setCompanyForm({...companyForm, phone:e.target.value})} />
            </Field>
            <div className="form-actions">
              <Button onClick={saveCompanySettings}>Firma Bilgilerini Kaydet</Button>
            </div>
          </div>
        </div>
        <div className="panel inner">
          <h3>Yedekleme</h3>
          <p className="muted">Verileri bilgisayarınıza yedekleyebilir veya eski yedeği geri yükleyebilirsiniz.</p>
          <div className="report-buttons">
            <Button onClick={backup}>💾 Yedek Al</Button>
            <label className="btn file">
              📤 Yedek Yükle
              <input type="file" accept="application/json" onChange={importBackup} />
            </label>
          </div>
        </div>

        {isAdmin && (
          <div className="panel inner users-admin-panel">
            <h3>Kullanıcı ve Yetki Yönetimi</h3>

            {showUser && (
              <div className="form user-form">
                <Field label="Ad Soyad">
                  <input value={u.name} onChange={e => setU({ ...u, name: e.target.value })} />
                </Field>

                <Field label="Kullanıcı Adı">
                  <input value={u.username} onChange={e => setU({ ...u, username: e.target.value })} />
                </Field>

                <Field label="Şifre">
                  <input type="password" value={u.password.startsWith("h_") ? "" : u.password} onChange={e => setU({ ...u, password: e.target.value })} placeholder={u.password.startsWith("h_") ? "Değiştirmek için yeni şifre girin" : ""}/>
                </Field>

                <Field label="Rol">
                  <select
                    value={u.role}
                    onChange={e => setU({
                      ...u,
                      role: e.target.value,
                      permissions: defaultPermissions(e.target.value)
                    })}
                  >
                    <option value="admin">Yönetici</option>
                    <option value="staff">Personel</option>
                    <option value="driver">Şoför</option>
                  </select>
                </Field>

                <div className="permission-box">
                  {Object.entries(permissionLabels).map(([key, label]) => (
                    <label key={key} className="perm-check">
                      <input
                        type="checkbox"
                        checked={!!u.permissions?.[key]}
                        onChange={() => setU({
                          ...u,
                          permissions: {
                            ...(u.permissions || {}),
                            [key]: !u.permissions?.[key]
                          }
                        })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div className="form-actions">
                  <Button onClick={saveUser}>{editingUserId ? "Güncelle" : "Kaydet"}</Button>
                  <Button onClick={resetUserForm}>İptal</Button>
                </div>
              </div>
            )}

            <div className="user-list advanced-user-list">
              {users.map(x => {
                const perms = { ...defaultPermissions(x.role), ...(x.permissions || {}) };
                const isSelf = x.id === currentUser?.id;

                return (
                  <div className="user-row advanced-user-row" key={x.id}>
                    <div className="user-main">
                      <b>{x.name}</b>
                      <span>{x.username} / {roleLabel(x.role)}</span>
                      <small>{x.active ? "Aktif" : "Pasif"}</small>
                    </div>

                    <select
                      value={x.role}
                      onChange={e => updateUser(x.id, {
                        role: e.target.value,
                        permissions: defaultPermissions(e.target.value)
                      })}
                    >
                      <option value="admin">Yönetici</option>
                      <option value="staff">Personel</option>
                      <option value="driver">Şoför</option>
                    </select>

                    <div className="user-permissions">
                      {Object.entries(permissionLabels).map(([key, label]) => (
                        <label key={key} className="perm-check small">
                          <input
                            type="checkbox"
                            checked={!!perms[key]}
                            onChange={() => updatePermission(x.id, key)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="buttons compact user-admin-actions">
                      <Button onClick={() => editUser(x)}>✏️ Düzenle</Button>

                      <Button onClick={() => updateUser(x.id, { active: !x.active })}>
                        {x.active ? "Pasifleştir" : "Aktifleştir"}
                      </Button>

                      <Button
                        className="danger-btn"
                        onClick={() => deleteUser(x)}
                      >
                        🗑️ Sil
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}