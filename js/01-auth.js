    // ============================================================
    // LOAD USERS FOR LOGIN
    // ============================================================
    async function loadUsersForLogin() {
      // Hanya ambil daftar user kalau form login memang sedang tampil. Sebelumnya dipanggil
      // untuk SEMUA pengunjung (termasuk orang tua di layar sambutan) sehingga isi node
      // 'users' (termasuk pin_hash/pin_salt) ikut terunduh ke browser mereka.
      if (!document.getElementById('loginUserSelect')) return;
      try {
        const snapshot = await db.ref('users').once('value');
        const data = snapshot.val() || {};
        allUsers = Object.entries(data).map(([key, val]) => ({ id: key, nama: val.nama || 'User', role: val.role || 'guru' }));
        const select = document.getElementById('loginUserSelect');
        if (!select) return;
        select.innerHTML = '<option value="">-- Pilih User --</option>';
        allUsers.forEach(user => {
          const option = document.createElement('option');
          option.value = user.id;
          option.textContent = `${user.nama} (${user.role})`;
          select.appendChild(option);
        });
        const pinInput = document.getElementById('pinInput');
        if (pinInput) pinInput.value = '';
      } catch (error) {
        console.error('Error loading users for login:', error);
      }
    }

    // ============================================================
    // AUTHENTICATION - LENGKAP
    // ============================================================
    // CATATAN: parameter userId sekarang WAJIB diisi (bukan opsional lagi).
    // Dulu ada jalur "cari otomatis" (cocokkan PIN ke SEMUA user sekaligus
    // lewat query) — itu dihapus karena (a) sudah tidak kompatibel dengan PIN
    // yang di-hash+salt per-user (tidak bisa di-query langsung), dan (b) pola
    // itu sendiri lebih rawan: satu percobaan PIN dicek ke seluruh user
    // sekaligus, jadi peluang "ketemu" lewat tebakan acak jauh lebih besar
    // dibanding PIN dicoba ke satu akun spesifik yang sudah dipilih.
    async function loginWithPIN(pin, userId) {
      showLoading(true, 'Memeriksa PIN...');
      try {
        if (!isFirebaseConnected) {
          showToast('⚠️ Firebase tidak terhubung!', 'error');
          showLoading(false);
          return false;
        }
        if (!validatePIN(pin)) {
          showToast('❌ PIN harus 4-6 digit angka!', 'error');
          showLoading(false);
          return false;
        }
        if (!userId) {
          showToast('❌ Pilih user dulu, lalu masukkan PIN!', 'error');
          showLoading(false);
          return false;
        }

        const userSnap = await db.ref(`users/${userId}`).once('value');
        if (!userSnap.exists()) {
          showToast('❌ User tidak ditemukan!', 'error');
          showLoading(false);
          return false;
        }
        const userData = userSnap.val();
        const cocok = await verifyPin(pin, userData);
        if (!cocok) {
          showToast('❌ PIN salah!', 'error');
          showLoading(false);
          return false;
        }

        // Data lama (belum di-hash): migrasi diam-diam ke hash begitu login
        // berhasil, supaya lama-lama seluruh akun otomatis pindah tanpa perlu
        // aksi manual admin per-user.
        if (!userData.pin_hash && userData.pin) {
          try {
            const { pin_salt, pin_hash } = await buatPinHashBaru(pin);
            await db.ref(`users/${userId}`).update({ pin_salt, pin_hash, pin: null });
            userData.pin_salt = pin_salt; userData.pin_hash = pin_hash; delete userData.pin;
          } catch (migErr) { console.warn('Migrasi PIN ke hash gagal (login tetap lanjut):', migErr); }
        }

        currentUser = { ...userData, id: userId };
        delete currentUser.pin; delete currentUser.pin_hash; delete currentUser.pin_salt;
        currentRole = userData.role || 'guru';
        localStorage.setItem('user', JSON.stringify(currentUser));
        afterLoginSuccess();
        showToast(`✅ Selamat datang, ${userData.nama || 'User'}!`, 'success'); // showToast memakai textContent -> tidak perlu escapeHtml
        showLoading(false);
        return true;
      } catch (error) {
        console.error('Login error:', error);
        showToast('❌ Error: ' + error.message, 'error');
        showLoading(false);
        return false;
      }
    }

    function showApp() {
      const appPage = document.getElementById('appPage');
      const loginPage = document.getElementById('loginPage');
      if (appPage) appPage.style.display = 'block';
      if (loginPage) loginPage.style.display = 'none';
      document.getElementById('sidebarName').textContent = currentUser.nama || 'User';
      document.getElementById('sidebarRole').textContent = currentUser.role || 'Guru';
      document.getElementById('sidebarAvatar').textContent = currentUser.nama ? currentUser.nama.charAt(0).toUpperCase() : '👤';
      updateMenuByRole(currentUser.role);
      showPage('dashboard');
      // Load data guru default setelah login
      setTimeout(loadTeacherAttendance, 1000);
    }

    // Daftar halaman yang boleh diakses tiap role. Dipakai BERSAMA oleh
    // updateMenuByRole() (untuk sembunyikan menu di sidebar) DAN showPage()
    // (untuk benar-benar memblokir akses, bukan cuma sembunyikan tombolnya) -
    // supaya tidak bisa dilewati dengan memanggil showPage('...') langsung
    // dari console browser.
    const ROLE_PAGES = {
      admin: ['dashboard', 'profil', 'students', 'buku-induk', 'subjects', 'attendance', 'grades', 'anekdot', 'rapor-narasi', 'journal', 'teacher-attendance',
        'rekap', 'rekap-nilai', 'honor', 'surat', 'jadwal', 'kalender-akademik', 'promotion', 'alumni', 'setting-jam', 'laporan', 'user-management', 'admin'
      ],
      kepsek: ['dashboard', 'profil', 'students', 'buku-induk', 'subjects', 'attendance', 'grades', 'anekdot', 'rapor-narasi', 'journal', 'teacher-attendance',
        'rekap', 'rekap-nilai', 'honor', 'surat', 'jadwal', 'kalender-akademik', 'promotion', 'alumni', 'setting-jam', 'laporan'
      ],
      wali_kelas: ['dashboard', 'profil', 'students', 'subjects', 'attendance', 'grades', 'anekdot', 'rapor-narasi', 'journal', 'teacher-attendance',
        'rekap', 'surat', 'jadwal', 'kalender-akademik'
      ],
      guru: ['dashboard', 'profil', 'attendance', 'grades', 'anekdot', 'rapor-narasi', 'journal', 'riwayat-absen-saya', 'surat', 'jadwal', 'kalender-akademik']
    };

    // Infaq TIDAK memakai ROLE_PAGES biasa - ini per-AKUN (petugas yang
    // ditunjuk admin), bukan per-role. Admin selalu bisa akses (pengawasan),
    // role lain (termasuk guru) hanya bisa kalau ditandai petugas_infaq oleh
    // admin lewat menu Manajemen User.
    function canAccessInfaq() {
      return currentRole === 'admin' || currentUser?.petugas_infaq === true;
    }

    function requireInfaqAccess() {
      if (canAccessInfaq()) return true;
      showToast('⛔ Anda bukan petugas Infaq. Hubungi admin untuk ditunjuk sebagai petugas.', 'error');
      return false;
    }

    // Daftar kelas yang ada di sekolah ini (dipakai di banyak tempat: siswa,
    // jadwal, surat, kenaikan kelas, dst). Dijadikan 1 konstanta supaya kalau
    // suatu saat nambah kelas baru, cukup ubah di sini.
    const KELAS_LIST = ['A', 'B', 'C'];

    // Pembatasan kelas untuk role classroom (guru & wali_kelas): mereka cuma
    // boleh mengelola Absensi/Nilai/Jurnal untuk kelas yang memang diampu.
    // Admin & Kepsek TIDAK dibatasi (pengawasan seluruh sekolah).
    // Return null artinya TIDAK DIBATASI (lihat semua kelas) - ini berlaku
    // untuk admin/kepsek, dan sengaja juga jadi fallback aman kalau akun
    // guru/wali_kelas belum diset "Kelas yang Diampu"-nya oleh admin (supaya
    // tidak mendadak tidak bisa lihat siswa siapa pun sebelum admin sempat
    // mengatur data guru dengan lengkap).
    async function getMyKelasDiampu() {
      if (!['guru', 'wali_kelas'].includes(currentRole)) return null;
      if (!currentUser?.teacher_id) return null;
      try {
        const snap = await db.ref(`teachers/${currentUser.teacher_id}/kelas_diampu`).once('value');
        const kelas = snap.val();
        if (!Array.isArray(kelas) || kelas.length === 0) return null;
        return kelas;
      } catch (error) {
        console.error('Gagal memuat kelas yang diampu:', error);
        return null; // gagal baca -> jangan sampai memblokir guru, biarkan lihat semua
      }
    }

    function updateMenuByRole(role) {
      const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
      const allowedPages = ROLE_PAGES[role] || ROLE_PAGES.guru;
      menuItems.forEach(item => {
        const page = item.dataset.page;
        if (page && !allowedPages.includes(page)) {
          item.style.display = 'none';
        } else {
          item.style.display = 'flex';
        }
      });
      // Infaq: bukan berdasar role, tapi per-akun (petugas yang ditunjuk admin).
      const infaqItem = document.querySelector('.sidebar-menu .menu-item[data-page="infaq"]');
      if (infaqItem) infaqItem.style.display = canAccessInfaq() ? 'flex' : 'none';
      // Backup mengunduh SELURUH database -> hanya admin (juga dicek ulang di manualBackup()).
      const btnBackup = document.getElementById('btnBackupTopbar');
      if (btnBackup) btnBackup.style.display = (role === 'admin') ? '' : 'none';
    }

    function logout() {
      currentUser = null; currentRole = null;
      localStorage.removeItem('user');
      const appPage = document.getElementById('appPage');
      if (appPage) appPage.style.display = 'none';

      // #loginPage tidak selalu ada di DOM - dia hanya dibuat oleh
      // initLoginPage() saat auto-login gagal. Kalau user tadinya masuk lewat
      // auto-login (sesi tersimpan), elemen ini belum pernah dibuat, jadi kita
      // buat dulu di sini supaya logout tidak macet di layar blank.
      let loginPage = document.getElementById('loginPage');
      if (!loginPage) {
        initLoginPage();
        loginPage = document.getElementById('loginPage');
      }
      if (loginPage) loginPage.style.display = 'flex';

      const pinInput = document.getElementById('pinInput');
      if (pinInput) pinInput.value = '';
      showToast('Anda telah keluar', 'info');
    }

    // Guard role untuk fungsi-fungsi manajemen guru yang sensitif (absen
    // manual guru lain, edit/hapus data guru, dsb). Menu sudah disembunyikan
    // dari role 'guru' di updateMenuByRole, tapi itu cuma UI - pengecekan di
    // sini mencegah fungsi tetap bisa dipanggil manual lewat console browser.
    function requireStaffRole(actionLabel) {
      if (['admin', 'kepsek', 'wali_kelas'].includes(currentRole)) return true;
      showToast(`⛔ Anda tidak punya akses untuk ${actionLabel || 'aksi ini'}`, 'error');
      return false;
    }

    function checkAutoLogin(skipShowApp) {
      const saved = localStorage.getItem('user');
      if (saved) {
        try {
          currentUser = JSON.parse(saved);
          currentRole = currentUser.role || 'guru';
          if (!skipShowApp) showApp();
          return true;
        } catch (e) { localStorage.removeItem('user'); }
      }
      return false;
    }

    // Dipanggil setelah login sukses. Kalau sedang di alur "Absen Guru via QR"
    // (window.__qrCheckinPending), lanjut ke layar absen mandiri, bukan ke
    // dashboard biasa.
    function afterLoginSuccess() {
      if (window.__qrCheckinPending) {
        const loginPage = document.getElementById('loginPage');
        if (loginPage) loginPage.remove();
        initQRCheckinScreen();
      } else {
        showApp();
      }
    }

    // Dipakai dari layar Absen Guru QR kalau yang login ternyata salah akun
    // ("Bukan Anda?") -> logout lalu tampilkan lagi form login di atas overlay QR.
    function logoutFromQRCheckin() {
      currentUser = null; currentRole = null;
      localStorage.removeItem('user');
      const overlay = document.getElementById('qrCheckinOverlay');
      if (overlay) overlay.style.display = 'none';
      initLoginPage();
      setTimeout(loadUsersForLogin, 500);
    }

    // ============================================================
    // PORTAL ORANG TUA (read-only, akses via link+token, tanpa login)
    // ============================================================
    async function initPortalOrangTua(studentId, token) {
      const portalHTML = `
      <div id="portalOrtuScreen" style="min-height:100vh;min-height:100dvh;background:linear-gradient(135deg,#0f3b2c 0%,#1a5c3e 100%);padding:16px;padding-bottom:calc(74px + env(safe-area-inset-bottom));">
        <div style="max-width:480px;margin:0 auto;">
          <div style="text-align:center;color:white;padding:24px 0 16px;">
            <div style="width:70px;height:70px;border-radius:16px;background:linear-gradient(135deg,#0f3b2c,#1a5c3e);display:flex;align-items:center;justify-content:center;margin:0 auto;overflow:hidden;">
              <img src="logo/logo-lembaga.png" alt="Logo lembaga" style="width:92%;height:92%;object-fit:contain;" onerror="this.onerror=null; var p=this.parentElement; p.innerHTML='🧸'; p.style.fontSize='34px'; p.style.color='white';">
            </div>
            <h2 style="font-weight:800;margin-top:4px;">Portal Orang Tua</h2>
          </div>
          <div id="portalOrtuContent" style="background-color:white;background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:14px 14px, calc(100% - 14px) 14px, 14px calc(100% - 14px), calc(100% - 14px) calc(100% - 14px);background-size:20px 20px;border-radius:20px;padding:24px;box-shadow:0 0 0 2px #0f3b2c, 0 0 0 6px #fff, 0 0 0 7px #c9a227, 0 20px 60px rgba(0,0,0,0.25);">
            <div style="text-align:center;padding:30px 0;color:#6b7280;">⏳ Memuat data ananda...</div>
          </div>
          <p style="text-align:center;color:rgba(255,255,255,0.7);font-size:11px;margin-top:16px;">Simpan/bookmark halaman ini untuk akses selanjutnya.</p>
        </div>
      </div>
      <nav class="portal-bottom-nav" aria-label="Loncat ke bagian">
        <div class="portal-bottom-nav-inner">
          <button class="portal-bottom-nav-item" data-target-sec="portalSecHadir" aria-label="Kehadiran">
            <span class="bn-icon"><i data-lucide="check-circle-2"></i></span><span>Hadir</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecNilai" aria-label="Perkembangan/Nilai">
            <span class="bn-icon"><i data-lucide="sprout"></i></span><span>Nilai</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecCatatan" aria-label="Catatan Guru">
            <span class="bn-icon"><i data-lucide="sticky-note"></i></span><span>Catatan</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecInfaq" aria-label="Infaq">
            <span class="bn-icon"><i data-lucide="wallet"></i></span><span>Infaq</span>
          </button>
        </div>
      </nav>`;
      document.body.insertAdjacentHTML('afterbegin', portalHTML);
      if (typeof lucide !== 'undefined') lucide.createIcons();
      document.querySelectorAll('.portal-bottom-nav-item[data-target-sec]').forEach(tombol => {
        tombol.addEventListener('click', () => {
          const target = document.getElementById(tombol.dataset.targetSec);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelectorAll('.portal-bottom-nav-item').forEach(t => t.classList.remove('active'));
            tombol.classList.add('active');
          }
        });
      });
      const content = document.getElementById('portalOrtuContent');

      if (!studentId || !token) {
        content.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">⚠️</div><h3 style="font-weight:700;">Link Tidak Lengkap</h3><p style="color:#6b7280;font-size:13px;">Link ini tidak lengkap. Hubungi pihak sekolah untuk mendapatkan link portal yang benar.</p></div>`;
        return;
      }

      try {
        const studentSnap = await db.ref(`students/${studentId}`).once('value');
        const student = studentSnap.val();
        if (!student || !student.portal_token || student.portal_token !== token) {
          content.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">⚠️</div><h3 style="font-weight:700;">Link Tidak Valid</h3><p style="color:#6b7280;font-size:13px;">Link portal ini tidak valid atau sudah tidak berlaku. Hubungi pihak sekolah untuk mendapatkan link terbaru.</p></div>`;
          return;
        }

        // ============================================================
        // FAKTOR KEDUA: nomor WA orang tua terdaftar.
        // ============================================================
        // Selain link (yang sudah berisi token acak), orang tua juga harus
        // membuktikan tahu nomor WA yang terdaftar di data siswa sebelum
        // data ditampilkan. Kalau link ini sampai tersebar/ke-screenshot ke
        // orang yang bukan orang tuanya, mereka tetap butuh tahu nomor WA
        // yang benar untuk bisa masuk. Kalau field no_wa_ortu belum diisi
        // admin, langkah ini dilewati (supaya tidak mengunci akses siswa
        // yang datanya belum lengkap).
        const kunciVerifikasi = `portal_verified_${studentId}_${token}`;
        const sudahTerverifikasi = localStorage.getItem(kunciVerifikasi) === '1';

        if (student.no_wa_ortu && !sudahTerverifikasi) {
          tampilkanFormVerifikasiWA(studentId, token);
          return;
        }

        await tampilkanDataPortal(student, studentId);
      } catch (error) {
        console.error('Error loading portal ortu:', error);
        content.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">❌</div><h3 style="font-weight:700;">Gagal Memuat Data</h3><p style="color:#6b7280;font-size:13px;">Terjadi kesalahan atau koneksi internet bermasalah. Silakan coba lagi.</p></div>`;
      }
    }

    // Bandingkan 2 nomor WA secara "longgar": buang semua karakter selain
    // angka, lalu buang awalan 0 / 62 supaya "0812...", "62812...", dan
    // "+62 812..." dianggap sama.
    function normalisasiNomorWA(nomor) {
      const digitSaja = String(nomor || '').replace(/\D/g, '');
      return digitSaja.replace(/^0/, '').replace(/^62/, '');
    }

    function tampilkanFormVerifikasiWA(studentId, token) {
      const content = document.getElementById('portalOrtuContent');
      content.innerHTML = `
        <div style="text-align:center;padding:10px 0 20px;">
          <div style="font-size:44px;">🔒</div>
          <h3 style="font-weight:700;margin-bottom:6px;">Verifikasi Orang Tua</h3>
          <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Untuk menjaga privasi ananda, masukkan nomor WhatsApp yang terdaftar di sekolah.</p>
          <input type="tel" id="portalWaInput" class="field" placeholder="Contoh: 081234567890" style="text-align:center;font-size:16px;margin-bottom:10px;" inputmode="numeric">
          <div id="portalWaError" style="color:#dc2626;font-size:12px;margin-bottom:10px;display:none;">Nomor tidak cocok dengan data kami. Silakan coba lagi atau hubungi pihak sekolah.</div>
          <button class="btn btn-primary" style="width:100%;" onclick="verifikasiWAPortal('${studentId}','${token}')">Lanjutkan</button>
        </div>`;
      const inputEl = document.getElementById('portalWaInput');
      if (inputEl) {
        inputEl.focus();
        inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') verifikasiWAPortal(studentId, token); });
      }
    }

    async function verifikasiWAPortal(studentId, token) {
      const input = document.getElementById('portalWaInput');
      const errBox = document.getElementById('portalWaError');
      const nomor = input ? input.value.trim() : '';
      if (errBox) errBox.style.display = 'none';
      try {
        const studentSnap = await db.ref(`students/${studentId}`).once('value');
        const student = studentSnap.val();
        if (!student || student.portal_token !== token) {
          document.getElementById('portalOrtuContent').innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">⚠️</div><h3 style="font-weight:700;">Link Tidak Valid</h3></div>`;
          return;
        }
        if (nomor && normalisasiNomorWA(nomor) === normalisasiNomorWA(student.no_wa_ortu)) {
          localStorage.setItem(`portal_verified_${studentId}_${token}`, '1');
          await tampilkanDataPortal(student, studentId);
        } else if (errBox) {
          errBox.style.display = 'block';
        }
      } catch (error) {
        console.error('Error verifying WA portal:', error);
        if (errBox) { errBox.textContent = 'Terjadi kesalahan, coba lagi.'; errBox.style.display = 'block'; }
      }
    }

    async function tampilkanDataPortal(student, studentId) {
      const content = document.getElementById('portalOrtuContent');
      content.innerHTML = `<div style="text-align:center;padding:30px 0;color:#6b7280;">⏳ Memuat data ananda...</div>`;
      try {
        const periode = getMonth();

        // Kehadiran bulan ini — DIBACA PER-HARI, HANYA UNTUK studentId INI.
        // Dulu kode ini membaca SELURUH node attendance bulan berjalan
        // (kehadiran SEMUA siswa sekolah), baru difilter di browser. Siapa
        // pun yang buka tab Network di browser bisa lihat data mentah semua
        // anak lain. Sekarang tiap tanggal dibaca lewat path spesifik
        // attendance/{tanggal}/{studentId} — respons Firebase-nya otomatis
        // cuma berisi data anak ini, anak lain tidak pernah terkirim ke
        // browser orang tua sama sekali.
        const [tahun, bulan] = periode.split('-').map(Number);
        const jumlahHari = new Date(tahun, bulan, 0).getDate();
        const tanggalList = Array.from({ length: jumlahHari }, (_, i) => `${periode}-${String(i + 1).padStart(2, '0')}`);

        const [attendanceSnaps, gradesSnap, subjectsSnap, kurikulum, anekdotSnap, infaqSnap, tahunAjaranSnap, fotoSnap] = await Promise.all([
          Promise.all(tanggalList.map(tgl => db.ref(`attendance/${tgl}/${studentId}`).once('value'))),
          db.ref(`grades/${studentId}`).once('value'),
          db.ref('subjects').once('value'),
          getKurikulumSetting(),
          db.ref('anekdot').orderByChild('studentId').equalTo(studentId).limitToLast(5).once('value'),
          db.ref(`infaq/${periode}/${studentId}`).once('value'),
          db.ref('tahun_ajaran').once('value'),
          db.ref(`student_photos/${studentId}`).once('value')
        ]);
        const fotoUrl = fotoSnap.val();

        // Kehadiran bulan ini
        let hadirBulan = 0, totalCatatBulan = 0;
        attendanceSnaps.forEach(snap => {
          const rec = snap.val();
          if (rec) { totalCatatBulan++; if (rec.status === 'H') hadirBulan++; }
        });
        const persenHadir = totalCatatBulan > 0 ? Math.round((hadirBulan / totalCatatBulan) * 100) : null;

        // Status absensi HARI INI (kalau termasuk dalam periode bulan yang lagi
        // ditampilkan) - dipakai untuk tombol "Ajukan Izin" di bawah. Diambil dari
        // attendanceSnaps yang sudah di-fetch di atas, tidak perlu fetch tambahan.
        const hariIni = getToday();
        const idxHariIni = tanggalList.indexOf(hariIni);
        const statusHariIni = idxHariIni >= 0 ? (attendanceSnaps[idxHariIni].val()?.status || null) : null;
        const LABEL_STATUS_ABSEN = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };

        // Perkembangan (6 aspek PAUD atau custom subjects)
        const gradesData = gradesSnap.val() || {};
        const subjects = subjectsSnap.val() || {};
        const aspekDefault = getAspekDefault(kurikulum);
        const daftarAspek = Object.keys(subjects).length > 0
          ? Object.entries(subjects).map(([id, s]) => ({ id, kode: s.kode || id, nama: s.nama || id }))
          : Object.entries(aspekDefault).map(([kode, nama]) => ({ id: kode, kode, nama }));
        const semesterAktif = String(tahunAjaranSnap.val()?.semester || 1);
        const aspekHtml = daftarAspek.map(aspek => {
          const nilai = gradesData[aspek.id]?.[semesterAktif]?.nilai;
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;">
            <span style="font-size:13px;">${escapeHtml(aspek.kode)} - ${escapeHtml(aspek.nama)}</span>
            ${nilai ? capaianBadge(nilai) : '<span style="font-size:11px;color:#9ca3af;">Belum ada data</span>'}
          </div>`;
        }).join('');

        // Catatan Anekdot terbaru (maks 5)
        const anekdotData = anekdotSnap.val() || {};
        const anekdotList = Object.values(anekdotData).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
        const anekdotHtml = anekdotList.length > 0
          ? anekdotList.map(a => `<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
              <div style="font-size:11px;color:#9ca3af;">${escapeHtml(formatDate(a.tanggal))} · ${escapeHtml(a.aspekLabel || a.aspek || '-')}</div>
              <div style="font-size:13px;color:#374151;">${escapeHtml(a.catatan || '')}</div>
            </div>`).join('')
          : '<p style="font-size:13px;color:#9ca3af;text-align:center;padding:10px 0;">Belum ada catatan</p>';

        // Infaq bulan ini
        const infaqData = infaqSnap.val() || {};
        const weeksInMonth = getWeeksInMonth(periode);
        let weeksPaid = 0, totalSetor = 0;
        for (let w = 1; w <= weeksInMonth; w++) {
          const rec = infaqData[`w${w}`];
          if (rec?.paid) { weeksPaid++; totalSetor += rec.jumlah || 0; }
        }
        const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';

        content.innerHTML = `
          <div style="text-align:center;margin-bottom:16px;">
            <div style="width:64px;height:64px;border-radius:50%;background:#0f3b2c;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:26px;margin:0 auto 10px;overflow:hidden;">${fotoUrl ? `<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover;">` : escapeHtml((student.nama || '?').trim().charAt(0).toUpperCase())}</div>
            <h3 style="font-weight:700;font-size:18px;">${escapeHtml(student.nama || '-')}</h3>
            <p style="font-size:12px;color:#6b7280;">Kelas ${escapeHtml(student.kelas || '-')} · ${escapeHtml(namaSekolah)}</p>
          </div>

          <div id="portalSecHadir" style="background:#f0fdf4;border-radius:12px;padding:14px;margin-bottom:14px;text-align:center;">
            <p style="font-size:12px;color:#065f46;font-weight:600;margin-bottom:2px;">✅ Kehadiran Bulan ${escapeHtml(namaBulan)}</p>
            <p style="font-size:22px;font-weight:800;color:#065f46;">${persenHadir !== null ? persenHadir + '%' : '-'}</p>
            <p style="font-size:11px;color:#6b7280;">${hadirBulan} hari hadir dari ${totalCatatBulan} hari tercatat</p>
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid #bbf7d0;">
              ${statusHariIni
                ? `<p style="font-size:12px;color:#065f46;">📌 Absensi hari ini sudah tercatat: <strong>${escapeHtml(LABEL_STATUS_ABSEN[statusHariIni] || statusHariIni)}</strong></p>`
                : `<button type="button" id="portalBtnAjukanIzin" class="btn btn-soft" style="font-size:12px;padding:8px 14px;" data-student-id="${escapeHtml(studentId)}" data-nama-anak="${escapeHtml(student.nama || 'ananda')}" onclick="ajukanIzinPortal(this.dataset.studentId, this.dataset.namaAnak)">📝 Ajukan Izin Hari Ini</button>
                   <p style="font-size:10px;color:#6b7280;margin-top:4px;">Hanya untuk HARI INI. Kalau sekolah sudah mencatat absensi lebih dulu, pengajuan tidak akan menimpanya.</p>`
              }
            </div>
          </div>

          <div id="portalSecNilai" style="margin-bottom:14px;">
            <p style="font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">🌱 Perkembangan Ananda (Semester ${escapeHtml(semesterAktif)})</p>
            ${aspekHtml}
          </div>

          <div id="portalSecCatatan" style="margin-bottom:14px;">
            <p style="font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">🗒️ Catatan Terbaru dari Guru</p>
            ${anekdotHtml}
          </div>

          <div id="portalSecInfaq" style="background:#fffbeb;border-radius:12px;padding:14px;">
            <p style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:2px;">💵 Infaq Bulan ${escapeHtml(namaBulan)}</p>
            <p style="font-size:16px;font-weight:700;color:#92400e;">${weeksPaid}/${weeksInMonth} minggu ${weeksPaid >= weeksInMonth ? '(Lunas ✅)' : ''}</p>
            <p style="font-size:11px;color:#78350f;">Total setor: Rp ${totalSetor.toLocaleString('id-ID')}</p>
          </div>
        `;
      } catch (error) {
        console.error('Error loading portal data:', error);
        content.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">❌</div><h3 style="font-weight:700;">Gagal Memuat Data</h3><p style="color:#6b7280;font-size:13px;">Terjadi kesalahan atau koneksi internet bermasalah. Silakan coba lagi.</p></div>`;
      }
    }

    // Orang tua mengajukan Izin untuk HARI INI saja (tidak bisa pilih tanggal
    // lain - tombolnya cuma ada untuk hari ini). Ditulis LANGSUNG ke node
    // attendance yang sama dipakai guru, dengan status 'I'.
    //
    // Batasan yang DIJAGA Firebase Rules (bukan cuma di JS ini - lihat rules.json):
    //  - CUMA bisa membuat catatan yang BELUM ADA (tidak bisa menimpa absensi
    //    yang sudah dicatat guru/sekolah, apa pun statusnya).
    //  - Status yang ditulis WAJIB 'I' (tidak bisa mengaku Hadir/Sakit/Alpa
    //    lewat jalur ini).
    // Batasan yang TIDAK BISA dijamin tanpa autentikasi per-orang tua yang
    // sesungguhnya (lihat catatan keamanan audit): Rules tidak bisa memastikan
    // permintaan ini benar datang dari orang tua siswa INI - siapa pun yang
    // tahu studentId bisa memicu ini untuk siswa lain, SELAMA hari itu belum
    // diabsen. Risikonya dibatasi (cuma bisa isi 'I' di hari yang masih kosong,
    // tidak bisa menimpa/merusak data yang sudah ada) sambil menunggu autentikasi
    // per-orang tua yang sesungguhnya (lihat rencana Cloud Function).
    async function ajukanIzinPortal(studentId, namaAnak) {
      const keterangan = prompt(`Ajukan izin untuk ${namaAnak} HARI INI.\n\nAlasan (opsional, boleh dikosongkan):`);
      if (keterangan === null) return; // dibatalkan orang tua
      if (!confirm(`Kirim pengajuan izin untuk ${namaAnak} hari ini?`)) return;

      const btn = document.getElementById('portalBtnAjukanIzin');
      if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }

      const today = getToday();
      try {
        // Dicek dulu di sini supaya pesannya ramah - penegaknya tetap Firebase
        // Rules (create-only), bukan pengecekan ini.
        const existing = await db.ref(`attendance/${today}/${studentId}`).once('value');
        if (existing.exists()) {
          showToast('Absensi hari ini sudah keburu tercatat oleh sekolah, tidak bisa diajukan lagi.', 'warning');
          const studentSnap = await db.ref(`students/${studentId}`).once('value');
          if (studentSnap.exists()) tampilkanDataPortal(studentSnap.val(), studentId);
          return;
        }
        await db.ref(`attendance/${today}/${studentId}`).set({
          status: 'I', tanggal: today, timestamp: firebase.database.ServerValue.TIMESTAMP,
          by: `Orang Tua (${namaAnak})`, by_role: 'ortu', guruKey: null,
          keterangan: sanitizeInput(keterangan || '')
        });
        showToast('✅ Izin berhasil diajukan untuk hari ini', 'success');
        const studentSnap = await db.ref(`students/${studentId}`).once('value');
        if (studentSnap.exists()) tampilkanDataPortal(studentSnap.val(), studentId);
      } catch (error) {
        console.error('Error ajukan izin portal:', error);
        showToast('❌ Gagal mengajukan izin. Absensi mungkin sudah keburu tercatat, atau koneksi bermasalah - coba lagi.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = '📝 Ajukan Izin Hari Ini'; }
      }
    }

    // Ambil token portal siswa (buat baru sekali kalau belum ada) lalu buka
    // WhatsApp dengan link portal siap kirim ke orang tua.
    // Token portal: acak kriptografis (crypto.getRandomValues), bukan lagi
    // campuran timestamp+Math.random() yang polanya lebih gampang ditebak.
    function generatePortalToken() {
      const bytes = new Uint8Array(18); // 18 byte = 144-bit, jauh di atas cukup
      crypto.getRandomValues(bytes);
      return 'pt' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function kirimLinkPortalWA(studentId) {
      try {
        const snap = await db.ref(`students/${studentId}`).once('value');
        const student = snap.val();
        if (!student) { showToast('Siswa tidak ditemukan', 'error'); return; }
        let token = student.portal_token;
        if (!token) {
          token = generatePortalToken();
          await db.ref(`students/${studentId}`).update({ portal_token: token });
        }
        if (!student.no_wa_ortu) {
          showToast('⚠️ No. WhatsApp orang tua belum diisi. Lengkapi dulu di Data Siswa.', 'warning');
          return;
        }
        const link = `${window.location.origin}${window.location.pathname}?portal=1&sid=${studentId}&token=${token}`;
        const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
        const pesan = `Assalamu'alaikum Bapak/Ibu orang tua dari ananda *${student.nama}* (Kelas ${student.kelas || '-'}).\n\nBerikut link Portal Orang Tua dari ${namaSekolah} untuk memantau kehadiran, perkembangan, catatan guru, dan status infaq ananda kapan saja:\n${link}\n\nMohon disimpan/bookmark linknya ya. Terima kasih 🙏`;
        bukaWhatsApp(student.no_wa_ortu, pesan);
      } catch (error) {
        console.error('Error kirim link portal:', error);
        showToast('Gagal membuat link portal', 'error');
      }
    }

    // Cabut akses portal yang lama sekaligus: link lama (token) langsung
    // tidak berlaku lagi, dan PIN Portal yang sudah dibuat orang tua juga
    // direset (orang tua akan diminta buat PIN baru lagi lain kali akses
    // lewat beranda). Dipakai kalau link/PIN diduga bocor ke orang yang
    // salah, atau orang tua lupa PIN dan minta di-reset admin.
    async function resetLinkPortal(studentId) {
      if (!confirm('Reset akses Portal Orang Tua untuk siswa ini?\n\nLink lama (kalau pernah dikirim) langsung TIDAK BERLAKU, dan PIN Portal yang sudah dibuat orang tua juga akan diminta dibuat ulang. Lanjutkan?')) return;
      try {
        const token = generatePortalToken();
        await db.ref(`students/${studentId}`).update({
          portal_token: token,
          portal_pin_hash: null,
          portal_pin_salt: null
        });
        showToast('✅ Akses portal berhasil direset. Kirim link baru kalau perlu (tombol Kirim Link Portal).', 'success');
        if (typeof refreshStudentsView === 'function') refreshStudentsView();
      } catch (error) {
        console.error('Error reset link portal:', error);
        showToast('Gagal reset akses portal', 'error');
      }
    }

    async function gantiPin() {
      const oldPin = document.getElementById('oldPin').value;
      const newPin = document.getElementById('newPin').value;
      const confirmPin = document.getElementById('confirmPin').value;
      if (!oldPin || !newPin || !confirmPin) {
        showToast('Isi semua field!', 'warning');
        return;
      }
      if (!validatePIN(newPin)) {
        showToast('PIN harus 4-6 digit angka!', 'error');
        return;
      }
      if (newPin !== confirmPin) {
        showToast('PIN baru tidak cocok!', 'error');
        return;
      }
      try {
        const snapshot = await db.ref(`users/${currentUser.id}`).once('value');
        const userData = snapshot.val();
        const cocok = await verifyPin(oldPin, userData);
        if (!cocok) {
          showToast('PIN lama salah!', 'error');
          return;
        }
        const { pin_salt, pin_hash } = await buatPinHashBaru(newPin);
        await db.ref(`users/${currentUser.id}`).transaction((currentData) => {
          if (currentData === null) return currentData;
          currentData.pin_salt = pin_salt;
          currentData.pin_hash = pin_hash;
          currentData.pin = null; // buang sisa data lama kalau masih ada
          return currentData;
        });
        showToast('PIN berhasil diubah!', 'success');
        document.getElementById('gantiPinModal').classList.remove('show');
        document.getElementById('oldPin').value = '';
        document.getElementById('newPin').value = '';
        document.getElementById('confirmPin').value = '';
        // currentUser di memori/localStorage TIDAK menyimpan pin/pin_hash/pin_salt
        // sama sekali (lihat loginWithPIN) — jadi tidak ada yang perlu diupdate
        // di objek currentUser untuk field PIN.
        localStorage.setItem('user', JSON.stringify(currentUser));
      } catch (error) {
        console.error('Error changing PIN:', error);
        showToast('Gagal mengubah PIN', 'error');
      }
    }

    // ============================================================
    // LOGIN PAGE
    // ============================================================
    function initLoginPage() {
      const loginHTML = `
      <div id="loginPage" style="display:flex;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;background:linear-gradient(135deg,#0f3b2c 0%,#1a5c3e 100%);padding:20px;">
        <div style="background-color:white;background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:14px 14px, calc(100% - 14px) 14px, 14px calc(100% - 14px), calc(100% - 14px) calc(100% - 14px);background-size:20px 20px;padding:44px 36px;border-radius:24px;max-width:480px;width:100%;box-shadow:0 0 0 2px #0f3b2c, 0 0 0 6px #fff, 0 0 0 7px #c9a227, 0 20px 60px rgba(0,0,0,0.3);text-align:center;">
          <div style="width:100px;height:100px;border-radius:16px;background:linear-gradient(135deg,#0f3b2c,#1a5c3e);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;overflow:hidden;">
            <img src="logo/logo-lembaga.png" alt="Logo lembaga" style="width:92%;height:92%;object-fit:contain;" onerror="this.onerror=null; var p=this.parentElement; p.innerHTML='🧸'; p.style.fontSize='48px'; p.style.color='white';">
          </div>
          <h2 style="font-size:27px;font-weight:800;color:#0f3b2c;">SI MAMBA</h2>
          <p style="color:#6b7280;margin-bottom:8px;">RA Mambaul Ulum</p>
          <div id="loginStatus" style="font-size:12px;color:#d97706;margin-bottom:16px;">⏳ Menghubungkan ke Firebase...</div>
          <form id="loginForm" onsubmit="event.preventDefault(); doLogin();" novalidate>
          <div style="margin-bottom:12px;text-align:left;">
            <label for="loginUserSelect" style="display:block;font-weight:600;font-size:13px;color:#374151;margin-bottom:4px;">👤 Pilih User</label>
            <select id="loginUserSelect" class="login-user-select" onchange="onUserSelectChange()">
              <option value="">-- Memuat user... --</option>
            </select>
          </div>
          <div style="margin-bottom:16px;text-align:left;">
            <label for="pinInput" style="display:block;font-weight:600;font-size:13px;color:#374151;margin-bottom:4px;">🔑 Masukkan PIN</label>
            <input type="password" id="pinInput" maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:12px;font-size:18px;text-align:center;letter-spacing:8px;background:white;" placeholder="••••••">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;" id="loginBtn">Login</button>
          </form>
          <div style="margin-top:12px;font-size:11px;color:#9ca3af;">Hubungi admin jika lupa PIN</div>
          <div style="margin-top:8px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
            <button type="button" onclick="refreshUserList()" style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;text-decoration:underline;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="refresh-cw" style="width:11px;height:11px;"></i> Refresh User</button>
            ${window.__qrCheckinPending ? '' : `<button type="button" onclick="kembaliKeSambutan()" style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;text-decoration:underline;display:inline-flex;align-items:center;gap:3px;">← Kembali</button>`}
          </div>
        </div>
      </div>
      `;
      document.body.insertAdjacentHTML('afterbegin', loginHTML);
      if (typeof lucide !== 'undefined') lucide.createIcons();
      // Status koneksi hanya diperbarui initApp() saat status BERUBAH. Kalau form login dibuat SETELAH
      // koneksi tersambung (mis. lewat tombol "Saya Guru / Staf"), teks "Menghubungkan..." tidak akan
      // pernah berubah - jadi sinkronkan sekarang.
      const ls = document.getElementById('loginStatus');
      if (ls && isFirebaseConnected) { ls.textContent = '✅ Terhubung ke Firebase'; ls.style.color = '#059669'; }
      setTimeout(loadUsersForLogin, 500);
    }

    // Kembali dari form login ke layar sambutan (pilih peran) - mis. orang tua salah tekan "Saya Guru / Staf".
    function kembaliKeSambutan() {
      const lp = document.getElementById('loginPage');
      if (lp) lp.remove();
      initWelcomeScreen();
    }

    function onUserSelectChange() {
      document.getElementById('pinInput').value = '';
      document.getElementById('pinInput').focus();
    }

    // ============================================================
    // BERANDA (pilih peran) + PORTAL ORANG TUA VIA CARI NOMOR WA
    // ============================================================
    // Ini JALUR TAMBAHAN di samping link WA+token yang sudah ada (link lama
    // tetap berfungsi persis seperti sebelumnya — lihat initPortalOrangTua).
    // Bedanya: orang tua tidak perlu link khusus, cukup buka alamat aplikasi
    // biasa, pilih "Orang Tua", cari pakai nomor WA yang terdaftar, lalu buat
    // PIN Portal sendiri (4-6 digit) untuk akses selanjutnya. PIN inilah yang
    // jadi "rahasia" penggantinya token — nomor WA cuma dipakai untuk MENCARI
    // anaknya, bukan sebagai kunci akses (nomor WA bukan rahasia).
    function sapaanWaktu() {
      const jam = new Date().getHours();
      if (jam < 4) return 'Selamat malam';
      if (jam < 11) return 'Selamat pagi';
      if (jam < 15) return 'Selamat siang';
      if (jam < 18) return 'Selamat sore';
      return 'Selamat malam';
    }

    // Kata-kata penyemangat/motivasi pendidikan, ditampilkan acak di layar
    // sambutan. Silakan tambah/ubah kalimatnya sesuka hati di array ini.
    const KATA_PENYEMANGAT = [
      { teks: 'Menuntut ilmu itu wajib bagi setiap muslim.', sumber: 'HR. Ibnu Majah' },
      { teks: 'Barangsiapa menempuh jalan untuk mencari ilmu, Allah akan mudahkan baginya jalan menuju surga.', sumber: 'HR. Muslim' },
      { teks: 'Didiklah anak-anakmu, karena mereka diciptakan untuk zaman yang berbeda dengan zamanmu.', sumber: 'Ali bin Abi Thalib' },
      { teks: 'Anak adalah amanah yang harus dijaga dan dididik dengan penuh cinta dan kesabaran.' },
      { teks: 'Setiap anak istimewa dengan caranya sendiri — tugas kita membantu potensinya bersinar.' },
      { teks: 'Pendidikan anak usia dini adalah pondasi yang akan menentukan bangunan masa depannya.' },
      { teks: 'Guru yang baik mengajar dengan ilmu, mendidik dengan hati.' },
    ];

    async function loadPengumumanWelcome() {
      // Pakai sumber data yang SAMA dengan marquee pengumuman di Dashboard
      // (koleksi 'pengumuman' di Firebase) - supaya admin cukup isi sekali
      // di menu Admin > Kelola Pengumuman, otomatis tampil di sini juga.
      // Layar ini tampil SEBELUM orang tua/guru pilih perannya, jadi cuma
      // tampilkan yang ditujukan untuk 'semua' atau khusus 'ortu' - supaya
      // pengumuman internal guru (rapat, deadline laporan, dll) tidak ikut
      // bocor ke layar publik ini.
      const container = document.getElementById('welcomePengumuman');
      if (!container) return;
      try {
        // ambil 20 terbaru dulu, baru difilter - supaya kalau beberapa yang
        // paling baru kebetulan semuanya 'guru', pengumuman 'ortu' yang agak
        // lama tetap ikut kesaring, bukan malah hilang duluan
        const snapshot = await db.ref('pengumuman').orderByChild('tanggal').limitToLast(20).once('value');
        const data = snapshot.val() || {};
        const list = Object.values(data)
          .filter(p => !p.target || p.target === 'semua' || p.target === 'ortu')
          .slice(-5);
        if (list.length === 0) {
          container.remove(); // tidak ada pengumuman -> tidak tampil sama sekali
          return;
        }
        const teksGabungan = list.map(p => `📢 ${escapeHtml(p.teks || '')}`).join('&nbsp;&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;&nbsp;');
        container.innerHTML = `<div class="marquee-content" style="animation:welcomeMarquee 18s linear infinite;white-space:nowrap;display:inline-block;padding-left:100%;">${teksGabungan}</div>`;
        container.style.display = 'block';
      } catch (error) {
        console.error('Error loading pengumuman welcome:', error);
        container.remove(); // gagal ambil data -> jangan tampilkan apa-apa (bukan pesan error)
      }
    }

    function initWelcomeScreen() {
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
      let lanjutkanHtml = '';
      try {
        const terakhir = JSON.parse(localStorage.getItem('portal_last_child') || 'null');
        if (terakhir?.studentId && localStorage.getItem(`portal_pin_verified_${terakhir.studentId}`)) {
          lanjutkanHtml = `<button class="btn btn-primary" style="width:100%;margin-bottom:10px;" onclick="lanjutkanPortalTerakhir()">↩️ Lanjutkan sebagai ${escapeHtml(terakhir.nama || 'Ananda')}</button>`;
        }
      } catch (e) { /* abaikan, localStorage rusak/kosong */ }

      // Pilih 1 kata-kata penyemangat secara acak setiap kali layar dibuka
      const kutipan = KATA_PENYEMANGAT[Math.floor(Math.random() * KATA_PENYEMANGAT.length)];
      const kutipanHtml = `
        <div style="text-align:center;max-width:420px;padding:0 20px;">
          <p style="color:rgba(255,255,255,0.9);font-size:13px;font-style:italic;line-height:1.6;">"${escapeHtml(kutipan.teks)}"</p>
          ${kutipan.sumber ? `<p style="color:rgba(255,255,255,0.6);font-size:11px;margin-top:4px;">— ${escapeHtml(kutipan.sumber)}</p>` : ''}
        </div>`;

      // Pola geometris halus (SVG inline) sebagai tekstur background, supaya
      // tidak polos tapi tetap ringan (tidak perlu file gambar tambahan).
      // Motif dekoratif tema anak/islami (bintang, bulan sabit, buku) sebagai
      // tekstur background - dibuat sendiri (SVG asli, bukan foto berhak
      // cipta), transparansi rendah supaya tidak ganggu keterbacaan kartu putih.
      const polaBackground = `data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27170%27%20height%3D%27170%27%20viewBox%3D%270%200%20170%20170%27%3E%3Ctext%20x%3D%2710%27%20y%3D%2740%27%20font-size%3D%2732%27%20opacity%3D%270.16%27%3E%E2%AD%90%3C/text%3E%3Ctext%20x%3D%2790%27%20y%3D%2725%27%20font-size%3D%2728%27%20opacity%3D%270.15%27%3E%F0%9F%8C%99%3C/text%3E%3Ctext%20x%3D%27135%27%20y%3D%2765%27%20font-size%3D%2730%27%20opacity%3D%270.16%27%3E%F0%9F%93%96%3C/text%3E%3Ctext%20x%3D%2725%27%20y%3D%2790%27%20font-size%3D%2726%27%20opacity%3D%270.15%27%3E%E2%9C%8F%EF%B8%8F%3C/text%3E%3Ctext%20x%3D%2770%27%20y%3D%27115%27%20font-size%3D%2730%27%20opacity%3D%270.16%27%3E%E2%AD%90%3C/text%3E%3Ctext%20x%3D%27120%27%20y%3D%27140%27%20font-size%3D%2728%27%20opacity%3D%270.15%27%3E%F0%9F%93%9A%3C/text%3E%3Ctext%20x%3D%2710%27%20y%3D%27150%27%20font-size%3D%2726%27%20opacity%3D%270.14%27%3E%F0%9F%8C%99%3C/text%3E%3Ctext%20x%3D%27150%27%20y%3D%27155%27%20font-size%3D%2724%27%20opacity%3D%270.15%27%3E%E2%9C%A8%3C/text%3E%3C/svg%3E`;

      const html = `
      <style>@keyframes welcomeMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }</style>
      <div id="welcomeScreen" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;background:linear-gradient(135deg,#0f3b2c 0%,#1a5c3e 100%);background-image:url('${polaBackground}'), linear-gradient(135deg,#0f3b2c 0%,#1a5c3e 100%);padding:20px;">
        <div style="text-align:center;color:#fff;margin-bottom:18px;padding:0 16px;max-width:480px;">
          <h2 style="font-size:25px;font-weight:800;margin-bottom:4px;">Assalamu'alaikum 👋</h2>
          <p style="color:rgba(255,255,255,0.85);margin-bottom:2px;">${sapaanWaktu()}, selamat datang di</p>
          <p style="color:#fff;font-weight:700;">${escapeHtml(namaSekolah)}</p>
        </div>
        <div style="background-color:white;background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:14px 14px, calc(100% - 14px) 14px, 14px calc(100% - 14px), calc(100% - 14px) calc(100% - 14px);background-size:20px 20px;padding:44px 36px;border-radius:24px;max-width:480px;width:100%;box-shadow:0 0 0 2px #0f3b2c, 0 0 0 6px #fff, 0 0 0 7px #c9a227, 0 20px 60px rgba(0,0,0,0.3);text-align:center;">
          <div style="width:100px;height:100px;border-radius:16px;background:linear-gradient(135deg,#0f3b2c,#1a5c3e);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;overflow:hidden;">
            <img src="logo/logo-lembaga.png" alt="Logo" style="width:92%;height:92%;object-fit:contain;" onerror="this.onerror=null; var p=this.parentElement; p.innerHTML='🧸'; p.style.fontSize='48px'; p.style.color='white';">
          </div>
          <div id="welcomePengumuman" class="marquee-container" style="display:none;margin-bottom:16px;border-radius:12px;overflow:hidden;background:#fef3c7;padding:8px 12px;color:#92400e;font-size:12px;font-weight:600;"></div>
          ${lanjutkanHtml}
          <button class="btn btn-primary" style="width:100%;margin-bottom:10px;padding:14px;font-size:15px;" onclick="document.getElementById('welcomeScreen').remove(); initLoginPage();"><i data-lucide="graduation-cap" style="width:16px;height:16px;vertical-align:-3px;margin-right:2px;"></i> Saya Guru / Staf</button>
          <button class="btn" style="width:100%;padding:14px;font-size:15px;background:#f0fdf4;color:#065f46;border:2px solid #bbf7d0;" onclick="mulaiPortalOrtu()"><i data-lucide="users" style="width:16px;height:16px;vertical-align:-3px;margin-right:2px;"></i> Saya Orang Tua</button>
        </div>
        <div style="margin-top:20px;">${kutipanHtml}</div>
        <div id="welcomeInfoSekolah" style="text-align:center;color:rgba(255,255,255,0.85);font-size:12px;margin-top:22px;line-height:1.7;padding:0 16px;"></div>
      </div>`;
      document.body.insertAdjacentHTML('afterbegin', html);
      if (typeof lucide !== 'undefined') lucide.createIcons();
      loadPengumumanWelcome();
      loadInfoSekolahWelcome();
    }

    // Info singkat sekolah (alamat/telp/visi) di bawah kartu layar sambutan,
    // supaya area hijau di bawah kartu tidak kosong. Diambil langsung dari
    // node 'profil' Firebase (bukan window.__profilSekolah, karena data itu
    // biasanya baru terisi SETELAH login - di layar ini belum tentu ada).
    async function loadInfoSekolahWelcome() {
      const container = document.getElementById('welcomeInfoSekolah');
      if (!container) return;
      try {
        const snap = await db.ref('profil').once('value');
        const data = snap.val() || {};
        const baris = [];
        if (data.alamat) baris.push(`<p><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:-1px;"></i> ${escapeHtml(data.alamat)}</p>`);
        if (data.telp) baris.push(`<p><i data-lucide="phone" style="width:12px;height:12px;vertical-align:-1px;"></i> ${escapeHtml(data.telp)}</p>`);
        if (data.visi) baris.push(`<p style="font-style:italic;margin-top:6px;color:rgba(255,255,255,0.7);">"${escapeHtml(data.visi)}"</p>`);
        if (baris.length === 0) { container.remove(); return; }
        container.innerHTML = baris.join('');
      } catch (error) {
        console.error('Error loading info sekolah welcome:', error);
        container.remove(); // gagal ambil data -> jangan tampilkan apa-apa
      }
    }

    function tampilkanKerangkaPortal() {
      const html = `
      <div id="portalOrtuScreen" style="min-height:100vh;min-height:100dvh;background:linear-gradient(135deg,#0f3b2c 0%,#1a5c3e 100%);padding:16px;padding-bottom:calc(74px + env(safe-area-inset-bottom));">
        <div style="max-width:480px;margin:0 auto;">
          <div style="text-align:center;color:white;padding:24px 0 16px;">
            <div style="width:70px;height:70px;border-radius:16px;background:linear-gradient(135deg,#0f3b2c,#1a5c3e);display:flex;align-items:center;justify-content:center;margin:0 auto;overflow:hidden;">
              <img src="logo/logo-lembaga.png" alt="Logo lembaga" style="width:92%;height:92%;object-fit:contain;" onerror="this.onerror=null; var p=this.parentElement; p.innerHTML='🧸'; p.style.fontSize='34px'; p.style.color='white';">
            </div>
            <h2 style="font-weight:800;margin-top:4px;">Portal Orang Tua</h2>
          </div>
          <div id="portalOrtuContent" style="background-color:white;background-image:url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E'),url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 40 40%27%3E%3Cpath d=%27M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z%27 fill=%27none%27 stroke=%27%23c9a227%27 stroke-width=%272%27/%3E%3C/svg%3E');background-repeat:no-repeat;background-position:14px 14px, calc(100% - 14px) 14px, 14px calc(100% - 14px), calc(100% - 14px) calc(100% - 14px);background-size:20px 20px;border-radius:20px;padding:24px;box-shadow:0 0 0 2px #0f3b2c, 0 0 0 6px #fff, 0 0 0 7px #c9a227, 0 20px 60px rgba(0,0,0,0.25);">
            <div style="text-align:center;padding:30px 0;color:#6b7280;">⏳ Memuat...</div>
          </div>
        </div>
      </div>
      <nav class="portal-bottom-nav" aria-label="Loncat ke bagian">
        <div class="portal-bottom-nav-inner">
          <button class="portal-bottom-nav-item" data-target-sec="portalSecHadir" aria-label="Kehadiran">
            <span class="bn-icon"><i data-lucide="check-circle-2"></i></span><span>Hadir</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecNilai" aria-label="Perkembangan/Nilai">
            <span class="bn-icon"><i data-lucide="sprout"></i></span><span>Nilai</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecCatatan" aria-label="Catatan Guru">
            <span class="bn-icon"><i data-lucide="sticky-note"></i></span><span>Catatan</span>
          </button>
          <button class="portal-bottom-nav-item" data-target-sec="portalSecInfaq" aria-label="Infaq">
            <span class="bn-icon"><i data-lucide="wallet"></i></span><span>Infaq</span>
          </button>
        </div>
      </nav>`;
      document.body.insertAdjacentHTML('afterbegin', html);
      if (typeof lucide !== 'undefined') lucide.createIcons();

      // Loncat-scroll ke section yang dipilih. Dicek berkala karena isi
      // section (id-id di atas) baru ada setelah tampilkanDataPortal()
      // selesai memuat data dari Firebase (async), bukan langsung saat
      // kerangka ini dibuat.
      document.querySelectorAll('.portal-bottom-nav-item[data-target-sec]').forEach(tombol => {
        tombol.addEventListener('click', () => {
          const target = document.getElementById(tombol.dataset.targetSec);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.querySelectorAll('.portal-bottom-nav-item').forEach(t => t.classList.remove('active'));
            tombol.classList.add('active');
          }
        });
      });
    }

    function lanjutkanPortalTerakhir() {
      try {
        const terakhir = JSON.parse(localStorage.getItem('portal_last_child') || 'null');
        if (!terakhir?.studentId) return;
        const buktiTersimpan = localStorage.getItem(`portal_pin_verified_${terakhir.studentId}`);
        document.getElementById('welcomeScreen')?.remove();
        tampilkanKerangkaPortal();
        db.ref(`students/${terakhir.studentId}`).once('value').then(snap => {
          const student = snap.val();
          const content = document.getElementById('portalOrtuContent');
          if (!student) { content.innerHTML = `<div style="text-align:center;padding:10px;">Data tidak ditemukan. Silakan cari ulang.</div><button class="btn" style="width:100%;margin-top:10px;" onclick="mulaiPortalOrtu()">Cari Nomor WA</button>`; return; }
          // Cek ulang ke server: kalau admin sudah reset PIN Portal sejak
          // terakhir kali HP ini verifikasi (hash di server sudah beda/hilang),
          // jangan langsung tampilkan data — minta verifikasi ulang.
          if (buktiTersimpan && student.portal_pin_hash && buktiTersimpan === student.portal_pin_hash) {
            tampilkanDataPortal(student, terakhir.studentId);
          } else {
            tampilkanFormPinPortal(terakhir.studentId, student);
          }
        });
      } catch (error) { console.error('Error lanjutkan portal terakhir:', error); }
    }

    function mulaiPortalOrtu() {
      document.getElementById('welcomeScreen')?.remove();
      if (!document.getElementById('portalOrtuScreen')) tampilkanKerangkaPortal();
      const content = document.getElementById('portalOrtuContent');
      content.innerHTML = `
        <div style="text-align:center;padding:10px 0;">
          <div style="font-size:44px;">👪</div>
          <h3 style="font-weight:700;margin-bottom:6px;">Cari Data Ananda</h3>
          <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Masukkan nomor WhatsApp yang terdaftar di sekolah.</p>
          <input type="tel" id="cariWaInput" class="field" placeholder="Contoh: 081234567890" style="text-align:center;font-size:16px;margin-bottom:10px;" inputmode="numeric">
          <div id="cariWaError" style="color:#dc2626;font-size:12px;margin-bottom:10px;display:none;"></div>
          <button class="btn btn-primary" style="width:100%;margin-bottom:8px;" onclick="cariAnakByWA()">Cari</button>
          <button class="btn" style="width:100%;background:#f3f4f6;" onclick="document.getElementById('portalOrtuScreen')?.remove(); document.querySelector('.portal-bottom-nav')?.remove(); initWelcomeScreen();">← Kembali</button>
        </div>`;
      const inputEl = document.getElementById('cariWaInput');
      if (inputEl) { inputEl.focus(); inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') cariAnakByWA(); }); }
    }

    async function cariAnakByWA() {
      const input = document.getElementById('cariWaInput');
      const errBox = document.getElementById('cariWaError');
      const nomor = input ? input.value.trim() : '';
      if (errBox) errBox.style.display = 'none';
      if (!nomor) { if (errBox) { errBox.textContent = 'Masukkan nomor WA dulu.'; errBox.style.display = 'block'; } return; }
      const norm = normalisasiNomorWA(nomor);
      const content = document.getElementById('portalOrtuContent');
      content.innerHTML = `<div style="text-align:center;padding:30px 0;color:#6b7280;">⏳ Mencari...</div>`;
      try {
        const snap = await db.ref('students').orderByChild('no_wa_ortu_norm').equalTo(norm).once('value');
        const hasil = snap.val() || {};
        const daftar = Object.entries(hasil);
        if (daftar.length === 0) {
          content.innerHTML = `
            <div style="text-align:center;padding:10px 0;">
              <div style="font-size:44px;">🔍</div>
              <h3 style="font-weight:700;margin-bottom:6px;">Nomor Tidak Ditemukan</h3>
              <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Nomor WA ini belum terdaftar di data sekolah. Hubungi pihak sekolah untuk mendaftarkan/memperbarui nomor WA Anda.</p>
              <button class="btn" style="width:100%;" onclick="mulaiPortalOrtu()">Coba Nomor Lain</button>
            </div>`;
          return;
        }
        if (daftar.length === 1) {
          const [id, student] = daftar[0];
          tampilkanFormPinPortal(id, student);
          return;
        }
        window.__portalKandidat = Object.fromEntries(daftar);
        content.innerHTML = `
          <div style="padding:10px 0;">
            <h3 style="font-weight:700;text-align:center;margin-bottom:12px;">Pilih Ananda</h3>
            ${daftar.map(([id, s]) => `<button class="btn" style="width:100%;margin-bottom:8px;text-align:left;" onclick="tampilkanFormPinPortalById('${id}')">${escapeHtml(s.nama || '-')} <span style="color:#9ca3af;font-size:12px;">(Kelas ${escapeHtml(s.kelas || '-')})</span></button>`).join('')}
            <button class="btn" style="width:100%;background:#f3f4f6;" onclick="mulaiPortalOrtu()">← Kembali</button>
          </div>`;
      } catch (error) {
        console.error('Error mencari siswa by WA:', error);
        content.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">❌</div><h3 style="font-weight:700;">Terjadi Kesalahan</h3><p style="color:#6b7280;font-size:13px;">Silakan coba lagi.</p></div>`;
      }
    }

    function tampilkanFormPinPortalById(studentId) {
      const student = window.__portalKandidat?.[studentId];
      if (!student) return;
      tampilkanFormPinPortal(studentId, student);
    }

    function tampilkanFormPinPortal(studentId, student) {
      const content = document.getElementById('portalOrtuContent');
      const sudahAdaPin = !!student.portal_pin_hash;
      if (sudahAdaPin) {
        content.innerHTML = `
          <div style="text-align:center;padding:10px 0;">
            <div style="font-size:44px;">🔒</div>
            <h3 style="font-weight:700;margin-bottom:4px;">${escapeHtml(student.nama || '-')}</h3>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Masukkan PIN Portal Anda.</p>
            <input type="password" id="pinPortalInput" maxlength="6" style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:12px;font-size:18px;text-align:center;letter-spacing:8px;" placeholder="••••••" inputmode="numeric">
            <div id="pinPortalError" style="color:#dc2626;font-size:12px;margin:8px 0;display:none;">PIN salah. Coba lagi atau hubungi sekolah untuk reset.</div>
            <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="verifikasiPinPortal('${studentId}')">Masuk</button>
            <button class="btn" style="width:100%;background:#f3f4f6;margin-top:8px;" onclick="mulaiPortalOrtu()">← Kembali</button>
          </div>`;
      } else {
        content.innerHTML = `
          <div style="text-align:center;padding:10px 0;">
            <div style="font-size:44px;">🆕</div>
            <h3 style="font-weight:700;margin-bottom:4px;">${escapeHtml(student.nama || '-')}</h3>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">Ini pertama kali Anda akses portal untuk ananda ini. Buat PIN Portal (4-6 digit) untuk akses selanjutnya — PIN ini yang jaga privasi data ananda, jangan dibagikan.</p>
            <input type="password" id="pinBaruInput" maxlength="6" style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:12px;font-size:18px;text-align:center;letter-spacing:8px;margin-bottom:10px;" placeholder="PIN baru" inputmode="numeric">
            <input type="password" id="pinKonfirmasiInput" maxlength="6" style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:12px;font-size:18px;text-align:center;letter-spacing:8px;" placeholder="Ulangi PIN" inputmode="numeric">
            <div id="pinBaruError" style="color:#dc2626;font-size:12px;margin:8px 0;display:none;"></div>
            <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="buatPinPortalBaru('${studentId}')">Buat &amp; Masuk</button>
            <button class="btn" style="width:100%;background:#f3f4f6;margin-top:8px;" onclick="mulaiPortalOrtu()">← Kembali</button>
          </div>`;
      }
      const firstInput = document.getElementById(sudahAdaPin ? 'pinPortalInput' : 'pinBaruInput');
      if (firstInput) firstInput.focus();
    }

    async function verifikasiPinPortal(studentId) {
      const input = document.getElementById('pinPortalInput');
      const errBox = document.getElementById('pinPortalError');
      const pin = input ? input.value.trim() : '';
      if (errBox) errBox.style.display = 'none';
      try {
        const snap = await db.ref(`students/${studentId}`).once('value');
        const student = snap.val();
        if (!student || !student.portal_pin_hash) { if (errBox) { errBox.textContent = 'Data tidak ditemukan.'; errBox.style.display = 'block'; } return; }
        const hashInput = await hashPin(pin, student.portal_pin_salt);
        if (hashInput === student.portal_pin_hash) {
          localStorage.setItem(`portal_pin_verified_${studentId}`, student.portal_pin_hash);
          localStorage.setItem('portal_last_child', JSON.stringify({ studentId, nama: student.nama || '' }));
          await tampilkanDataPortal(student, studentId);
        } else if (errBox) {
          errBox.style.display = 'block';
        }
      } catch (error) {
        console.error('Error verifying portal PIN:', error);
        if (errBox) { errBox.textContent = 'Terjadi kesalahan, coba lagi.'; errBox.style.display = 'block'; }
      }
    }

    async function buatPinPortalBaru(studentId) {
      const pinBaru = document.getElementById('pinBaruInput')?.value.trim() || '';
      const pinKonfirmasi = document.getElementById('pinKonfirmasiInput')?.value.trim() || '';
      const errBox = document.getElementById('pinBaruError');
      if (errBox) errBox.style.display = 'none';
      if (!validatePIN(pinBaru)) { if (errBox) { errBox.textContent = 'PIN harus 4-6 digit angka.'; errBox.style.display = 'block'; } return; }
      if (pinBaru !== pinKonfirmasi) { if (errBox) { errBox.textContent = 'Konfirmasi PIN tidak sama.'; errBox.style.display = 'block'; } return; }
      try {
        const { pin_salt, pin_hash } = await buatPinHashBaru(pinBaru);
        // Transaksi: cegah race condition kalau 2 tab/HP mencoba buat PIN
        // pertama kali untuk anak yang sama secara bersamaan.
        const result = await db.ref(`students/${studentId}`).transaction(currentData => {
          if (currentData === null) return currentData;
          if (currentData.portal_pin_hash) return; // sudah ada yang buat duluan -> batalkan
          currentData.portal_pin_salt = pin_salt;
          currentData.portal_pin_hash = pin_hash;
          return currentData;
        });
        if (!result.committed) {
          const snap = await db.ref(`students/${studentId}`).once('value');
          tampilkanFormPinPortal(studentId, snap.val());
          showToast('PIN portal untuk ananda ini baru saja dibuat (mungkin dari HP lain). Silakan masukkan PIN tersebut.', 'info');
          return;
        }
        const student = result.snapshot.val();
        localStorage.setItem(`portal_pin_verified_${studentId}`, student.portal_pin_hash);
        localStorage.setItem('portal_last_child', JSON.stringify({ studentId, nama: student.nama || '' }));
        await tampilkanDataPortal(student, studentId);
      } catch (error) {
        console.error('Error creating portal PIN:', error);
        if (errBox) { errBox.textContent = 'Gagal membuat PIN, coba lagi.'; errBox.style.display = 'block'; }
      }
    }

    async function refreshUserList() {
      showLoading(true, 'Memuat daftar user...');
      await loadUsersForLogin();
      showLoading(false);
      showToast('✅ Daftar user diperbarui', 'success');
    }

    // createDefaultUser() DIHAPUS (keamanan): dulu fungsi ini bisa dipanggil
    // siapa pun dari halaman login TANPA login sama sekali, dan langsung
    // membuat akun admin dengan PIN "123456" yang diketahui publik. Kalau
    // Anda butuh membuat akun admin pertama, lakukan manual lewat Firebase
    // Console -> Realtime Database -> node "users" -> Add child, dengan
    // struktur: { nama, pin: "<PIN pilihan Anda, bukan 123456>", role: "admin" }.

    async function doLogin() {
      const pin = document.getElementById('pinInput').value.trim();
      const select = document.getElementById('loginUserSelect');
      const btn = document.getElementById('loginBtn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }
      const userId = select ? select.value : '';
      if (!userId) {
        showToast('Pilih user dulu sebelum login!', 'warning');
        if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
        return;
      }
      if (!pin || pin.length < 4) {
        showToast('Masukkan PIN minimal 4 digit', 'warning');
        if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
        return;
      }
      if (!validatePIN(pin)) {
        showToast('PIN harus 4-6 digit angka!', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
        return;
      }
      await loginWithPIN(pin, userId);
      if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
    }

