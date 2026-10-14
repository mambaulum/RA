    // ============================================================
    // KALENDER AKADEMIK
    // ============================================================
    const KATEGORI_KALENDER_LABEL = {
      libur_nasional: '🔴 Libur Nasional', libur_semester: '🟠 Libur Semester',
      kegiatan_sekolah: '🟢 Kegiatan Sekolah', ujian: '🔵 Ujian/Penilaian', hari_besar_agama: '🟣 Hari Besar Keagamaan'
    };
    const KATEGORI_KALENDER_WARNA = {
      libur_nasional: '#dc2626', libur_semester: '#d97706',
      kegiatan_sekolah: '#059669', ujian: '#2563eb', hari_besar_agama: '#7c3aed'
    };
    let kalenderAkademikCache = [];

    async function loadKalenderAkademik() {
      const isEditor = currentRole === 'admin' || currentRole === 'kepsek';
      const formBox = document.getElementById('kalenderAdminForm');
      if (formBox) formBox.style.display = isEditor ? 'block' : 'none';

      const bulanInput = document.getElementById('kalenderBulan');
      if (bulanInput && !bulanInput.value) bulanInput.value = getMonth();
      const periode = bulanInput?.value || getMonth();
      const tanggalInput = document.getElementById('kalenderTanggal');
      if (tanggalInput && !tanggalInput.value) tanggalInput.value = getToday();

      showLoading(true, 'Memuat kalender akademik...');
      try {
        const snap = await db.ref('kalender_akademik').orderByChild('tanggal').startAt(`${periode}-01`).endAt(`${periode}-31\uf8ff`).once('value');
        const data = snap.val() || {};
        kalenderAkademikCache = Object.entries(data).map(([id, k]) => ({ id, ...k })).sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
        renderKalenderAkademikList();
        showLoading(false);
      } catch (error) {
        console.error('Error loading kalender akademik:', error);
        showToast('Gagal memuat kalender akademik', 'error');
        showLoading(false);
      }
    }

    function renderKalenderAkademikList() {
      const container = document.getElementById('kalenderAkademikList');
      if (!container) return;
      const isEditor = currentRole === 'admin' || currentRole === 'kepsek';
      const filterKategori = document.getElementById('kalenderFilterKategori')?.value || '';
      let filtered = kalenderAkademikCache;
      if (filterKategori) filtered = filtered.filter(k => k.kategori === filterKategori);

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Belum ada kegiatan di bulan ini</div>';
        return;
      }
      container.innerHTML = filtered.map(k => {
        const warna = KATEGORI_KALENDER_WARNA[k.kategori] || '#6b7280';
        const label = KATEGORI_KALENDER_LABEL[k.kategori] || k.kategori;
        return `<div style="display:flex;gap:12px;align-items:flex-start;border-left:4px solid ${warna};background:#f8fafc;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
          <div style="min-width:56px;text-align:center;">
            <div style="font-size:18px;font-weight:700;">${new Date(k.tanggal + 'T00:00:00').getDate()}</div>
            <div style="font-size:10px;color:#6b7280;text-transform:uppercase;">${new Date(k.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { month: 'short' })}</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:11px;color:${warna};font-weight:600;">${label}</div>
            <div style="font-weight:600;font-size:14px;">${escapeHtml(k.judul || '-')}</div>
            ${k.keterangan ? `<div style="font-size:12px;color:#6b7280;">${escapeHtml(k.keterangan)}</div>` : ''}
          </div>
          ${isEditor ? `<button class="btn btn-danger" style="padding:2px 8px;font-size:11px;" onclick="deleteKalenderAkademik('${escapeHtml(k.id)}')">🗑️</button>` : ''}
        </div>`;
      }).join('');
    }

    async function saveKalenderAkademik() {
      if (currentRole !== 'admin' && currentRole !== 'kepsek') { showToast('⛔ Hanya Admin/Kepsek yang bisa mengubah kalender', 'error'); return; }
      const tanggal = document.getElementById('kalenderTanggal')?.value;
      const kategori = document.getElementById('kalenderKategori')?.value;
      const judul = document.getElementById('kalenderJudul')?.value.trim();
      const keterangan = document.getElementById('kalenderKeterangan')?.value.trim();
      if (!tanggal || !kategori || !judul) { showToast('Tanggal, kategori, dan judul wajib diisi!', 'warning'); return; }
      if (judul.length < 3) { showToast('Judul kegiatan terlalu pendek!', 'warning'); return; }
      try {
        await db.ref('kalender_akademik').push({
          tanggal, kategori, judul: sanitizeInput(judul), keterangan: sanitizeInput(keterangan || ''),
          created_by: currentUser?.nama || 'Sistem', created_at: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity(`Menambah kalender akademik: ${judul} (${formatDate(tanggal)})`);
        showToast('✅ Kegiatan berhasil ditambahkan ke kalender!', 'success');
        document.getElementById('kalenderJudul').value = '';
        document.getElementById('kalenderKeterangan').value = '';
        loadKalenderAkademik();
      } catch (error) { console.error('Error saving kalender akademik:', error); showToast('Gagal menyimpan kalender', 'error'); }
    }

    async function deleteKalenderAkademik(id) {
      if (currentRole !== 'admin' && currentRole !== 'kepsek') { showToast('⛔ Hanya Admin/Kepsek yang bisa mengubah kalender', 'error'); return; }
      if (!confirm('Yakin ingin menghapus kegiatan ini dari kalender?')) return;
      try {
        await db.ref(`kalender_akademik/${id}`).remove();
        showToast('Kegiatan berhasil dihapus!', 'success');
        loadKalenderAkademik();
      } catch (error) { console.error('Error deleting kalender akademik:', error); showToast('Gagal menghapus kegiatan', 'error'); }
    }

    // Data resmi Kalender Pendidikan Madrasah TA 2026/2027 (berlaku untuk RA
    // juga) - SK Dirjen Pendidikan Islam Kemenag No. 4860 Tahun 2026. Tanggal
    // Hari Raya Idulfitri & libur nasional lain tetap "menyesuaikan ketetapan
    // pemerintah" sesuai keterangan resminya.
    const KALENDER_KEMENAG_2026_2027 = [
      { tanggal: '2026-07-13', kategori: 'kegiatan_sekolah', judul: "Hari Pertama Masuk Madrasah & Masa Ta'aruf Murid Madrasah (MATAMUDA)", keterangan: 's.d. 18 Juli 2026' },
      { tanggal: '2026-08-17', kategori: 'libur_nasional', judul: 'Peringatan HUT Kemerdekaan RI ke-81' },
      { tanggal: '2026-08-25', kategori: 'hari_besar_agama', judul: 'Peringatan Maulid Nabi Muhammad SAW' },
      { tanggal: '2026-11-23', kategori: 'ujian', judul: 'ASAS (Asesmen Sumatif Akhir Semester) Gasal', keterangan: 's.d. 5 Desember 2026' },
      { tanggal: '2026-12-18', kategori: 'kegiatan_sekolah', judul: 'Pembagian Rapor Semester Gasal & Rapat Wali Murid' },
      { tanggal: '2026-12-21', kategori: 'libur_semester', judul: 'Libur Semester Gasal TA 2026/2027', keterangan: 's.d. 2 Januari 2027' },
      { tanggal: '2026-12-25', kategori: 'hari_besar_agama', judul: 'Hari Raya Natal' },
      { tanggal: '2027-01-01', kategori: 'libur_nasional', judul: 'Tahun Baru Masehi' },
      { tanggal: '2027-01-03', kategori: 'kegiatan_sekolah', judul: 'Hari Amal Bakti (HAB) Kementerian Agama RI' },
      { tanggal: '2027-01-04', kategori: 'kegiatan_sekolah', judul: 'Awal Masuk Semester Genap TA 2026/2027' },
      { tanggal: '2027-01-05', kategori: 'hari_besar_agama', judul: "Peringatan Isra Mi'raj Nabi Muhammad SAW" },
      { tanggal: '2027-02-06', kategori: 'libur_nasional', judul: 'Tahun Baru Imlek' },
      { tanggal: '2027-03-06', kategori: 'hari_besar_agama', judul: 'Libur seputar Hari Raya Idulfitri 1448 H', keterangan: 's.d. 13 Maret 2027 (menyesuaikan ketetapan pemerintah)' },
      { tanggal: '2027-03-09', kategori: 'libur_nasional', judul: 'Hari Raya Nyepi' },
      { tanggal: '2027-03-10', kategori: 'hari_besar_agama', judul: 'Hari Raya Idulfitri 1448 H (Hari ke-1)', keterangan: 'Menyesuaikan ketetapan pemerintah' },
      { tanggal: '2027-03-11', kategori: 'hari_besar_agama', judul: 'Hari Raya Idulfitri 1448 H (Hari ke-2)', keterangan: 'Menyesuaikan ketetapan pemerintah' },
      { tanggal: '2027-03-26', kategori: 'libur_nasional', judul: 'Wafat Isa Almasih' },
      { tanggal: '2027-03-29', kategori: 'ujian', judul: 'Ujian Madrasah (UM)', keterangan: 's.d. 15 Mei 2027' },
      { tanggal: '2027-05-24', kategori: 'ujian', judul: 'ASAS (Asesmen Sumatif Akhir Semester) Genap', keterangan: 's.d. 5 Juni 2027' },
      { tanggal: '2027-06-21', kategori: 'libur_semester', judul: 'Libur Akhir Tahun Ajaran 2026/2027', keterangan: 's.d. 10 Juli 2027' }
    ];

    async function muatKalenderKemenag() {
      if (currentRole !== 'admin' && currentRole !== 'kepsek') { showToast('⛔ Hanya Admin/Kepsek yang bisa mengubah kalender', 'error'); return; }
      if (!confirm(`Ini akan menambahkan ${KALENDER_KEMENAG_2026_2027.length} agenda resmi Kalender Pendidikan Madrasah TA 2026/2027 (Kemenag) ke kalender akademik. Agenda yang judul & tanggalnya sudah ada tidak akan diduplikasi. Lanjutkan?`)) return;
      showLoading(true, 'Memuat kalender Kemenag...');
      try {
        // Cek data yang sudah ada dulu (bukan cuma bulan yang sedang difilter, tapi semua bulan terkait) supaya tidak dobel kalau tombol diklik ulang.
        const existingSnap = await db.ref('kalender_akademik').once('value');
        const existing = existingSnap.val() || {};
        const existingKeys = new Set(Object.values(existing).map(k => `${k.tanggal}|${k.judul}`));

        const updates = {};
        let ditambah = 0;
        KALENDER_KEMENAG_2026_2027.forEach(item => {
          const key = `${item.tanggal}|${item.judul}`;
          if (existingKeys.has(key)) return; // sudah ada, lewati
          const newRef = db.ref('kalender_akademik').push();
          updates[newRef.key] = { ...item, created_by: currentUser?.nama || 'Sistem', created_at: firebase.database.ServerValue.TIMESTAMP };
          ditambah++;
        });

        if (ditambah === 0) {
          showToast('ℹ️ Semua agenda Kemenag sudah ada di kalender, tidak ada yang ditambahkan.', 'info');
          showLoading(false);
          return;
        }
        await db.ref('kalender_akademik').update(updates);
        logActivity(`Memuat ${ditambah} agenda Kalender Pendidikan Madrasah Kemenag TA 2026/2027`);
        showToast(`✅ ${ditambah} agenda Kemenag berhasil ditambahkan ke kalender!`, 'success');
        loadKalenderAkademik();
      } catch (error) {
        console.error('Error memuat kalender kemenag:', error);
        showToast('Gagal memuat kalender Kemenag', 'error');
        showLoading(false);
      }
    }

    // PROMOTION
    async function loadPromotion() {
      try {
        const snapshot = await db.ref('promotion_history').orderByChild('tanggal').limitToLast(10).once('value');
        const data = snapshot.val() || {};
        const container = document.getElementById('promotionResult');
        const entries = Object.entries(data).reverse();
        if (!container) return;
        if (entries.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Belum ada riwayat</div>';
          return;
        }
        container.innerHTML = entries.map(([id, val]) => `
          <div style="padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:4px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
            <span><strong>${escapeHtml(val.dari_kelas)}</strong> → <strong>${escapeHtml(val.ke_kelas)}</strong></span>
            <span style="font-size:12px;color:#6b7280;">${escapeHtml(val.jumlah_siswa)} siswa • ${formatDate(val.tanggal)}</span>
          </div>
        `).join('');
      } catch (error) { console.error('Error loading promotion:', error); }
    }

    async function prosesKenaikan() {
      const dari = document.getElementById('promotionDari').value;
      const ke = document.getElementById('promotionKe').value;
      if (!confirm(`Yakin menaikkan semua siswa kelas ${dari} ke ${ke}?`)) return;
      showLoading(true, 'Memproses kenaikan kelas...');
      try {
        const studentsSnap = await db.ref('students').orderByChild('kelas').equalTo(dari).once('value');
        const students = studentsSnap.val() || {};
        const count = Object.keys(students).length;
        if (count === 0) { showToast('Tidak ada siswa di kelas tersebut', 'warning'); showLoading(false); return; }
        const updates = {};
        if (ke === 'Lulus') {
          // Siswa yang LULUS dipindah ke koleksi 'alumni' terpisah (bukan cuma
          // ganti label kelas) - supaya tidak lagi tercampur dengan siswa aktif
          // di Data Siswa, Absensi, Nilai, maupun Infaq.
          const tahunLulus = new Date().getFullYear();
          for (const [id, student] of Object.entries(students)) {
            updates[`alumni/${id}`] = {
              ...student, kelas_terakhir: dari, tahun_lulus: tahunLulus, tanggal_lulus: getToday()
            };
            updates[`students/${id}`] = null;
          }
        } else {
          for (const [id] of Object.entries(students)) { updates[`students/${id}/kelas`] = ke; }
        }
        await db.ref().update(updates);
        await db.ref('promotion_history').transaction((currentData) => {
          const newEntry = { dari_kelas: dari, ke_kelas: ke, jumlah_siswa: count, tanggal: getToday(), guruKey: currentUser?.id || null, timestamp: firebase.database.ServerValue.TIMESTAMP };
          if (currentData === null) return { 0: newEntry };
          const keys = Object.keys(currentData);
          const nextIndex = keys.length > 0 ? Math.max(...keys.map(Number)) + 1 : 0;
          currentData[nextIndex] = newEntry;
          return currentData;
        });
        logActivity(`Kenaikan kelas: ${count} siswa dari ${dari} ke ${ke}${ke === 'Lulus' ? ' (dipindah ke Alumni)' : ''}`);
        showToast(`${count} siswa berhasil ${ke === 'Lulus' ? 'diluluskan & dipindah ke Alumni!' : `dinaikkan ke kelas ${ke}!`}`, 'success');
        const resultEl = document.getElementById('promotionResult');
        if (resultEl) {
          resultEl.innerHTML = `<div style="padding:16px;background:#dcfce7;border-radius:8px;color:#065f46;">✅ ${count} siswa dari kelas ${dari} berhasil ${ke === 'Lulus' ? 'diluluskan (lihat menu Alumni)' : `dinaikkan ke ${ke}`}</div>`;
        }
        loadPromotion();
        showLoading(false);
      } catch (error) {
        console.error('Error promoting students:', error);
        showToast('Gagal melakukan kenaikan kelas', 'error');
        showLoading(false);
      }
    }

    // ============================================================
    // ALUMNI (siswa yang sudah lulus, terpisah dari data siswa aktif)
    // ============================================================
    let alumniCache = [];

    async function loadAlumni() {
      showLoading(true, 'Memuat data alumni...');
      try {
        const snap = await db.ref('alumni').once('value');
        const data = snap.val() || {};
        alumniCache = Object.entries(data).map(([id, a]) => ({ id, ...a }));
        renderAlumniTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading alumni:', error);
        showToast('Gagal memuat data alumni', 'error');
        showLoading(false);
      }
    }

    function renderAlumniTable() {
      const container = document.getElementById('alumniTableBody');
      if (!container) return;
      if (alumniCache.length === 0) {
        container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data alumni</td></tr>';
        return;
      }
      const query = (document.getElementById('alumniSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('alumniSort')?.value || '';
      let filtered = alumniCache;
      if (query) filtered = filtered.filter(a => (a.nama || '').toLowerCase().includes(query) || (a.nis || '').toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      else if (sortBy === 'tahun_desc') filtered.sort((a, b) => (b.tahun_lulus || 0) - (a.tahun_lulus || 0));
      else if (sortBy === 'tahun_asc') filtered.sort((a, b) => (a.tahun_lulus || 0) - (b.tahun_lulus || 0));
      else filtered.sort((a, b) => (b.tahun_lulus || 0) - (a.tahun_lulus || 0)); // default: terbaru dulu

      if (filtered.length === 0) {
        container.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada alumni yang cocok dengan pencarian</td></tr>';
        return;
      }
      container.innerHTML = filtered.map((a, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(a.nis || '-')}</td>
          <td>${escapeHtml(a.nama || '-')}</td>
          <td>${escapeHtml(a.kelas_terakhir || '-')}</td>
          <td>${escapeHtml(a.tahun_lulus || '-')}</td>
          <td><button class="btn btn-soft" style="padding:2px 10px;font-size:11px;" onclick="kembalikanAlumni('${escapeHtml(a.id)}')" title="Kembalikan jadi siswa aktif (kalau salah luluskan)">↺ Kembalikan</button></td>
        </tr>
      `).join('');
    }

    async function kembalikanAlumni(id) {
      const alumnus = alumniCache.find(a => a.id === id);
      if (!alumnus) return;
      if (!confirm(`Kembalikan ${alumnus.nama} jadi siswa aktif di kelas ${alumnus.kelas_terakhir || 'A'}?`)) return;
      try {
        const { id: _id, kelas_terakhir, tahun_lulus, tanggal_lulus, ...studentData } = alumnus;
        const updates = {};
        updates[`students/${id}`] = { ...studentData, kelas: kelas_terakhir || 'A' };
        updates[`alumni/${id}`] = null;
        await db.ref().update(updates);
        logActivity(`Mengembalikan alumni ke siswa aktif: ${alumnus.nama}`);
        showToast(`✅ ${alumnus.nama} dikembalikan ke siswa aktif!`, 'success');
        loadAlumni();
      } catch (error) { console.error('Error restoring alumni:', error); showToast('❌ Gagal mengembalikan data', 'error'); }
    }

    function exportAlumniExcel() {
      if (alumniCache.length === 0) { showToast('Belum ada data alumni untuk diexport!', 'warning'); return; }
      const data = [['No', 'NIS', 'Nama', 'Kelas Terakhir', 'Tahun Lulus', 'Orang Tua'],
        ...alumniCache.map((a, idx) => [idx + 1, a.nis || '-', a.nama || '-', a.kelas_terakhir || '-', a.tahun_lulus || '-', a.orang_tua || '-'])];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
      XLSX.utils.book_append_sheet(wb, ws, 'Alumni');
      XLSX.writeFile(wb, `Data_Alumni_${getToday()}.xlsx`);
      showToast('✅ Export Excel berhasil!', 'success');
    }


