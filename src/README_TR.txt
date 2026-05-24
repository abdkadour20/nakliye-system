SEYİTOĞULLARI KILIÇBEY OTO TRANSFER - V7 PHASE 2 MODULAR SPLIT

Bu sürümde proje klasör yapısı daha profesyonel hale getirildi.

NE DEĞİŞTİ?
1. src/core eklendi
   - appKeys.js
   - company.js

2. src/components eklendi
   - common/Button.jsx
   - common/Field.jsx
   - layout/README.md

3. src/modules eklendi
   - trips
   - reports
   - accounting
   - customers
   - drivers
   - vehicles
   - notifications
   - settings

4. src/services geliştirildi
   - whatsappService.js
   - pdfService.js
   - auditService.js
   - storageService.js
   - reportTemplates.js
   - permissionService.js

5. src/utils geliştirildi
   - date.js
   - money.js
   - search.js
   - finance.js

ÖNEMLİ:
Bu aşama güvenli modüler geçiştir. Programın çalışması için ana App.jsx korunmuştur.
Böylece önce klasör yapısı profesyonel hale gelir, sonra her sayfa tek tek App.jsx içinden ayrılır.

KURULUM:
1. ZIP içindeki tüm dosyaları proje köküne kopyalayın.
2. src klasöründeki yeni klasörleri mevcut src içine ekleyin.
3. App.jsx, App.css, manifest.json, service-worker.js dosyalarını değiştirin.
4. npm start çalıştırın.

SONRAKİ AŞAMA:
Phase 3: TripsPage, ReportsPage ve AccountingPage dosyalarının App.jsx içinden gerçek olarak ayrılması.
