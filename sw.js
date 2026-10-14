// ============================================================
// Service Worker - SI MAMBA RA Mambaul Ulum
// ============================================================
// Fungsi: cache "app shell" (halaman + library CDN) supaya UI aplikasi
// tetap bisa DIBUKA walau perangkat offline. Data Firebase Realtime
// Database TIDAK di-cache dan TIDAK di-intercept sama sekali - itu
// selalu butuh koneksi live (lihat blok pengecualian di listener 'fetch').
//
// Dua cache terpisah dipakai supaya tiap strategi jelas dan mudah di-debug:
//
// 1. STATIC_CACHE ("simamba-static-v{VERSION}")
//    Isi   : manifest.json, ikon, library CDN (Firebase SDK, Chart.js,
//            XLSX, jsPDF, QRCode.js, DOMPurify) — file yang jarang berubah.
//    Strategi: CACHE-FIRST. Diambil dari cache kalau ada (cepat, hemat
//    kuota), fetch ke network hanya kalau belum ada di cache. Cocok untuk
//    library versi tertentu yang isinya memang tidak berubah-ubah.
//
// 2. SHELL_CACHE ("simamba-shell-v{VERSION}")
//    Isi   : index.html, serta file main.css & js/*.js milik aplikasi
//            sendiri (di-cache saat pertama kali diambil dari network).
//    Strategi: NETWORK-FIRST dengan timeout, fallback ke cache. Selalu
//    coba ambil versi TERBARU dari server dulu (supaya update kode
//    langsung kepakai tanpa perlu naikkan SW_VERSION tiap edit), tapi
//    kalau network gagal/lambat/offline, langsung pakai salinan di cache
//    supaya aplikasi tetap bisa dibuka.
//
// Firebase Realtime Database (*.firebaseio.com / *.firebasedatabase.app)
// SENGAJA tidak pernah di-cache - data absensi/nilai/dll harus selalu live.
// ============================================================

const SW_VERSION = 'v4';
const STATIC_CACHE = `simamba-static-${SW_VERSION}`;
const SHELL_CACHE = `simamba-shell-${SW_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, SHELL_CACHE];

// Timeout untuk strategi network-first: kalau network lebih lambat dari
// ini, langsung pakai cache alih-alih menggantung lama di layar loading.
const NETWORK_TIMEOUT_MS = 4000;

const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './logo/logo-lembaga.png',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js'
];

const SHELL_ASSETS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache =>
        // cache.addAll() bersifat ATOMIK: satu URL gagal (mis. ikon/logo belum diupload, atau
        // satu CDN down sesaat) membatalkan SEMUA. Karena itu di-cache satu per satu.
        Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url))).then(hasil => {
          const gagal = hasil.map((h, i) => h.status === 'rejected' ? STATIC_ASSETS[i] : null).filter(Boolean);
          if (gagal.length) console.warn('SW: static asset gagal di-cache saat install:', gagal);
        })
      ),
      caches.open(SHELL_CACHE).then(cache =>
        cache.addAll(SHELL_ASSETS).catch(err => {
          console.warn('SW: gagal precache app shell saat install:', err);
        })
      )
    ])
    // Sengaja TIDAK langsung self.skipWaiting() di sini - SW baru dibiarkan
    // "menunggu" (waiting) sampai pengguna menekan tombol Refresh di toast
    // notifikasi pembaruan (lihat listener 'message' di bawah). Ini supaya
    // pengguna tidak tiba-tiba di-reload paksa saat sedang mengisi form.
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => !CURRENT_CACHES.includes(key)).map(key => {
          console.log('SW: menghapus cache versi lama:', key);
          return caches.delete(key);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Bantuan: fetch dengan batas waktu, supaya strategi network-first tidak
// menggantung lama kalau koneksi lambat/putus-nyambung.
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network-timeout')), timeoutMs);
    fetch(request).then(res => { clearTimeout(timer); resolve(res); },
                         err => { clearTimeout(timer); reject(err); });
  });
}

// Hanya simpan respons yang berhasil. 'opaque' (script/CDN no-cors) tidak bisa diperiksa statusnya,
// jadi tetap diterima; respons 404/500 same-origin TIDAK boleh ikut tersimpan lalu jadi fallback offline.
function layakDicache(res) {
  return res && (res.ok || res.type === 'opaque');
}

// Kunci cache untuk navigasi: selalu index.html tanpa query string, supaya link portal
// (?portal=1&sid=...&token=...) TIDAK tersimpan di cache perangkat.
const NAV_CACHE_KEY = './index.html';

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ATURAN #1 - Firebase Realtime Database: JANGAN pernah di-cache/di-intercept.
  // Data harus selalu live, tidak boleh disajikan dari cache offline.
  if (req.url.includes('firebaseio.com') || req.url.includes('firebasedatabase.app')) {
    return; // biarkan browser menangani request ini secara normal
  }

  // Cuma GET yang aman di-cache (POST/PUT dll ke Firebase juga otomatis
  // lolos dari sini karena bukan GET).
  if (req.method !== 'GET') return;

  // ATURAN #2 - Navigasi halaman (index.html): strategi NETWORK-FIRST.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(req, NETWORK_TIMEOUT_MS)
        .then(res => {
          if (layakDicache(res)) {
            const resClone = res.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put(NAV_CACHE_KEY, resClone));
          }
          return res;
        })
        .catch(() => caches.match(NAV_CACHE_KEY, { cacheName: SHELL_CACHE }))
    );
    return;
  }

  // ATURAN #3 - File CSS/JS milik aplikasi sendiri (same-origin, bukan CDN):
  // strategi NETWORK-FIRST, sama seperti index.html. Ini supaya setiap kali
  // Anda mengedit main.css / file js/*.js dan upload ke server, perubahan
  // langsung kepakai tanpa perlu naikkan SW_VERSION manual setiap kali -
  // versi cache hanya jadi jaring pengaman kalau network benar-benar mati.
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(
      fetchWithTimeout(req, NETWORK_TIMEOUT_MS)
        .then(res => {
          if (res.ok) {
            const resClone = res.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req, { cacheName: SHELL_CACHE }).then(cached => cached || Response.error()))
    );
    return;
  }

  // ATURAN #3b - unpkg.com (lucide@latest): versi TIDAK dikunci, jadi network-first supaya
  // tidak tersangkut di salinan lama selamanya (cache-first di aturan #4/#5 tidak cocok).
  if (url.hostname === 'unpkg.com') {
    event.respondWith(
      fetchWithTimeout(req, NETWORK_TIMEOUT_MS)
        .then(res => {
          if (layakDicache(res)) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req, { cacheName: STATIC_CACHE }).then(cached => cached || Response.error()))
    );
    return;
  }

  // ATURAN #4 - Static asset (library CDN, ikon, manifest): strategi CACHE-FIRST.
  if (STATIC_ASSETS.includes(req.url) || req.url.startsWith('https://cdn') || req.url.startsWith('https://www.gstatic.com')) {
    event.respondWith(
      caches.match(req, { cacheName: STATIC_CACHE }).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (layakDicache(res)) {
            const resClone = res.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ATURAN #5 - Asset lain yang tidak terklasifikasi di atas: cache-first
  // sederhana di STATIC_CACHE sebagai fallback umum.
  event.respondWith(
    caches.match(req, { cacheName: STATIC_CACHE }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (layakDicache(res)) {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(() => Response.error()); // sebelumnya .catch(() => cached): 'cached' selalu undefined di titik ini
    })
  );
});
