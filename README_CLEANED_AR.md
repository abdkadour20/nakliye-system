# نسخة منظّفة من برنامج النقل

تمت إعادة ترتيب الحزمة مع الحفاظ على نفس البرنامج الأساسي.

## ما تم اختزاله
- حذف مجلد `build` لأنه ناتج بناء جاهز ويمكن إنشاؤه من جديد بأمر `npm run build`.
- حذف نسخ الوثائق المكررة من `docs` و `src/docs`.
- حذف ملفات الاختبار الافتراضية غير المستخدمة.
- حذف دوال/مكوّنات غير مستعملة داخل `src/App.jsx`:
  - `AIOperasyonAsistani`
  - `NotificationBell`
  - `ProCard`
  - `universalSearchNormalize`

## التشغيل
```bash
npm install
npm start
```

## بناء نسخة إنتاج
```bash
npm run build
```
