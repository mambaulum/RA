    // ============================================================
    // NAVIGATION
    // ============================================================
    function showPage(page) {
      // Infaq: akses per-akun (petugas yang ditunjuk admin), bukan per-role -
      // dicek terpisah dari ROLE_PAGES di bawah.
      if (page === 'infaq') {
        if (!canAccessInfaq()) {
          showToast('⛔ Anda bukan petugas Infaq. Hubungi admin untuk ditunjuk sebagai petugas.', 'error');
          showPage('dashboard');
          return;
        }
      } else {
        // Guard akses: pastikan role yang login memang boleh membuka halaman
        // ini, bukan cuma mengandalkan menu di sidebar disembunyikan (menu
        // sembunyi bisa dilewati dengan memanggil showPage() langsung dari
        // console browser).
        const allowedForRole = ROLE_PAGES[currentRole] || ROLE_PAGES.guru;
        if (!allowedForRole.includes(page)) {
          showToast('⛔ Anda tidak punya akses ke halaman ini', 'error');
          if (page !== 'dashboard') { showPage('dashboard'); }
          return;
        }
      }
      currentPage = page;
      document.querySelectorAll('.page-content').forEach(el => el.style.display = 'none');
      const target = document.getElementById(`page-${page}`);
      if (target) target.style.display = 'block';
      document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
      });
      const titles = {
        dashboard: 'Dashboard', profil: 'Profil RA', students: 'Data Siswa', subjects: 'Aspek Perkembangan',
        attendance: 'Absensi', infaq: 'Infaq', grades: 'Nilai', anekdot: 'Catatan Anekdot', 'rapor-narasi': 'Rapor Narasi', journal: 'Jurnal Mengajar', 'teacher-attendance': 'Absen Guru', 'buku-induk': 'Buku Induk',
        'riwayat-absen-saya': 'Riwayat Absen Saya',
        rekap: 'Rekap', 'rekap-nilai': 'Rekap Nilai', honor: 'Honor', surat: 'Surat & Ijin',
        jadwal: 'Jadwal', 'kalender-akademik': 'Kalender Akademik', promotion: 'Kenaikan Kelas', alumni: 'Alumni', 'setting-jam': 'Setting Jam',
        laporan: 'Laporan', 'user-management': 'Manajemen User', admin: 'Admin'
      };
      const titleEl = document.getElementById('pageTitle');
      if (titleEl) {
        titleEl.innerHTML = `${titles[page] || page} <small>${page === 'dashboard' ? 'Ringkasan Hari Ini' : ''}</small>`;
      }
      const loaders = {
        dashboard: loadDashboard, profil: loadProfil, students: loadStudents, subjects: loadSubjects,
        attendance: loadAttendance, infaq: loadInfaq, grades: loadGrades, anekdot: loadAnekdot, 'rapor-narasi': loadRaporNarasi, journal: loadJournal, 'buku-induk': loadBukuInduk,
        'teacher-attendance': loadTeacherAttendance, rekap: loadRekap, 'rekap-nilai': loadRekapNilai,
        'riwayat-absen-saya': loadRiwayatAbsenSaya,
        honor: loadHonor, surat: loadSurat, jadwal: loadJadwal, 'kalender-akademik': loadKalenderAkademik, promotion: loadPromotion, alumni: loadAlumni,
        'setting-jam': loadSettingJam, laporan: loadLaporan, 'user-management': loadUserManagement, admin: loadAdmin
      };
      startPageProgress();
      const loaderResult = loaders[page] ? loaders[page]() : null;
      Promise.resolve(loaderResult).finally(finishPageProgress);
      if (window.innerWidth <= 768) toggleSidebar();
    }

    // ============================================================
    // DASHBOARD
    // ============================================================
    async function loadDashboard() {
      showLoading(true, 'Memuat dashboard...');
      try {
        const today = getToday();
        const myKelas = await getMyKelasDiampu(); // null = admin/kepsek (lihat gabungan semua kelas)
        const [studentsSnap, attendanceSnap, teachersSnap, jadwalSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('attendance').orderByKey().startAt(getTanggalMundur(35)).once('value'), // 30 hari chart + buffer, bukan seluruh histori
          db.ref('teachers').once('value'),
          db.ref('jadwal').once('value')
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        const attendanceAll = attendanceSnap.val() || {};
        const teachers = teachersSnap.val() || {};
        let jadwal = jadwalSnap.val() || {};
        if (myKelas) jadwal = Object.fromEntries(Object.entries(jadwal).filter(([, j]) => myKelas.includes(j.kelas)));
        const totalStudents = Object.keys(students).length;
        const totalTeachers = Object.keys(teachers).length;
        const btnQRGuru = document.getElementById('btnDashboardQRGuru');
        if (btnQRGuru) btnQRGuru.style.display = (currentRole === 'admin') ? 'flex' : 'none';
        const btnAbsenMandiri = document.getElementById('btnDashboardAbsenMandiri');
        if (btnAbsenMandiri) btnAbsenMandiri.style.display = currentUser?.teacher_id ? 'flex' : 'none';
        const dashboardScopeNote = document.getElementById('dashboardScopeNote');
        if (dashboardScopeNote) dashboardScopeNote.style.display = myKelas ? 'block' : 'none';
        if (dashboardScopeNote && myKelas) dashboardScopeNote.textContent = `📌 Menampilkan data Kelas ${myKelas.join(', ')} saja (kelas yang Anda ampu)`;
        let hadir = 0, sakit = 0, izin = 0, alpa = 0;
        if (attendanceAll[today]) {
          Object.entries(attendanceAll[today]).forEach(([studentId, record]) => {
            if (myKelas && !students[studentId]) return; // siswa di luar kelas yang diampu -> lewati
            if (record.status === 'H') hadir++;
            else if (record.status === 'S') sakit++;
            else if (record.status === 'I') izin++;
            else if (record.status === 'A') alpa++;
          });
        }
        const totalAbsen = hadir + sakit + izin + alpa;
        const persenHadir = totalAbsen > 0 ? Math.round((hadir / totalAbsen) * 100) : 0;
        document.getElementById('statTotalSiswa').textContent = totalStudents;
        document.getElementById('statHadir').textContent = hadir;
        document.getElementById('statPersenHadir').textContent = `${persenHadir}%`;
        document.getElementById('statGuru').textContent = currentRole === 'admin' ? totalTeachers : '-';
        document.getElementById('statusHadir').textContent = hadir;
        document.getElementById('statusSakit').textContent = sakit;
        document.getElementById('statusIzin').textContent = izin;
        document.getElementById('statusAlpa').textContent = alpa;
        await loadPengumumanMarquee();
        renderChartKehadiranBulanan(attendanceAll, myKelas ? students : null);
        const kepsekSection = document.getElementById('dashboardKepsekSection');
        if (kepsekSection) {
          const bolehLihat = currentRole === 'admin' || currentRole === 'kepsek';
          kepsekSection.style.display = bolehLihat ? 'block' : 'none';
          if (bolehLihat) loadDashboardKepsekMonitoring(teachers, totalStudents, attendanceAll);
        }
        const todayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()];
        const jadwalList = document.getElementById('dashboardJadwalList');
        const todayJadwal = Object.entries(jadwal).filter(([key, val]) => val.hari === todayName);
        if (jadwalList) {
          if (todayJadwal.length === 0) {
            jadwalList.innerHTML = '<div style="text-align:center;padding:12px;color:#6b7280;">Tidak ada jadwal hari ini</div>';
          } else {
            jadwalList.innerHTML = todayJadwal.map(([key, val]) => `
              <div style="padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:4px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                <span><strong>${escapeHtml(val.kelas || '-')}</strong> - ${escapeHtml(val.mapel || '-')}</span>
                <span style="color:#6b7280;font-size:12px;">👨‍🏫 ${escapeHtml(val.guru || '-')}</span>
              </div>
            `).join('');
          }
        }
        showLoading(false);
      } catch (error) {
        console.error('Dashboard error:', error);
        showToast('Gagal memuat dashboard', 'error');
        showLoading(false);
      }
    }

    async function loadDashboardKepsekMonitoring(teachers, totalStudentsGlobal, attendanceAll) {
      try {
        const today = getToday();
        const periode = getMonth();
        const periode6BulanLalu = getPeriodeMundur(periode, 5); // 6 bulan termasuk bulan ini
        const [teacherAttendanceSnap, infaqSnap] = await Promise.all([
          db.ref('teacher_attendance').orderByKey().startAt(getTanggalMundur(190)).once('value'), // ~6 bulan + buffer, bukan seluruh histori
          db.ref('infaq').orderByKey().startAt(periode6BulanLalu).once('value')
        ]);
        const teacherAttendance = teacherAttendanceSnap.val() || {};
        const infaqAll = infaqSnap.val() || {};
        const totalTeachers = Object.keys(teachers).length;

        // Guru Hadir Hari Ini
        const todayRecords = teacherAttendance[today] || {};
        const guruHadirHariIni = Object.values(todayRecords).filter(r => r.datang).length;
        const elGuruHadir = document.getElementById('kepsekGuruHadirHariIni');
        if (elGuruHadir) elGuruHadir.textContent = `${guruHadirHariIni}/${totalTeachers}`;

        // Guru Telat Bulan Ini + breakdown per guru untuk "Guru Perlu Perhatian"
        let totalTelatBulanIni = 0;
        const telatPerGuru = {};
        for (const [date, records] of Object.entries(teacherAttendance)) {
          if (!date.startsWith(periode)) continue;
          for (const [guruId, rec] of Object.entries(records)) {
            if (rec.datang?.telat) { totalTelatBulanIni++; telatPerGuru[guruId] = (telatPerGuru[guruId] || 0) + 1; }
          }
        }
        const elTelat = document.getElementById('kepsekGuruTelatBulanIni');
        if (elTelat) elTelat.textContent = totalTelatBulanIni;

        // Guru Perlu Perhatian: minimal 2 kali telat bulan ini, top 3 terbanyak.
        const topTelat = Object.entries(telatPerGuru).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const perhatianBox = document.getElementById('kepsekGuruPerhatianBox');
        const perhatianList = document.getElementById('kepsekGuruPerhatianList');
        if (perhatianBox && perhatianList) {
          if (topTelat.length > 0) {
            perhatianBox.style.display = 'block';
            perhatianList.innerHTML = topTelat.map(([guruId, count]) =>
              `<div>• ${escapeHtml(teachers[guruId]?.nama || guruId)} — ${count} kali telat</div>`
            ).join('');
          } else {
            perhatianBox.style.display = 'none';
          }
        }

        // Infaq Bulan Ini
        const infaqBulanIni = infaqAll[periode] || {};
        let totalInfaq = 0;
        Object.values(infaqBulanIni).forEach(studentWeeks => {
          Object.values(studentWeeks || {}).forEach(rec => { if (rec.paid) totalInfaq += rec.jumlah || 0; });
        });
        const elInfaq = document.getElementById('kepsekInfaqBulanIni');
        if (elInfaq) elInfaq.textContent = `Rp ${totalInfaq.toLocaleString('id-ID')}`;

        // % Kehadiran Siswa Bulan Ini (rata-rata harian bulan berjalan)
        let hadirBulan = 0, totalAbsenBulan = 0;
        for (const [date, records] of Object.entries(attendanceAll)) {
          if (!date.startsWith(periode)) continue;
          Object.values(records).forEach(r => { totalAbsenBulan++; if (r.status === 'H') hadirBulan++; });
        }
        const persenSiswaBulanIni = totalAbsenBulan > 0 ? Math.round((hadirBulan / totalAbsenBulan) * 100) : 0;
        const elPersen = document.getElementById('kepsekPersenSiswaBulanIni');
        if (elPersen) elPersen.textContent = `${persenSiswaBulanIni}%`;

        // Chart Tren Telat Guru - 6 bulan terakhir
        const canvasTelat = document.getElementById('chartTelatGuruBulanan');
        if (canvasTelat && typeof Chart !== 'undefined') {
          const labels = [], dataTelat = [];
          for (let i = 5; i >= 0; i--) {
            const d = new Date(`${periode}-01T00:00:00`);
            d.setMonth(d.getMonth() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            let count = 0;
            for (const [date, records] of Object.entries(teacherAttendance)) {
              if (!date.startsWith(key)) continue;
              Object.values(records).forEach(rec => { if (rec.datang?.telat) count++; });
            }
            labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }));
            dataTelat.push(count);
          }
          if (chartInstancesRegistry['chartTelatGuruBulanan']) chartInstancesRegistry['chartTelatGuruBulanan'].destroy();
          chartInstancesRegistry['chartTelatGuruBulanan'] = new Chart(canvasTelat.getContext('2d'), {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Kejadian Telat', data: dataTelat, backgroundColor: '#dc2626', borderRadius: 4, maxBarThickness: 40 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
          });
        }

        // Chart Tren Infaq - pakai ulang fungsi yang sama, canvas berbeda
        renderChartInfaqBulanan(periode, 'chartInfaqBulananKepsek');
      } catch (error) {
        console.error('Error loading dashboard kepsek monitoring:', error);
      }
    }

    // ============================================================
    // PENGUMUMAN
    // ============================================================
    let chartKehadiranInstance = null;
    let chartInstancesRegistry = {};

    function renderChartKehadiranBulanan(attendance, scopedStudents) {
      const canvas = document.getElementById('chartKehadiranBulanan');
      if (!canvas || typeof Chart === 'undefined') return;

      // Susun 30 hari terakhir (termasuk hari ini) + hitung jumlah hadir per hari.
      // scopedStudents (kalau ada) membatasi hitungan cuma ke siswa dari kelas
      // yang diampu - null berarti tidak dibatasi (admin/kepsek, lihat gabungan).
      const labels = [];
      const dataHadir = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const dayRecords = attendance[dateKey] || {};
        let hadirCount = 0;
        Object.entries(dayRecords).forEach(([studentId, r]) => {
          if (scopedStudents && !scopedStudents[studentId]) return;
          if (r.status === 'H') hadirCount++;
        });
        labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
        dataHadir.push(hadirCount);
      }

      if (chartKehadiranInstance) { chartKehadiranInstance.destroy(); }
      chartKehadiranInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Siswa Hadir',
            data: dataHadir,
            borderColor: '#0f3b2c',
            backgroundColor: 'rgba(15,59,44,0.12)',
            tension: 0.3,
            fill: true,
            pointRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    async function loadPengumumanMarquee() {
      try {
        const snapshot = await db.ref('pengumuman').orderByChild('tanggal').limitToLast(10).once('value');
        const data = snapshot.val() || {};
        // Dashboard ini dibuka oleh Guru/Staf yang sudah login, jadi cuma
        // tampilkan pengumuman untuk 'semua' atau khusus 'guru'. Pengumuman
        // lama (belum punya field target) dianggap 'semua' supaya tetap tampil.
        const allPengumuman = Object.entries(data)
          .map(([key, val]) => ({ ...val, id: key }))
          .filter(p => !p.target || p.target === 'semua' || p.target === 'guru');
        const container = document.getElementById('marqueeContent');
        if (!container) return;
        if (allPengumuman.length === 0) {
          container.innerHTML = '<div class="marquee-empty">📢 Belum ada pengumuman</div>';
          return;
        }
        container.innerHTML = allPengumuman.map(p => `
          <span class="marquee-item">
            <span class="badge ${escapeHtml(p.jenis || 'umum')}">${escapeHtml(p.jenis || 'UMUM')}</span>
            <span>${escapeHtml(p.teks || '')}</span>
            <span class="date-badge">${formatDate(p.tanggal)}</span>
          </span>
        `).join('');
      } catch (error) {
        console.error('Error loading pengumuman:', error);
      }
    }

