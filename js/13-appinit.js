    // ============================================================
    // GLOBAL FUNCTIONS
    // ============================================================
    function installApp() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choice => {
          if (choice.outcome === 'accepted') { showToast('Aplikasi berhasil diinstall!', 'success'); }
          deferredPrompt = null;
        });
      }
    }

    function refreshAllData() { showToast('🔄 Merefresh data...', 'info'); showPage(currentPage); }

    function showDebug() {
      alert(`SI MAMBA v3.1-RA (SECURE)\nUser: ${currentUser?.nama || 'Not logged in'}\nRole: ${currentRole || 'None'}\nFirebase: ${isFirebaseConnected ? '✅ Online' : '❌ Offline'}\nPage: ${currentPage}`);
    }

    function manualBackup() {
      // Backup = salinan SELURUH database (termasuk hash PIN & data siswa). Hanya admin.
      if (currentRole !== 'admin') {
        showToast('⛔ Backup hanya untuk admin', 'error');
        return;
      }
      showToast('💾 Membackup data...', 'info');
      // db.ref().once('value') di ROOT sudah tidak diizinkan lagi oleh Firebase
      // Rules (lihat rules.json) - baca per node lewat bacaSeluruhDatabase().
      bacaSeluruhDatabase().then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-si-mamba-${getToday()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup berhasil!', 'success');
      }).catch(err => { showToast('Gagal backup: ' + err.message, 'error'); });
    }

    // ============================================================
    // INIT APP
    // ============================================================
    function initApp() {
      if (typeof hideBootSplash === 'function') hideBootSplash(); // hapus layar awal begitu app siap
      const checkinParams = new URLSearchParams(window.location.search);
      const isQRCheckin = checkinParams.get('checkin') === 'guru';
      if (isQRCheckin) window.__qrCheckinPending = true;
      const isPortalOrtu = checkinParams.get('portal') === '1';
      if (isPortalOrtu) {
        const sid = checkinParams.get('sid');
        const token = checkinParams.get('token');
        initPortalOrangTua(sid, token);
        return;
      }

      if (darkMode) {
        document.body.classList.add('dark-mode');
        const dt = document.querySelector('.dark-toggle');
        if (dt) dt.textContent = '☀️';
      }

      const statusEl = document.getElementById('firebaseStatus');
      updateOfflineIndicator(); // tampilkan kalau ada antrian offline tersisa dari sesi sebelumnya
      db.ref('.info/connected').on('value', snap => {
        isFirebaseConnected = snap.val() || false;
        if (statusEl) {
          statusEl.textContent = isFirebaseConnected ? '✅ Online' : '❌ Offline';
          statusEl.className = `status-badge ${isFirebaseConnected ? '' : 'disconnected'}`;
        }
        const loginStatus = document.getElementById('loginStatus');
        if (loginStatus) {
          loginStatus.textContent = isFirebaseConnected ? '✅ Terhubung ke Firebase' : '❌ Gagal terhubung ke Firebase';
          loginStatus.style.color = isFirebaseConnected ? '#059669' : '#dc2626';
        }
        if (isFirebaseConnected) {
          loadUsersForLogin();
          if (!isQRCheckin) flushOfflineQueue(true); // koneksi Firebase pulih -> coba kirim antrian tertunda
        }
      });

      // Absen Guru via QR: WAJIB login ke akun sendiri dulu sebelum bisa absen
      // mandiri. Kalau sesi login masih tersimpan (auto-login), langsung lanjut
      // ke layar absen; kalau belum, tampilkan form login dulu.
      if (isQRCheckin) {
        if (checkAutoLogin(true)) {
          initQRCheckinScreen();
        } else {
          initLoginPage();
          setTimeout(loadUsersForLogin, 1000);
        }
        return;
      }

      document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
        item.addEventListener('click', function() { showPage(this.dataset.page); });
      });

      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        const ib = document.getElementById('installBtn');
        if (ib) ib.style.display = 'flex';
      });

      window.addEventListener('appinstalled', () => {
        const ib = document.getElementById('installBtn');
        if (ib) ib.style.display = 'none';
      });

      // Diberi guard: kalau salah satu elemen tidak ada, initApp jangan mati di tengah
      // (akibatnya layar sambutan tidak pernah muncul).
      ['rekapBulan', 'honorPeriode', 'laporanPeriode'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = getMonth();
      });

      if (!checkAutoLogin()) {
        initWelcomeScreen();
      } else {
        loadTahunAjaran();
        // Load data guru setelah login
        setTimeout(loadTeacherAttendance, 2000);
      }
    }

    // Catatan: initApp() TIDAK dipanggil langsung di sini lagi. Dia dipicu
    // oleh __cobaMulaiApp() di atas, setelah DOM siap DAN auth anonim
    // selesai — lihat blok "FIREBASE ANONYMOUS AUTH" dekat firebaseConfig.
    document.addEventListener('DOMContentLoaded', () => { __domReady = true; __cobaMulaiApp(); });
