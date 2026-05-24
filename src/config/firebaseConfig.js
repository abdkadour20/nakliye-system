// Firebase bağlantı ayarları
// Gerçek bağlantı için Firebase Console'dan aldığınız bilgileri buraya girin.
// Boş bırakılırsa sistem güvenli şekilde localStorage modunda çalışır.

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}
