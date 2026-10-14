    // ============================================================
    // SUBJECTS
    // ============================================================
    async function loadSubjects() {
      showLoading(true, 'Memuat data aspek perkembangan...');
      try {
        const snapshot = await db.ref('subjects').once('value');
        const data = snapshot.val() || {};
        allSubjects = Object.entries(data).map(([key, val]) => ({ ...val, id: key }));
        const perPageSelect = document.getElementById('subjectsPerPage');
        if (perPageSelect) subjectPerPage = parseInt(perPageSelect.value) || 10;
        renderSubjects();
        showLoading(false);
      } catch (error) {
        console.error('Error loading subjects:', error);
        showToast('Gagal memuat data aspek perkembangan', 'error');
        showLoading(false);
      }
    }

    function renderSubjects() {
      const container = document.getElementById('subjectsTableBody');
      if (!container) return;

      const query = (document.getElementById('subjectsSearchInput')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('subjectsSortSelect')?.value || '';

      let filtered = allSubjects;
      if (query) {
        filtered = filtered.filter(s =>
          (s.kode || '').toLowerCase().includes(query) ||
          (s.nama || '').toLowerCase().includes(query) ||
          (s.guru || '').toLowerCase().includes(query)
        );
      }
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      else if (sortBy === 'nama_desc') filtered.sort((a, b) => (b.nama || '').localeCompare(a.nama || ''));
      else if (sortBy === 'kelompok') filtered.sort((a, b) => (a.kelompok || '').localeCompare(b.kelompok || '') || (a.nama || '').localeCompare(b.nama || ''));
      else if (sortBy === 'kode') filtered.sort((a, b) => (a.kode || '').localeCompare(b.kode || ''));

      const start = (subjectPage - 1) * subjectPerPage;
      const end = start + subjectPerPage;
      const pageData = filtered.slice(start, end);
      if (pageData.length === 0 && subjectPage > 1) {
        subjectPage = Math.max(1, Math.ceil(filtered.length / subjectPerPage));
        return renderSubjects();
      }
      if (filtered.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">${query ? 'Tidak ada aspek yang cocok dengan pencarian' : 'Belum ada data aspek perkembangan'}</td></tr>`;
      } else {
        container.innerHTML = pageData.map((s, index) => `
          <tr>
            <td>${start + index + 1}</td>
            <td>${escapeHtml(s.kode || '-')}</td>
            <td><strong>${escapeHtml(s.nama || '-')}</strong></td>
            <td><span class="role-badge" style="background:${s.kelompok === 'A' ? '#059669' : s.kelompok === 'B' ? '#2563eb' : '#7c3aed'};color:white;">${escapeHtml(s.kelompok || 'Umum')}</span></td>
            <td>${escapeHtml(s.guru || '-')}</td>
            <td>
              <button class="btn btn-edit" style="padding:2px 10px;font-size:11px;" onclick="editSubject('${escapeHtml(s.id)}')">✏️</button>
              <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteSubject('${escapeHtml(s.id)}')">🗑️</button>
            </td>
          </tr>
        `).join('');
      }
      const totalPages = Math.ceil(filtered.length / subjectPerPage) || 1;
      document.getElementById('subjectsPageInfo').textContent = `Halaman ${subjectPage} dari ${totalPages}`;
      document.getElementById('subjectsPrevBtn').disabled = subjectPage <= 1;
      document.getElementById('subjectsNextBtn').disabled = subjectPage >= totalPages;
    }

    function changeSubjectPage(delta) {
      const query = (document.getElementById('subjectsSearchInput')?.value || '').trim().toLowerCase();
      const filteredCount = query ? allSubjects.filter(s =>
        (s.kode || '').toLowerCase().includes(query) || (s.nama || '').toLowerCase().includes(query) || (s.guru || '').toLowerCase().includes(query)
      ).length : allSubjects.length;
      const totalPages = Math.ceil(filteredCount / subjectPerPage) || 1;
      const newPage = Math.min(Math.max(1, subjectPage + delta), totalPages);
      if (newPage !== subjectPage) { subjectPage = newPage; renderSubjects(); }
    }

    function showTambahMapel() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'tambahMapelModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">📚 Tambah Aspek Perkembangan</h3>
          <div style="margin-bottom:12px;"><label class="label">Kode</label><input type="text" class="field" id="newMapelKode" placeholder="Contoh: NAM, FM, KOG, BHS, SOSEM, SN" maxlength="20"></div>
          <div style="margin-bottom:12px;"><label class="label">Nama Aspek Perkembangan</label><input type="text" class="field" id="newMapelNama" placeholder="Contoh: Nilai Agama dan Moral" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Kelompok</label><select class="field" id="newMapelKelompok"><option value="A">Kelompok A (Umum)</option><option value="B">Kelompok B (Keagamaan)</option><option value="C">Kelompok C (Keterampilan)</option></select></div>
          <div style="margin-bottom:16px;"><label class="label">Guru Pengajar</label><input type="text" class="field" id="newMapelGuru" placeholder="Nama guru pengajar" maxlength="100"></div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, tambahMapel)">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('tambahMapelModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function tambahMapel() {
      const kode = document.getElementById('newMapelKode').value.trim();
      const nama = document.getElementById('newMapelNama').value.trim();
      const kelompok = document.getElementById('newMapelKelompok').value;
      const guru = document.getElementById('newMapelGuru').value.trim();
      if (!kode || !nama) { showToast('Kode dan Nama wajib diisi!', 'warning'); return; }
      if (!validateNama(nama)) { showToast('Nama aspek harus 2-100 karakter!', 'error'); return; }
      const existing = allSubjects.find(s => s.kode === kode);
      if (existing) { showToast(`Kode "${kode}" sudah digunakan!`, 'error'); return; }
      try {
        await db.ref('subjects').push({
          kode: sanitizeInput(kode), nama: sanitizeInput(nama), kelompok: sanitizeInput(kelompok),
          guru: sanitizeInput(guru || '-'), guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Aspek perkembangan berhasil ditambahkan!', 'success');
        document.getElementById('tambahMapelModal').remove();
        loadSubjects();
      } catch (error) { console.error('Error adding subject:', error); showToast('Gagal menambahkan aspek perkembangan', 'error'); }
    }

    async function editSubject(id) {
      const subject = allSubjects.find(s => s.id === id);
      if (!subject) { showToast('Data tidak ditemukan!', 'error'); return; }
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'editMapelModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">✏️ Edit Aspek Perkembangan</h3>
          <div style="margin-bottom:12px;"><label class="label">Kode</label><input type="text" class="field" id="editMapelKode" maxlength="20" readonly style="background:#f3f4f6;cursor:not-allowed;"></div>
          <div style="margin-bottom:12px;"><label class="label">Nama Aspek Perkembangan</label><input type="text" class="field" id="editMapelNama" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Kelompok</label><select class="field" id="editMapelKelompok"><option value="A" ${subject.kelompok==='A'?'selected':''}>Kelompok A (Umum)</option><option value="B" ${subject.kelompok==='B'?'selected':''}>Kelompok B (Keagamaan)</option><option value="C" ${subject.kelompok==='C'?'selected':''}>Kelompok C (Keterampilan)</option></select></div>
          <div style="margin-bottom:16px;"><label class="label">Guru Pengajar</label><input type="text" class="field" id="editMapelGuru" maxlength="100"></div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, () => updateSubject('${escapeHtml(id)}'))">💾 Update</button><button class="btn btn-soft" onclick="document.getElementById('editMapelModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('editMapelKode').value = subject.kode || '';
      document.getElementById('editMapelNama').value = subject.nama || '';
      document.getElementById('editMapelGuru').value = subject.guru || '';
    }

    async function updateSubject(id) {
      const nama = document.getElementById('editMapelNama').value.trim();
      const kelompok = document.getElementById('editMapelKelompok').value;
      const guru = document.getElementById('editMapelGuru').value.trim();
      if (!nama) { showToast('Nama Aspek Perkembangan wajib diisi!', 'warning'); return; }
      if (!validateNama(nama)) { showToast('Nama aspek harus 2-100 karakter!', 'error'); return; }
      try {
        await db.ref(`subjects/${id}`).update({
          nama: sanitizeInput(nama), kelompok: sanitizeInput(kelompok),
          guru: sanitizeInput(guru || '-'), updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Aspek perkembangan berhasil diupdate!', 'success');
        document.getElementById('editMapelModal').remove();
        loadSubjects();
      } catch (error) { console.error('Error updating subject:', error); showToast('Gagal mengupdate aspek perkembangan', 'error'); }
    }

    async function deleteSubject(id) {
      const subject = allSubjects.find(s => s.id === id);
      if (!subject) return;
      try {
        const gradesSnap = await db.ref('grades').once('value');
        const grades = gradesSnap.val() || {};
        let isUsed = false;
        for (const [studentId, subjects] of Object.entries(grades)) {
          if (subjects && subjects[id]) { isUsed = true; break; }
        }
        if (isUsed) {
          if (!confirm(`⚠️ Mapel "${subject.nama}" sedang digunakan di data nilai. Yakin ingin menghapus?`)) return;
        } else {
          if (!confirm(`Yakin ingin menghapus mata pelajaran "${subject.nama}"?`)) return;
        }
        await db.ref(`subjects/${id}`).remove();
        showToast('Mata pelajaran berhasil dihapus!', 'success');
        loadSubjects();
      } catch (error) { console.error('Error deleting subject:', error); showToast('Gagal menghapus mata pelajaran', 'error'); }
    }

    // ============================================================
    // ATTENDANCE
    // ============================================================
    async function loadAttendance() {
      showLoading(true, 'Memuat absensi...');
      try {
        const today = getToday();
        document.getElementById('attendanceDate').textContent = `Hari ini: ${formatDate(today)}`;
        const myKelas = await getMyKelasDiampu();
        const [studentsSnap, attendanceSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref(`attendance/${today}`).once('value')
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        const attendance = attendanceSnap.val() || {};
        window.__attendanceStudentsCache = students; // dipakai setAttendance() untuk ambil nama siswa saat logging
        window.__attendanceTodayCache = attendance; // dipakai tandaiSemuaHadir() untuk tahu siapa yang belum diisi
        const container = document.getElementById('attendanceTableBody');
        const entries = Object.entries(students);
        if (!container) { showLoading(false); return; }
        if (entries.length === 0) {
          container.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280;">Belum ada siswa</td></tr>';
          showLoading(false); return;
        }
        container.innerHTML = entries.map(([id, student]) => {
          const status = attendance[id]?.status || '';
          return `
            <tr>
              <td>${escapeHtml(student.nis || '-')}</td>
              <td>${escapeHtml(student.nama || '-')}</td>
              <td>${escapeHtml(student.kelas || '-')}</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${['H','S','I','A'].map(s => `
                    <button class="status-choice ${status === s ? 'selected' : ''}" data-status="${s}" onclick="setAttendance('${escapeHtml(id)}', '${s}', this)">
                      ${s === 'H' ? '✅' : s === 'S' ? '🤒' : s === 'I' ? '📝' : '❌'} ${s}
                    </button>
                  `).join('')}
                </div>
              </td>
              <td>
                <input type="text" class="field" id="keterangan_${escapeHtml(id)}" style="padding:4px 8px;font-size:12px;width:120px;" 
                       placeholder="Keterangan" 
                       onchange="updateAttendanceKeterangan('${escapeHtml(id)}', this.value)">
                ${attendance[id]?.by ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;">oleh ${escapeHtml(attendance[id].by)}</div>` : ''}
              </td>
            </tr>
          `;
        }).join('');
        // Isi value keterangan lewat properti JS (bukan atribut HTML) - aman dari quote-breakout.
        entries.forEach(([id]) => {
          const el = document.getElementById(`keterangan_${id}`);
          if (el) el.value = attendance[id]?.keterangan || '';
        });
        showLoading(false);
      } catch (error) {
        console.error('Error loading attendance:', error);
        showToast('Gagal memuat absensi', 'error');
        showLoading(false);
      }
    }

    async function setAttendance(studentId, status, btnEl) {
      // Jaga-jaga: window.__attendanceStudentsCache sudah difilter sesuai kelas
      // yang diampu (lihat loadAttendance). Kalau studentId tidak ada di situ,
      // berarti di luar kelas yang boleh diakses akun ini - tolak walau dipanggil
      // manual lewat console.
      if (!window.__attendanceStudentsCache?.[studentId]) {
        showToast('⛔ Anda tidak punya akses ke siswa ini', 'error');
        return;
      }
      const today = getToday();
      const namaSiswa = window.__attendanceStudentsCache?.[studentId]?.nama || studentId;
      const statusLabel = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' }[status] || status;
      const success = await writeWithOfflineFallback(`attendance/${today}/${studentId}`, {
        status: status, timestamp: firebase.database.ServerValue.TIMESTAMP, tanggal: today,
        by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
      }, `Absensi ${namaSiswa} → ${statusLabel}`);
      if (success) {
        logActivity(`Mengubah absensi ${namaSiswa} menjadi "${statusLabel}" (${today})`);
        showToast(`Status berhasil diubah`, 'success');
        loadAttendance();
      } else if (btnEl) {
        // Offline: jangan reload dari server (bisa menimpa balik tampilan dengan
        // data lama) - cukup update tampilan tombol secara optimis di browser.
        btnEl.parentElement.querySelectorAll('.status-choice').forEach(b => b.classList.remove('selected'));
        btnEl.classList.add('selected');
      }
    }

    async function updateAttendanceKeterangan(studentId, keterangan) {
      if (!window.__attendanceStudentsCache?.[studentId]) {
        showToast('⛔ Anda tidak punya akses ke siswa ini', 'error');
        return;
      }
      const today = getToday();
      const namaSiswa = window.__attendanceStudentsCache?.[studentId]?.nama || studentId;
      const success = await updateWithOfflineFallback(`attendance/${today}/${studentId}`, {
        keterangan: sanitizeInput(keterangan), by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
      }, `Keterangan absensi ${namaSiswa}`);
      if (success) logActivity(`Mengubah keterangan absensi ${namaSiswa} (${today})`);
    }

    // Isi cepat: tandai semua siswa yang BELUM punya status hari ini sebagai
    // Hadir sekaligus. Siswa yang sudah ditandai (Hadir/Sakit/Izin/Alpa)
    // TIDAK disentuh - supaya tidak sengaja menimpa catatan sakit/izin yang
    // sudah diisi duluan.
    async function tandaiSemuaHadir() {
      const students = window.__attendanceStudentsCache || {};
      const attendanceToday = window.__attendanceTodayCache || {};
      const belumDiisi = Object.keys(students).filter(id => !attendanceToday[id]?.status);
      if (belumDiisi.length === 0) {
        showToast('Semua siswa yang tampil sudah punya status absen hari ini.', 'success');
        return;
      }
      if (!confirm(`Tandai ${belumDiisi.length} siswa yang belum diisi sebagai Hadir?\n\n(Siswa yang sudah punya status Hadir/Sakit/Izin/Alpa tidak akan diubah)`)) return;
      showLoading(true, 'Menandai kehadiran...');
      try {
        const today = getToday();
        const updates = {};
        belumDiisi.forEach(id => {
          updates[`attendance/${today}/${id}`] = {
            status: 'H', timestamp: firebase.database.ServerValue.TIMESTAMP, tanggal: today,
            by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
          };
        });
        await db.ref().update(updates);
        logActivity(`Menandai ${belumDiisi.length} siswa Hadir sekaligus (${today})`);
        showToast(`✅ ${belumDiisi.length} siswa ditandai Hadir!`, 'success');
        loadAttendance();
      } catch (error) {
        console.error('Error tandai semua hadir:', error);
        showToast('❌ Gagal menandai kehadiran massal', 'error');
        showLoading(false);
      }
    }

    async function simpanAbsensi() { showToast('Semua data absensi sudah tersimpan otomatis!', 'success'); }

    // ============================================================
    // INFAQ SISWA (setoran mingguan, nominal bisa diubah per bulan)
    // ============================================================
    let infaqCurrentPeriode = '';
    let infaqWeeksCount = 4;

    function getWeeksInMonth(periode) {
      const [y, m] = periode.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      return Math.ceil(daysInMonth / 7);
    }

    async function loadInfaq() {
      if (!requireInfaqAccess()) return;
      const bulanInput = document.getElementById('infaqBulan');
      if (bulanInput && !bulanInput.value) bulanInput.value = getMonth();
      const periode = bulanInput.value;
      infaqCurrentPeriode = periode;
      infaqWeeksCount = getWeeksInMonth(periode);

      showLoading(true, 'Memuat data infaq...');
      try {
        // Dibatasi ke kelas yang diampu untuk guru/wali_kelas (sama seperti
        // Absensi/Nilai/Anekdot/Rapor/Dashboard) - null berarti admin/kepsek (lihat semua).
        const myKelas = await getMyKelasDiampu();
        const [studentsSnap, infaqSnap, settingsSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref(`infaq/${periode}`).once('value'),
          db.ref(`infaq_settings/${periode}`).once('value')
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        const infaqData = infaqSnap.val() || {};
        const settings = settingsSnap.val() || {};
        // Kompatibel dengan data lama (field "nominal" tunggal sebelum ada
        // kategori Yatim/Bersaudara) - dipakai sebagai nominal Normal.
        const nominalNormal = settings.nominal_normal ?? settings.nominal ?? 0;
        const nominalYatim = settings.nominal_yatim ?? 0;
        const nominalBersaudara = settings.nominal_bersaudara ?? 0;

        window.__infaqStudentsCache = students;
        window.__infaqDataCache = infaqData;

        const normalInput = document.getElementById('infaqNominalNormal');
        if (normalInput) normalInput.value = nominalNormal || '';
        const yatimInput = document.getElementById('infaqNominalYatim');
        if (yatimInput) yatimInput.value = nominalYatim || '';
        const bersaudaraInput = document.getElementById('infaqNominalBersaudara');
        if (bersaudaraInput) bersaudaraInput.value = nominalBersaudara || '';

        const headRow = document.getElementById('infaqHeadRow');
        if (headRow) {
          let weekThs = '';
          for (let w = 1; w <= infaqWeeksCount; w++) weekThs += `<th>Mgu ${w}</th>`;
          headRow.innerHTML = `<th>No</th><th>Nama</th><th>Kelas</th>${weekThs}<th>Total Setor</th><th>Status</th><th>Aksi</th>`;
        }

        // Hitung ringkasan per siswa & simpan ke cache untuk dipakai search/sort.
        let totalTerkumpulBulan = 0;
        infaqCache = Object.entries(students).map(([id, student]) => {
          const studentInfaq = infaqData[id] || {};
          let totalSetor = 0, weeksPaid = 0;
          const weekStatus = [];
          for (let w = 1; w <= infaqWeeksCount; w++) {
            const record = studentInfaq[`w${w}`];
            const paid = !!(record && record.paid);
            if (paid) { totalSetor += record.jumlah || 0; weeksPaid++; }
            weekStatus.push(paid);
          }
          totalTerkumpulBulan += totalSetor;
          return { id, nama: student.nama || '-', kelas: student.kelas || '-', kategoriInfaq: student.kategori_infaq || 'normal', noWA: student.no_wa_ortu || '', weekStatus, totalSetor, weeksPaid };
        });

        renderInfaqTable();
        renderChartInfaqBulanan(periode);

        const summaryEl = document.getElementById('infaqSummary');
        const totalEl = document.getElementById('infaqTotalTerkumpul');
        if (summaryEl && totalEl) {
          totalEl.textContent = `Rp ${totalTerkumpulBulan.toLocaleString('id-ID')}`;
          summaryEl.style.display = 'block';
        }
        showLoading(false);
      } catch (error) {
        console.error('Error loading infaq:', error);
        showToast('Gagal memuat data infaq', 'error');
        showLoading(false);
      }
    }

    function renderChartInfaqBulanan(periodeAcuan, canvasId = 'chartInfaqBulanan') {
      const canvas = document.getElementById(canvasId);
      if (!canvas || typeof Chart === 'undefined') return;
      const periode6BulanLalu = getPeriodeMundur(periodeAcuan, 5); // 6 bulan termasuk periodeAcuan, bukan seluruh histori
      db.ref('infaq').orderByKey().startAt(periode6BulanLalu).once('value').then(snap => {
        const allData = snap.val() || {};
        const labels = [], dataTotal = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(`${periodeAcuan}-01T00:00:00`);
          d.setMonth(d.getMonth() - i);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthData = allData[key] || {};
          let total = 0;
          Object.values(monthData).forEach(studentWeeks => {
            Object.values(studentWeeks || {}).forEach(rec => { if (rec.paid) total += rec.jumlah || 0; });
          });
          labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }));
          dataTotal.push(total);
        }
        if (chartInstancesRegistry[canvasId]) chartInstancesRegistry[canvasId].destroy();
        chartInstancesRegistry[canvasId] = new Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Total Infaq Terkumpul', data: dataTotal, backgroundColor: '#0f3b2c', borderRadius: 4, maxBarThickness: 40 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `Rp ${ctx.parsed.y.toLocaleString('id-ID')}` } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: (v) => 'Rp ' + Number(v).toLocaleString('id-ID') } } }
          }
        });
      }).catch(error => console.error('Error rendering chart infaq:', error));
    }

    let infaqCache = [];

    function renderInfaqTable() {
      const tbody = document.getElementById('infaqTableBody');
      if (!tbody) return;
      if (infaqCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${6 + infaqWeeksCount}" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data siswa</td></tr>`;
        return;
      }
      const query = (document.getElementById('infaqSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('infaqSort')?.value || '';
      let filtered = infaqCache;
      if (query) filtered = filtered.filter(r => r.nama.toLowerCase().includes(query) || r.kelas.toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => a.nama.localeCompare(b.nama));
      else if (sortBy === 'kelas') filtered.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
      else if (sortBy === 'setor_desc') filtered.sort((a, b) => b.totalSetor - a.totalSetor);
      else if (sortBy === 'belum_lunas') filtered.sort((a, b) => a.weeksPaid - b.weeksPaid);

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${6 + infaqWeeksCount}" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada siswa yang cocok dengan pencarian</td></tr>`;
        return;
      }
      tbody.innerHTML = filtered.map((r, idx) => {
        const weekCells = r.weekStatus.map((paid, i) => {
          const w = i + 1;
          return `<td style="text-align:center;">
            <button class="status-choice" style="min-width:34px;${paid ? 'background:#dcfce7;border-color:#059669;color:#065f46;' : ''}" onclick="toggleInfaqMinggu('${escapeHtml(r.id)}', ${w})" title="${paid ? 'Sudah setor, klik untuk batalkan' : 'Belum setor, klik untuk tandai lunas'}">
              ${paid ? '✅' : '⬜'}
            </button>
          </td>`;
        }).join('');
        const statusLabel = infaqWeeksCount > 0 && r.weeksPaid >= infaqWeeksCount ? 'Lunas' : `${r.weeksPaid}/${infaqWeeksCount} minggu`;
        const statusColor = r.weeksPaid >= infaqWeeksCount ? '#059669' : (r.weeksPaid === 0 ? '#dc2626' : '#d97706');
        const badgeKategori = r.kategoriInfaq === 'yatim'
          ? ' <span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;">Yatim</span>'
          : r.kategoriInfaq === 'bersaudara'
          ? ' <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:8px;">Bersaudara</span>'
          : '';
        const belumLunas = infaqWeeksCount > 0 && r.weeksPaid < infaqWeeksCount;
        const tombolWA = belumLunas
          ? `<button class="btn btn-success" style="padding:2px 8px;font-size:11px;" onclick="kirimReminderInfaqWA('${escapeHtml(r.id)}')" title="${r.noWA ? 'Kirim reminder via WhatsApp' : 'No. WA belum diisi - klik untuk lihat caranya'}">📲 WA</button>`
          : '';
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(r.nama)}${badgeKategori}</td>
          <td>${escapeHtml(r.kelas)}</td>
          ${weekCells}
          <td>Rp ${r.totalSetor.toLocaleString('id-ID')}</td>
          <td><span style="color:${statusColor};font-weight:600;">${statusLabel}</span></td>
          <td>${tombolWA}</td>
        </tr>`;
      }).join('');
    }

    function kirimReminderInfaqWA(studentId) {
      const r = infaqCache.find(x => x.id === studentId);
      if (!r) return;
      if (!r.noWA) {
        showToast('⚠️ No. WhatsApp orang tua belum diisi. Lengkapi dulu di menu Data Siswa → Edit siswa ini.', 'warning');
        return;
      }
      const periode = infaqCurrentPeriode || getMonth();
      const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
      const sisaMinggu = infaqWeeksCount - r.weeksPaid;
      const pesan = `Assalamu'alaikum Bapak/Ibu orang tua dari ananda *${r.nama}* (Kelas ${r.kelas}).\n\nKami dari ${namaSekolah} ingin mengingatkan bahwa infaq mingguan ananda bulan *${namaBulan}* baru terbayar *${r.weeksPaid} dari ${infaqWeeksCount} minggu* (kurang ${sisaMinggu} minggu).\n\nMohon Bapak/Ibu berkenan melengkapi setoran infaqnya. Terima kasih atas perhatian dan kerja samanya 🙏`;
      bukaWhatsApp(r.noWA, pesan);
    }

    async function toggleInfaqMinggu(studentId, week) {
      if (!requireInfaqAccess()) return;
      const periode = infaqCurrentPeriode || getMonth();
      const existing = window.__infaqDataCache?.[studentId]?.[`w${week}`];
      const isPaid = !!(existing && existing.paid);
      const namaSiswa = window.__infaqStudentsCache?.[studentId]?.nama || studentId;
      let success;

      if (isPaid) {
        success = await removeWithOfflineFallback(`infaq/${periode}/${studentId}/w${week}`, `Batal infaq ${namaSiswa} minggu ke-${week}`);
      } else {
        let nominal = 0;
        try {
          const settingsSnap = await db.ref(`infaq_settings/${periode}`).once('value');
          const settings = settingsSnap.val() || {};
          const kategori = window.__infaqStudentsCache?.[studentId]?.kategori_infaq || 'normal';
          if (kategori === 'yatim') nominal = settings.nominal_yatim ?? 0;
          else if (kategori === 'bersaudara') nominal = settings.nominal_bersaudara ?? 0;
          else nominal = settings.nominal_normal ?? settings.nominal ?? 0; // kompatibel data lama
        } catch (error) { console.warn('Gagal membaca nominal infaq (mungkin offline), pakai 0 sementara:', error); }
        success = await writeWithOfflineFallback(`infaq/${periode}/${studentId}/w${week}`, {
          paid: true, jumlah: nominal, tanggal: getToday(),
          by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
        }, `Infaq ${namaSiswa} minggu ke-${week}`);
      }

      if (success) logActivity(`${isPaid ? 'Membatalkan' : 'Mencatat'} infaq ${namaSiswa} minggu ke-${week} (${periode})`);
      loadInfaq();
    }

    async function saveInfaqNominal() {
      if (!requireInfaqAccess()) return;
      const periode = document.getElementById('infaqBulan')?.value || getMonth();
      const nominalNormal = parseInt(document.getElementById('infaqNominalNormal')?.value, 10) || 0;
      const nominalYatim = parseInt(document.getElementById('infaqNominalYatim')?.value, 10) || 0;
      const nominalBersaudara = parseInt(document.getElementById('infaqNominalBersaudara')?.value, 10) || 0;
      if (nominalNormal < 0 || nominalYatim < 0 || nominalBersaudara < 0) { showToast('Nominal tidak boleh minus!', 'warning'); return; }
      try {
        await db.ref(`infaq_settings/${periode}`).set({
          nominal_normal: nominalNormal, nominal_yatim: nominalYatim, nominal_bersaudara: nominalBersaudara,
          updated_by: currentUser?.nama || 'Sistem', updated_by_role: currentRole || '-',
          updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity(`Mengubah nominal infaq bulan ${formatMonthLabel(periode)}: Normal Rp ${nominalNormal.toLocaleString('id-ID')}, Yatim Rp ${nominalYatim.toLocaleString('id-ID')}, Bersaudara Rp ${nominalBersaudara.toLocaleString('id-ID')}`);
        showToast('✅ Nominal infaq bulan ini berhasil disimpan!', 'success');
        loadInfaq();
      } catch (error) {
        console.error('Error saving infaq nominal:', error);
        showToast('❌ Gagal menyimpan nominal infaq', 'error');
      }
    }

    function exportInfaqExcel() {
      if (!requireInfaqAccess()) return;
      const students = window.__infaqStudentsCache;
      const infaqData = window.__infaqDataCache || {};
      if (!students || Object.keys(students).length === 0) { showToast('Belum ada data untuk diexport!', 'warning'); return; }
      const periode = infaqCurrentPeriode || getMonth();
      const headers = ['No', 'Nama', 'Kelas', 'Kategori'];
      for (let w = 1; w <= infaqWeeksCount; w++) headers.push(`Minggu ${w}`);
      headers.push('Total Setor (Rp)', 'Status');

      const rows = [];
      let no = 1;
      for (const [id, student] of Object.entries(students)) {
        const studentInfaq = infaqData[id] || {};
        const kategoriLabel = student.kategori_infaq === 'yatim' ? 'Yatim' : student.kategori_infaq === 'bersaudara' ? 'Bersaudara' : 'Normal';
        const row = [no++, student.nama || '-', student.kelas || '-', kategoriLabel];
        let totalSetor = 0, weeksPaid = 0;
        for (let w = 1; w <= infaqWeeksCount; w++) {
          const record = studentInfaq[`w${w}`];
          const paid = !!(record && record.paid);
          if (paid) { totalSetor += record.jumlah || 0; weeksPaid++; }
          row.push(paid ? 'Lunas' : '-');
        }
        row.push(totalSetor);
        row.push(weeksPaid >= infaqWeeksCount ? 'Lunas' : `${weeksPaid}/${infaqWeeksCount} minggu`);
        rows.push(row);
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel([headers, ...rows]));
      XLSX.utils.book_append_sheet(wb, ws, 'Infaq');
      XLSX.writeFile(wb, `Infaq_Siswa_${periode}.xlsx`);
      showToast('✅ Export Excel berhasil!', 'success');
    }

