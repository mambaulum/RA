    // ============================================================
    // FIREBASE KONFIGURASI
    // ============================================================
    const firebaseConfig = {
      apiKey: "AIzaSyBeIxPcPDuCLIJSIrvzYsUTYex5ZAlIU8Y",
      authDomain: "si-mamba-ra.firebaseapp.com",
      databaseURL: "https://si-mamba-ra-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "si-mamba-ra",
      storageBucket: "si-mamba-ra.firebasestorage.app",
      messagingSenderId: "675436328619",
      appId: "1:675436328619:web:0cb2f69c2e304cfc5969ee"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();
    let isFirebaseConnected = false;

    // ============================================================
    // FIREBASE ANONYMOUS AUTH — WAJIB, jangan dihapus.
    // ============================================================
    // Security Rules sekarang mensyaratkan "auth != null" (bukan lagi
    // ".read/.write": true yang terbuka untuk siapa saja di internet).
    // Anonymous Auth memberi setiap pengunjung sebuah token auth Firebase
    // tanpa perlu email/password — cukup untuk memenuhi syarat rules itu.
    // Ini BUKAN pengganti login PIN (login PIN tetap jalan seperti biasa,
    // sistem role tetap dari node /users) — ini lapisan di bawahnya, supaya
    // request ke Firebase (baik dari app ini maupun langsung lewat REST API)
    // tidak lagi ditolak/diterima cuma berdasarkan URL project yang publik.
    //
    // Seluruh init aplikasi (initApp) BARU dijalankan setelah sign-in anonim
    // ini selesai DAN DOM sudah siap — supaya tidak ada pemanggilan db.ref()
    // yang kepentok "Permission denied" karena jalan sebelum auth selesai.
    let __authReady = false, __domReady = false, __appStarted = false;

    function __cobaMulaiApp() {
      if (__authReady && __domReady && !__appStarted) {
        __appStarted = true;
        initApp();
      }
    }

    firebase.auth().onAuthStateChanged(user => {
      if (user) { __authReady = true; __cobaMulaiApp(); }
    });

    firebase.auth().signInAnonymously().catch(err => {
      console.error('Gagal sign-in anonim ke Firebase:', err);
      // Kalau auth anonim gagal (mis. provider belum diaktifkan di Firebase
      // Console), aplikasi tidak akan bisa baca/tulis data sama sekali kalau
      // rules sudah "auth != null". Tampilkan pesan jelas alih-alih diam saja.
      __domReady_thenAlert();
    });

    function __domReady_thenAlert() {
      // Sebelumnya alert() yang memblokir dan layar tetap kosong. Sekarang pesan tampil di
      // layar awal (splash) beserta tombol "Muat ulang". Detail teknis ada di console.
      const pesan = 'Gagal terhubung ke server. Periksa koneksi internet lalu muat ulang. (Admin: pastikan "Anonymous" aktif di Firebase Console \u2192 Authentication \u2192 Sign-in method.)';
      const tampil = () => { if (typeof window.showBootError === 'function') window.showBootError(pesan); else alert(pesan); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tampil, { once: true });
      else tampil();
    }

    // ============================================================
    // GLOBAL VARIABLES
    // ============================================================
    let currentUser = null;
    let currentRole = null;
    let currentPage = 'dashboard';
    let allStudents = [];
    let allUsers = [];
    let allSubjects = [];
    let allTeachers = [];
    let allTeacherAttendance = [];
    let allJams = [];
    let allJournalData = [];
    let darkMode = localStorage.getItem('darkMode') === 'true';
    let deferredPrompt = null;

    // Pagination
    let studentPage = 1, studentPerPage = 10;
    let subjectPage = 1, subjectPerPage = 10;
    let journalPage = 1, journalPerPage = 10;
    let currentFilterStatus = '';
    let currentSearchGuru = '';

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================
    // Semua tanggal/waktu di aplikasi ini memakai WIB (Asia/Jakarta) secara
    // eksplisit — supaya tidak tergantung timezone perangkat/browser (yang bisa
    // beda kalau device salah setting atau diakses dari luar negeri), dan supaya
    // tidak salah hari di sekitar tengah malam akibat toISOString() yang UTC.
    function getToday() {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // format: YYYY-MM-DD
    }

    function getMonth() {
      return getToday().slice(0, 7); // format: YYYY-MM
    }

    // Tanggal N hari sebelum hari ini (WIB), format YYYY-MM-DD. Dipakai untuk
    // membatasi query Firebase (orderByKey().startAt(...)) supaya tidak
    // men-download SELURUH histori data yang key-nya berbasis tanggal -
    // penting untuk performa jangka panjang begitu data bertahun-tahun menumpuk.
    function getTanggalMundur(jumlahHari) {
      const d = new Date();
      d.setDate(d.getDate() - jumlahHari);
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    }

    // Periode (YYYY-MM) N bulan sebelum periode acuan. Dipakai untuk membatasi
    // query koleksi yang key utamanya per-bulan (mis. infaq/{periode}/...).
    function getPeriodeMundur(periodeAcuan, jumlahBulan) {
      const d = new Date(`${periodeAcuan}-01T00:00:00`);
      d.setMonth(d.getMonth() - jumlahBulan);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    // Menit sejak tengah malam WIB (00:00 = 0, 07:30 = 450, dst). Dipakai untuk
    // menentukan otomatis status Telat/Pulang Awal pada absen QR mandiri guru,
    // dibandingkan terhadap JAM_MASUK_BATAS_MENIT & JAM_PULANG_BATAS_MENIT.
    function getMenitSekarangWIB() {
      const jamStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
      const [h, m] = jamStr.split(':').map(Number);
      return h * 60 + m;
    }

    // Batas jam untuk penentuan otomatis Telat (absen Datang) & Pulang Awal
    // (absen Pulang) di kartu Absen QR mandiri guru. Ubah di sini kalau jam
    // sekolah berubah.
    const JAM_MASUK_BATAS_MENIT = 7 * 60 + 30;  // 07:30 - lewat dari ini = Telat
    const JAM_PULANG_BATAS_MENIT = 10 * 60 + 0; // 10:00 - sebelum ini = Pulang Awal

    function formatDate(date) {
      if (!date) return '-';
      return new Date(date).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
      });
    }

    function formatTime(date) {
      if (!date) return '-';
      return new Date(date).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
      }) + ' WIB';
    }

    // Escape SEMUA field dari database sebelum dirender via innerHTML.
    // Lapis 1: DOMPurify membuang seluruh tag/atribut HTML yang menyusup.
    // Lapis 2: HTML-entity encode karakter berbahaya (& < > " ') agar aman
    //          dipakai baik di dalam teks maupun di dalam atribut (value="...").
    // Escape field dari database sebelum dirender via innerHTML.
    // Cukup DOMPurify (satu kali sanitasi) — DOMPurify sendiri sudah meng-encode
    // &, <, > saat serialisasi ulang, jadi TIDAK di-encode manual lagi di sini
    // (itu penyebab double-encoding seperti "&amp;amp;"). ALLOWED_TAGS/ATTR
    // kosong berarti seluruh tag & atribut HTML yang menyusup dibuang total,
    // sisanya jadi teks polos yang aman disisipkan ke dalam innerHTML.
    // CATATAN: untuk mengisi value input (mis. form edit), JANGAN pakai fungsi
    // ini di dalam atribut value="...", karena tanda kutip tidak di-encode.
    // Sisipkan HTML tanpa value dulu, lalu set field.value = rawText via JS
    // (lihat pola di editStudent/editGuru/editSubject dst.) — itu otomatis
    // aman tanpa perlu escaping sama sekali, sama seperti textContent.
    function escapeHtml(text) {
      if (text === null || text === undefined || text === '') return '';
      const str = String(text);
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      }
      // Fallback kalau DOMPurify gagal dimuat: escape manual satu kali lewat textContent.
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function sanitizeInput(text) {
      if (!text) return '';
      return String(text).replace(/[<>'"]/g, '').trim();
    }

    // Normalisasi nomor HP Indonesia ke format wa.me (62xxxxxxxxxx, tanpa +/0/spasi/strip di depan).
    // Return null kalau nomornya kosong/tidak valid, supaya pemanggil bisa kasih pesan yang jelas.
    // ============================================================
    // PROTEKSI FORMULA INJECTION SAAT EKSPOR EXCEL
    // ============================================================
    // Kalau ada data (nama siswa/guru, catatan, dll) yang kebetulan diawali
    // karakter =, +, -, @ (atau tab/carriage-return), Excel/Google Sheets
    // bisa membacanya sebagai FORMULA saat file dibuka — bukan cuma teks
    // biasa (dikenal sebagai "CSV/Excel Formula Injection"). Fungsi ini
    // menambahkan apostrof (') di depan nilai semacam itu supaya Excel
    // selalu memperlakukannya sebagai teks polos; tampilan nilainya sendiri
    // tidak berubah bagi pengguna.
    function amankanSelExcel(nilai) {
      if (nilai === null || nilai === undefined) return nilai;
      if (typeof nilai === 'number' || typeof nilai === 'boolean') return nilai;
      const str = String(nilai);
      if (/^[=+\-@\t\r]/.test(str)) return "'" + str;
      return str;
    }

    function amankanDataExcel(data) {
      return data.map(row => Array.isArray(row) ? row.map(amankanSelExcel) : amankanSelExcel(row));
    }

    function formatNomorWA(nomor) {
      if (!nomor) return null;
      let bersih = String(nomor).replace(/[^0-9+]/g, '');
      if (bersih.startsWith('+')) bersih = bersih.slice(1);
      if (bersih.startsWith('0')) bersih = '62' + bersih.slice(1);
      else if (!bersih.startsWith('62')) bersih = '62' + bersih;
      if (bersih.length < 9 || bersih.length > 15) return null;
      return bersih;
    }

    // Buka WhatsApp (wa.me) dengan pesan sudah terisi - admin/guru tinggal klik Kirim.
    // "Aplikasi hanya menyampaikan" - tidak ada pengiriman otomatis/diam-diam di belakang layar.
    function bukaWhatsApp(nomor, pesan) {
      const nomorBersih = formatNomorWA(nomor);
      if (!nomorBersih) { showToast('⚠️ Nomor WhatsApp belum diisi/tidak valid. Lengkapi dulu di Data Siswa.', 'warning'); return; }
      window.open(`https://wa.me/${nomorBersih}?text=${encodeURIComponent(pesan)}`, '_blank');
    }

    function validateNIS(nis) {
      return /^[A-Za-z0-9\-]{1,20}$/.test(nis);
    }

    function validateNama(nama) {
      return nama && nama.length >= 2 && nama.length <= 100;
    }

    function validatePIN(pin) {
      return /^\d{4,6}$/.test(pin);
    }

    // ============================================================
    // PIN HASHING — PBKDF2-SHA256 + salt acak per-user, lewat Web Crypto
    // API bawaan browser (tidak butuh library luar, jalan di semua browser
    // modern termasuk lewat HTTPS/PWA).
    //
    // PIN TIDAK LAGI disimpan plaintext di Firebase. Yang disimpan per-user
    // hanyalah `pin_salt` (acak, tidak rahasia) dan `pin_hash` (hasil PBKDF2
    // dari PIN + salt tsb). Saat login, PIN yang diketik dihitung ulang
    // hash-nya pakai salt yang sama, lalu dibandingkan ke `pin_hash`
    // tersimpan — PIN aslinya sendiri tidak pernah dikirim/disimpan mentah.
    //
    // CATATAN JUJUR: ini menaikkan keamanan secara signifikan dibanding
    // plaintext (kalau database ter-dump, PIN tidak langsung kebaca; dan
    // PIN yang sama antar-user tidak lagi terlihat identik). TAPI karena PIN
    // cuma 4-6 digit angka (maksimal 1 juta kemungkinan), hash sekuat apa
    // pun tidak membuatnya tahan brute-force kalau hash-nya sampai bocor -
    // itu sebabnya akses ke node /users tetap harus dijaga ketat lewat
    // Security Rules (auth != null), bukan cuma mengandalkan hashing ini.
    // ============================================================
    const PIN_HASH_ITERATIONS = 150000;

    function generatePinSalt() {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function hexToBytes(hex) {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return bytes;
    }

    async function hashPin(pin, saltHex) {
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
      const derived = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PIN_HASH_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
      );
      return Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Hitung salt+hash baru untuk sebuah PIN — dipakai saat bikin akun baru
    // atau ganti PIN.
    async function buatPinHashBaru(pin) {
      const salt = generatePinSalt();
      const hash = await hashPin(pin, salt);
      return { pin_salt: salt, pin_hash: hash };
    }

    // Bandingkan PIN yang diketik user dengan hash+salt tersimpan di data user.
    async function verifyPin(pin, userData) {
      if (userData && userData.pin_hash && userData.pin_salt) {
        const computed = await hashPin(pin, userData.pin_salt);
        return computed === userData.pin_hash;
      }
      // Fallback data LAMA yang belum dimigrasi (masih field `pin` plaintext).
      if (userData && userData.pin) {
        return userData.pin === pin;
      }
      return false;
    }

    // ============================================================
    // ANTRIAN OFFLINE — supaya input (mis. absensi) TIDAK HILANG kalau
    // internet putus di tengah-tengah. Perubahan yang gagal terkirim
    // disimpan ke localStorage, lalu otomatis dikirim ulang begitu koneksi
    // pulih (event 'online') atau saat aplikasi dibuka lagi.
    // ============================================================
    const OFFLINE_QUEUE_KEY = 'simamba_offline_queue';

    function getOfflineQueue() {
      try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
      catch (e) { return []; }
    }

    function saveOfflineQueue(queue) {
      try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue)); }
      catch (e) { console.error('Gagal menyimpan antrian offline ke localStorage:', e); }
    }

    function updateOfflineIndicator() {
      const queue = getOfflineQueue();
      const badge = document.getElementById('offlineQueueBadge');
      if (!badge) return;
      if (queue.length > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = `⏳ ${queue.length} belum tersinkron`;
      } else {
        badge.style.display = 'none';
      }
    }

    // Tulis 1 nilai (set) ke Firebase; kalau gagal (mis. internet putus),
    // simpan ke antrian lokal supaya tidak hilang, dan beri tahu user secara jelas.
    async function writeWithOfflineFallback(path, value, description) {
      try {
        await db.ref(path).set(value);
        return true;
      } catch (error) {
        console.warn('Write gagal, disimpan ke antrian offline:', path, error);
        const queue = getOfflineQueue();
        queue.push({ path, value, description: description || path, timestamp: Date.now() });
        saveOfflineQueue(queue);
        updateOfflineIndicator();
        showToast(`⚠️ Koneksi terputus — "${description || 'perubahan'}" disimpan sementara di HP ini, akan otomatis terkirim begitu online lagi. Jangan tutup browser dulu.`, 'warning');
        return false;
      }
    }

    // Tulis 1 nilai (update, bukan replace penuh) dengan fallback offline yang sama.
    async function updateWithOfflineFallback(path, value, description) {
      try {
        await db.ref(path).update(value);
        return true;
      } catch (error) {
        console.warn('Update gagal, disimpan ke antrian offline:', path, error);
        const queue = getOfflineQueue();
        queue.push({ path, value, isUpdate: true, description: description || path, timestamp: Date.now() });
        saveOfflineQueue(queue);
        updateOfflineIndicator();
        showToast(`⚠️ Koneksi terputus — "${description || 'perubahan'}" disimpan sementara di HP ini, akan otomatis terkirim begitu online lagi.`, 'warning');
        return false;
      }
    }

    // Hapus 1 path dengan fallback offline yang sama (mis. batal centang infaq).
    async function removeWithOfflineFallback(path, description) {
      try {
        await db.ref(path).remove();
        return true;
      } catch (error) {
        console.warn('Remove gagal, disimpan ke antrian offline:', path, error);
        const queue = getOfflineQueue();
        queue.push({ path, isRemove: true, description: description || path, timestamp: Date.now() });
        saveOfflineQueue(queue);
        updateOfflineIndicator();
        showToast(`⚠️ Koneksi terputus — "${description || 'perubahan'}" disimpan sementara di HP ini, akan otomatis terkirim begitu online lagi.`, 'warning');
        return false;
      }
    }

    let flushingOfflineQueue = false;
    // otomatis=true dipakai pemanggil otomatis (saat app dibuka / koneksi pulih): antrean kosong = diam.
    // Klik manual pada badge (tanpa argumen) tetap memberi tahu "tidak ada perubahan tertunda".
    async function flushOfflineQueue(otomatis = false) {
      if (flushingOfflineQueue) return;
      const queue = getOfflineQueue();
      if (queue.length === 0) { if (otomatis !== true) showToast('Tidak ada perubahan tertunda.', 'info'); return; }
      flushingOfflineQueue = true;
      showToast(`🔄 Mengirim ${queue.length} perubahan yang tertunda...`, 'info');
      const remaining = [];
      for (const item of queue) {
        try {
          if (item.isRemove) await db.ref(item.path).remove();
          else if (item.isUpdate) await db.ref(item.path).update(item.value);
          else await db.ref(item.path).set(item.value);
        } catch (error) {
          remaining.push(item); // masih gagal (masih offline) - coba lagi nanti
        }
      }
      saveOfflineQueue(remaining);
      updateOfflineIndicator();
      flushingOfflineQueue = false;
      if (remaining.length === 0) {
        showToast('✅ Semua perubahan tertunda berhasil disinkronkan!', 'success');
      } else if (remaining.length < queue.length) {
        showToast(`⚠️ Sebagian terkirim, ${remaining.length} masih tertunda (masih offline?)`, 'warning');
      } else {
        showToast('⚠️ Masih belum bisa terkirim — cek koneksi internet.', 'warning');
      }
    }

    window.addEventListener('online', () => { flushOfflineQueue(true); });

    // Audit log — catat SIAPA mengubah data penting (nilai, absensi siswa,
    // absensi guru, dll) supaya bisa ditelusuri lewat Log Aktivitas di Admin Panel.
    async function logActivity(action) {
      try {
        await db.ref('logs').push({
          action,
          user: currentUser?.nama || 'Sistem',
          role: currentRole || '-',
          guruKey: currentUser?.id || null,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (error) {
        console.error('Gagal mencatat log aktivitas:', error);
      }
    }

    // Cegah spam-klik tombol Simpan/Tambah/Update memicu write berulang ke
    // Firebase: tombol otomatis di-disable selama proses async berjalan.
    async function guardedCall(btn, fn) {
      if (!btn || btn.disabled) return;
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      try {
        await fn();
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    }

    // Toast queue — supaya toast beruntun (mis. saat proses banyak data)
    // tidak saling menimpa; tampil satu per satu sampai selesai.
    let toastQueue = [];
    let toastShowing = false;

    function showToast(message, type = 'info') {
      toastQueue.push({ message, type });
      processToastQueue();
    }

    function processToastQueue() {
      if (toastShowing || toastQueue.length === 0) return;
      toastShowing = true;
      const { message, type } = toastQueue.shift();
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = `toast ${type}`;
      toast.classList.add('show');
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          toastShowing = false;
          processToastQueue();
        }, 250);
      }, 3000);
    }

    function showLoading(show, text = 'Memuat data...') {
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.toggle('show', show);
      const loadingText = document.getElementById('loadingText');
      if (loadingText) loadingText.textContent = text;
    }

    // Progress bar tipis di atas layar saat pindah menu/halaman (mirip YouTube/GitHub).
    let pageProgressTimer = null;

    function startPageProgress() {
      const bar = document.getElementById('pageProgressBar');
      if (!bar) return;
      clearTimeout(pageProgressTimer);
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth; // paksa reflow supaya transition di bawah kepakai lagi
      bar.style.transition = '';
      bar.classList.add('loading');
      requestAnimationFrame(() => { bar.style.width = '75%'; });
    }

    function finishPageProgress() {
      const bar = document.getElementById('pageProgressBar');
      if (!bar) return;
      bar.style.width = '100%';
      clearTimeout(pageProgressTimer);
      pageProgressTimer = setTimeout(() => {
        bar.classList.remove('loading');
        bar.style.width = '0%';
      }, 300);
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
    }

    function toggleDarkMode() {
      darkMode = !darkMode;
      localStorage.setItem('darkMode', darkMode);
      document.body.classList.toggle('dark-mode', darkMode);
      const btn = document.querySelector('.dark-toggle');
      if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
    }

    function showGantiPinModal() {
      document.getElementById('gantiPinModal').classList.add('show');
    }

    // Daftar SEMUA node level-atas yang dipakai aplikasi ini (dicocokkan dari
    // setiap db.ref('...') di semua modul js/). Dipakai sebagai pengganti
    // db.ref().once('value')/db.ref().update() DI ROOT, karena Firebase Rules
    // yang ketat (per node) TIDAK MENGIZINKAN baca/tulis di root lagi mulai
    // dari patch keamanan ini. Kalau modul baru menambah node Firebase baru,
    // tambahkan juga namanya di sini supaya ikut ter-backup/ter-restore.
    const SEMUA_NODE_DATABASE = [
      'users', 'students', 'student_photos', 'teachers', 'attendance', 'teacher_attendance',
      'grades', 'subjects', 'anekdot', 'journal', 'infaq', 'infaq_settings', 'jadwal',
      'jam_pelajaran', 'pengumuman', 'profil', 'tahun_ajaran', 'alumni', 'promotion_history',
      'kalender_akademik', 'surat_riwayat', 'surat_counter', 'settings', 'logs', 'qr_sessions'
    ];

    // Baca semua node SATU PER SATU lalu digabung jadi satu objek (bukan satu
    // db.ref().once('value') di root) - karena root sekarang ditutup di Rules.
    async function bacaSeluruhDatabase() {
      const hasil = {};
      const snapshots = await Promise.all(SEMUA_NODE_DATABASE.map(node => db.ref(node).once('value')));
      SEMUA_NODE_DATABASE.forEach((node, i) => {
        const val = snapshots[i].val();
        if (val !== null) hasil[node] = val;
      });
      return hasil;
    }

