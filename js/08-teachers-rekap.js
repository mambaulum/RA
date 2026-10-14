    // ============================================================
    // CRUD GURU
    // ============================================================
    function showTambahGuru() {
      if (!requireStaffRole('menambah data guru')) return;
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'tambahGuruModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">👨‍🏫 Tambah Guru</h3>
          <div style="margin-bottom:12px;"><label class="label">Nama Lengkap</label><input type="text" class="field" id="newGuruNama" placeholder="Nama lengkap" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">NIP</label><input type="text" class="field" id="newGuruNIP" placeholder="Nomor Induk Pegawai" maxlength="30"></div>
          <div style="margin-bottom:12px;"><label class="label">Aspek yang Diajarkan</label><input type="text" class="field" id="newGuruMapel" placeholder="Contoh: Kognitif / Bahasa" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Jenis Kelamin</label><select class="field" id="newGuruJK"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
          <div style="margin-bottom:12px;"><label class="label">No. HP</label><input type="text" class="field" id="newGuruHP" placeholder="Contoh: 081234567890" maxlength="15"></div>
          <div style="margin-bottom:16px;"><label class="label">Honor per Hari (Rp) — opsional</label><input type="number" class="field" id="newGuruHonor" placeholder="Kosongkan untuk pakai default"></div>
          <div style="margin-bottom:16px;">
            <label class="label">Kelas yang Diampu (untuk Absensi/Nilai/Jurnal)</label>
            <div style="display:flex;gap:14px;flex-wrap:wrap;">
              ${KELAS_LIST.map(k => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="new-guru-kelas" value="${escapeHtml(k)}"> Kelas ${escapeHtml(k)}</label>`).join('')}
            </div>
            <p style="font-size:11px;color:#6b7280;margin-top:4px;">Kosongkan semua kalau guru ini boleh mengelola SEMUA kelas (mis. Kepala Sekolah).</p>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, tambahGuru)">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('tambahGuruModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function tambahGuru() {
      if (!requireStaffRole('menambah data guru')) return;
      const nama = document.getElementById('newGuruNama').value.trim();
      const nip = document.getElementById('newGuruNIP').value.trim();
      const mapel = document.getElementById('newGuruMapel').value.trim();
      const jk = document.getElementById('newGuruJK').value;
      const hp = document.getElementById('newGuruHP').value.trim();
      const honor = document.getElementById('newGuruHonor').value.trim();
      const kelasDiampu = Array.from(document.querySelectorAll('.new-guru-kelas:checked')).map(el => el.value);
      if (!nama) { showToast('Nama guru wajib diisi!', 'warning'); return; }
      if (!validateNama(nama)) { showToast('Nama harus 2-100 karakter!', 'error'); return; }
      try {
        const payload = {
          nama: sanitizeInput(nama), nip: sanitizeInput(nip || '-'), mapel: sanitizeInput(mapel || '-'),
          jk: sanitizeInput(jk), no_hp: sanitizeInput(hp || '-'), guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        };
        if (honor) payload.honor_harian = parseInt(honor) || null;
        if (kelasDiampu.length > 0) payload.kelas_diampu = kelasDiampu;
        await db.ref('teachers').push(payload);
        showToast('✅ Guru berhasil ditambahkan!', 'success');
        document.getElementById('tambahGuruModal').remove();
        loadTeacherAttendance();
      } catch (error) { console.error('Error adding teacher:', error); showToast('❌ Gagal menambahkan guru', 'error'); }
    }

    async function editGuru(id) {
      if (!requireStaffRole('mengedit data guru')) return;
      const teacher = allTeachers.find(t => t.id === id);
      if (!teacher) { showToast('Data tidak ditemukan!', 'error'); return; }
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'editGuruModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">✏️ Edit Guru</h3>
          <div style="margin-bottom:12px;"><label class="label">Nama Lengkap</label><input type="text" class="field" id="editGuruNama" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">NIP</label><input type="text" class="field" id="editGuruNIP" maxlength="30"></div>
          <div style="margin-bottom:12px;"><label class="label">Mata Pelajaran</label><input type="text" class="field" id="editGuruMapel" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Jenis Kelamin</label><select class="field" id="editGuruJK"><option value="L" ${teacher.jk==='L'?'selected':''}>Laki-laki</option><option value="P" ${teacher.jk==='P'?'selected':''}>Perempuan</option></select></div>
          <div style="margin-bottom:12px;"><label class="label">No. HP</label><input type="text" class="field" id="editGuruHP" maxlength="15"></div>
          <div style="margin-bottom:16px;"><label class="label">Honor per Hari (Rp) — opsional</label><input type="number" class="field" id="editGuruHonor" placeholder="Kosongkan untuk pakai default"></div>
          <div style="margin-bottom:16px;">
            <label class="label">Kelas yang Diampu (untuk Absensi/Nilai/Jurnal)</label>
            <div style="display:flex;gap:14px;flex-wrap:wrap;">
              ${KELAS_LIST.map(k => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;"><input type="checkbox" class="edit-guru-kelas" value="${escapeHtml(k)}" ${(teacher.kelas_diampu || []).includes(k) ? 'checked' : ''}> Kelas ${escapeHtml(k)}</label>`).join('')}
            </div>
            <p style="font-size:11px;color:#6b7280;margin-top:4px;">Kosongkan semua kalau guru ini boleh mengelola SEMUA kelas (mis. Kepala Sekolah).</p>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, () => updateGuru('${escapeHtml(id)}'))">💾 Update</button><button class="btn btn-soft" onclick="document.getElementById('editGuruModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('editGuruNama').value = teacher.nama || '';
      document.getElementById('editGuruNIP').value = teacher.nip || '';
      document.getElementById('editGuruMapel').value = teacher.mapel || '';
      document.getElementById('editGuruHP').value = teacher.no_hp || '';
      document.getElementById('editGuruHonor').value = teacher.honor_harian || '';
    }

    async function updateGuru(id) {
      if (!requireStaffRole('mengedit data guru')) return;
      const nama = document.getElementById('editGuruNama').value.trim();
      const nip = document.getElementById('editGuruNIP').value.trim();
      const mapel = document.getElementById('editGuruMapel').value.trim();
      const jk = document.getElementById('editGuruJK').value;
      const hp = document.getElementById('editGuruHP').value.trim();
      const honor = document.getElementById('editGuruHonor').value.trim();
      const kelasDiampu = Array.from(document.querySelectorAll('.edit-guru-kelas:checked')).map(el => el.value);
      if (!nama) { showToast('Nama guru wajib diisi!', 'warning'); return; }
      if (!validateNama(nama)) { showToast('Nama harus 2-100 karakter!', 'error'); return; }
      try {
        await db.ref(`teachers/${id}`).update({
          nama: sanitizeInput(nama), nip: sanitizeInput(nip || '-'), mapel: sanitizeInput(mapel || '-'),
          jk: sanitizeInput(jk), no_hp: sanitizeInput(hp || '-'), honor_harian: honor ? parseInt(honor) : null,
          kelas_diampu: kelasDiampu.length > 0 ? kelasDiampu : null,
          updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('✅ Data guru berhasil diupdate!', 'success');
        document.getElementById('editGuruModal').remove();
        loadTeacherAttendance();
      } catch (error) { console.error('Error updating teacher:', error); showToast('❌ Gagal mengupdate guru', 'error'); }
    }

    async function deleteGuru(id) {
      if (!requireStaffRole('menghapus data guru')) return;
      const teacher = allTeachers.find(t => t.id === id);
      if (!teacher) return;
      if (!confirm(`Yakin ingin menghapus guru "${teacher.nama}"?`)) return;
      try { await db.ref(`teachers/${id}`).remove(); showToast('🗑️ Guru berhasil dihapus!', 'success'); loadTeacherAttendance(); }
      catch (error) { console.error('Error deleting teacher:', error); showToast('❌ Gagal menghapus guru', 'error'); }
    }

    // ============================================================
    // REKAP, REKAP NILAI, HONOR, SURAT, JADWAL, PROMOTION, SETTING JAM, LAPORAN, USER MANAGEMENT, ADMIN, PROFIL
    // ============================================================
    // Semua fungsi ini sudah lengkap di kode sebelumnya, saya akan singkatkan di sini

    // REKAP
    let rekapSiswaCache = [];

    async function loadRekap() {
      const guruBtn = document.getElementById('tabRekapGuruBtn');
      const jurnalBtn = document.getElementById('tabRekapJurnalBtn');
      const canSeeGuruJurnalTabs = currentRole === 'admin' || !!currentUser?.teacher_id;
      if (guruBtn) guruBtn.style.display = canSeeGuruJurnalTabs ? 'inline-flex' : 'none';
      if (jurnalBtn) jurnalBtn.style.display = canSeeGuruJurnalTabs ? 'inline-flex' : 'none';
      const bulan = document.getElementById('rekapBulan').value || getMonth();
      document.getElementById('rekapBulan').value = bulan;
      showLoading(true, 'Memuat rekap...');
      try {
        const myKelas = await getMyKelasDiampu();
        const [studentsSnap, attendanceSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('attendance').orderByKey().startAt(`${bulan}-01`).endAt(`${bulan}-31`).once('value') // cuma bulan terpilih
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        const attendance = attendanceSnap.val() || {};
        const monthAttendance = {};
        for (const [date, records] of Object.entries(attendance)) {
          if (date.startsWith(bulan)) monthAttendance[date] = records;
        }
        const entries = Object.entries(students);
        rekapSiswaCache = entries.map(([id, student]) => {
          let hadir = 0, sakit = 0, izin = 0, alpa = 0, total = 0;
          for (const [date, records] of Object.entries(monthAttendance)) {
            if (records[id]) {
              const status = records[id].status;
              if (status === 'H') hadir++;
              else if (status === 'S') sakit++;
              else if (status === 'I') izin++;
              else if (status === 'A') alpa++;
              total++;
            }
          }
          return { id, nama: student.nama || '-', kelas: student.kelas || '-', hadir, sakit, izin, alpa, total };
        });
        renderRekapSiswaTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading rekap:', error);
        showToast('Gagal memuat rekap', 'error');
        showLoading(false);
      }
    }

    function renderRekapSiswaTable() {
      const container = document.getElementById('rekapTableBody');
      if (!container) return;
      if (rekapSiswaCache.length === 0) {
        container.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data siswa</td></tr>';
        return;
      }
      const query = (document.getElementById('rekapSiswaSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('rekapSiswaSort')?.value || '';
      let filtered = rekapSiswaCache;
      if (query) filtered = filtered.filter(r => r.nama.toLowerCase().includes(query) || r.kelas.toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => a.nama.localeCompare(b.nama));
      else if (sortBy === 'kelas') filtered.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
      else if (sortBy === 'hadir_desc') filtered.sort((a, b) => b.hadir - a.hadir);
      else if (sortBy === 'alpa_desc') filtered.sort((a, b) => b.alpa - a.alpa);

      if (filtered.length === 0) {
        container.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada siswa yang cocok dengan pencarian</td></tr>`;
        return;
      }
      container.innerHTML = filtered.map((r, idx) =>
        `<tr><td>${idx + 1}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.kelas)}</td><td>${r.hadir}</td><td>${r.sakit}</td><td>${r.izin}</td><td>${r.alpa}</td><td>${r.total}</td></tr>`
      ).join('');
    }


    function exportRekapExcel() {
      showLoading(true, 'Membuat file Excel...');
      try {
        const table = document.querySelector('#rekapTableBody');
        if (!table) { showToast('Tidak ada data untuk diexport', 'warning'); showLoading(false); return; }
        const rows = table.querySelectorAll('tr');
        const data = [];
        const headers = ['No', 'Nama', 'Kelas', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total'];
        data.push(headers);
        rows.forEach(row => {
          const cols = row.querySelectorAll('td');
          if (cols.length > 0) {
            const rowData = [];
            cols.forEach(col => rowData.push(col.textContent.trim()));
            data.push(rowData);
          }
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
        XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
        XLSX.writeFile(wb, `Rekap_Absensi_${getToday()}.xlsx`);
        showToast('✅ Export Excel berhasil!', 'success');
        showLoading(false);
      } catch (error) {
        console.error('Error exporting Excel:', error);
        showToast('Gagal export Excel', 'error');
        showLoading(false);
      }
    }

    // REKAP ABSEN GURU
    function switchRekapTab(tab) {
      const canSeeGuruJurnal = currentRole === 'admin' || !!currentUser?.teacher_id;
      if ((tab === 'guru' || tab === 'jurnal') && !canSeeGuruJurnal) {
        showToast('⛔ Anda tidak punya akses ke rekap ini', 'error');
        tab = 'siswa';
      }
      const siswaBtn = document.getElementById('tabRekapSiswaBtn');
      const guruBtn = document.getElementById('tabRekapGuruBtn');
      const jurnalBtn = document.getElementById('tabRekapJurnalBtn');
      const siswaSection = document.getElementById('rekapSiswaSection');
      const guruSection = document.getElementById('rekapGuruSection');
      const jurnalSection = document.getElementById('rekapJurnalSection');
      siswaSection.style.display = 'none';
      guruSection.style.display = 'none';
      jurnalSection.style.display = 'none';
      siswaBtn.className = 'btn btn-soft';
      guruBtn.className = 'btn btn-soft';
      jurnalBtn.className = 'btn btn-soft';
      if (tab === 'guru') {
        guruSection.style.display = 'block'; guruBtn.className = 'btn btn-primary';
        loadRekapGuru();
      } else if (tab === 'jurnal') {
        jurnalSection.style.display = 'block'; jurnalBtn.className = 'btn btn-primary';
        loadRekapJurnal();
      } else {
        siswaSection.style.display = 'block'; siswaBtn.className = 'btn btn-primary';
      }
    }

    async function loadRekapGuru() {
      const isAdminRekap = currentRole === 'admin';
      if (!isAdminRekap && !currentUser?.teacher_id) {
        showToast('⛔ Rekap Absen Guru hanya untuk Admin (akun guru bisa lihat rekap milik sendiri)', 'error');
        return;
      }
      const bulanInput = document.getElementById('rekapGuruBulan');
      if (bulanInput && !bulanInput.value) bulanInput.value = getMonth();
      const periode = bulanInput.value;
      showLoading(true, 'Memuat rekap guru...');
      try {
        const [teachersSnap, attendanceSnap] = await Promise.all([
          db.ref('teachers').once('value'),
          db.ref('teacher_attendance').orderByKey().startAt(`${periode}-01`).endAt(`${periode}-31`).once('value') // cuma bulan terpilih
        ]);
        const teachers = teachersSnap.val() || {};
        const teacherAttendance = attendanceSnap.val() || {};
        const monthDates = Object.keys(teacherAttendance).filter(date => date.startsWith(periode));
        window.__rekapGuruData = Object.entries(teachers)
          .filter(([id]) => isAdminRekap || id === currentUser.teacher_id) // non-admin: cuma baris milik sendiri
          .map(([id, t]) => {
            let hadir = 0, telat = 0, pulangAwal = 0, totalMenitTelat = 0;
            monthDates.forEach(date => {
              const rec = teacherAttendance[date][id];
              if (rec?.datang) {
                hadir++;
                if (rec.datang.telat) { telat++; totalMenitTelat += rec.datang.telatMenit || 0; }
              }
              if (rec?.pulang?.pulang_awal) pulangAwal++;
            });
            const persen = monthDates.length > 0 ? Math.round((hadir / monthDates.length) * 100) : 0;
            return { nama: t.nama || '-', nip: t.nip || '-', hadir, tercatat: monthDates.length, persen, telat, pulangAwal, totalMenitTelat };
          });
        renderRekapGuruTable();
      } catch (error) {
        console.error('Error loading rekap guru:', error);
        showToast('❌ Gagal memuat rekap guru', 'error');
        const tbody = document.getElementById('rekapGuruTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#dc2626;">Gagal memuat data</td></tr>';
      }
      showLoading(false);
    }

    function renderRekapGuruTable() {
      const tbody = document.getElementById('rekapGuruTableBody');
      if (!tbody) return;
      const rows = window.__rekapGuruData || [];
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data guru</td></tr>';
        return;
      }
      const query = (document.getElementById('rekapGuruSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('rekapGuruSort')?.value || '';
      let filtered = rows;
      if (query) filtered = filtered.filter(r => r.nama.toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => a.nama.localeCompare(b.nama));
      else if (sortBy === 'persen_desc') filtered.sort((a, b) => b.persen - a.persen);
      else if (sortBy === 'persen_asc') filtered.sort((a, b) => a.persen - b.persen);
      else if (sortBy === 'telat_desc') filtered.sort((a, b) => b.telat - a.telat);

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada guru yang cocok dengan pencarian</td></tr>';
        return;
      }
      tbody.innerHTML = filtered.map((r, idx) => `<tr>
        <td>${idx + 1}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.nip)}</td><td>${r.hadir}</td><td>${r.tercatat}</td><td>${r.persen}%</td>
        <td style="${r.telat > 0 ? 'color:#dc2626;font-weight:600;' : ''}">${r.telat}${r.telat > 0 ? ` (${r.totalMenitTelat} mnt)` : ''}</td>
        <td style="${r.pulangAwal > 0 ? 'color:#d97706;font-weight:600;' : ''}">${r.pulangAwal}</td>
      </tr>`).join('');
    }

    function exportRekapGuruExcel() {
      const rows = window.__rekapGuruData;
      if (!rows || rows.length === 0) { showToast('Belum ada data untuk diexport!', 'warning'); return; }
      const periode = document.getElementById('rekapGuruBulan')?.value || getMonth();
      const data = [
        ['No', 'Nama', 'NIP', 'Hadir', 'Hari Tercatat', '% Kehadiran', 'Telat', 'Menit Telat', 'Pulang Awal'],
        ...rows.map((r, idx) => [idx + 1, r.nama, r.nip, r.hadir, r.tercatat, `${r.persen}%`, r.telat, r.totalMenitTelat, r.pulangAwal])
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Guru');
      XLSX.writeFile(wb, `Rekap_Absen_Guru_${periode}.xlsx`);
      showToast('✅ Export Excel berhasil!', 'success');
    }

    function cetakRekapGuru() {
      const rows = window.__rekapGuruData;
      if (!rows || rows.length === 0) { showToast('Belum ada data untuk dicetak!', 'warning'); return; }
      const periode = document.getElementById('rekapGuruBulan')?.value || getMonth();
      const [tahun, bulan] = periode.split('-');
      const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';

      const baris = rows.map((r, idx) => `<tr>
        <td style="text-align:center;">${idx + 1}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.nip)}</td>
        <td style="text-align:center;">${r.hadir}</td><td style="text-align:center;">${r.tercatat}</td><td style="text-align:center;">${r.persen}%</td>
        <td style="text-align:center;">${r.telat}${r.telat > 0 ? ` (${r.totalMenitTelat}mnt)` : ''}</td>
        <td style="text-align:center;">${r.pulangAwal}</td>
      </tr>`).join('');

      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Rekap Absen Guru - ${namaBulan}</title>
        <style>
          body { font-family:Arial,sans-serif; font-size:12px; padding:24px; color:#111827; }
          h1 { text-align:center; font-size:16px; margin-bottom:2px; }
          h2 { text-align:center; font-size:13px; font-weight:normal; margin-top:0; margin-bottom:20px; color:#374151; }
          table { border-collapse:collapse; width:100%; margin-top:12px; }
          th, td { border:1px solid #9ca3af; padding:6px 8px; font-size:11px; }
          th { background:#f3f4f6; text-align:center; }
          .ttd { margin-top:50px; display:flex; justify-content:flex-end; }
          .ttd div { text-align:center; width:220px; }
          .ttd .garis { margin-top:60px; border-top:1px solid #111827; padding-top:4px; }
          @media print { body { padding:10px; } }
        </style></head><body>
          <h1>${escapeHtml(namaSekolah)}</h1>
          <h2>Laporan Rekap Kehadiran Guru — ${namaBulan}</h2>
          <table>
            <thead><tr><th>No</th><th>Nama</th><th>NIP</th><th>Hadir</th><th>Hari Tercatat</th><th>% Kehadiran</th><th>Telat</th><th>Pulang Awal</th></tr></thead>
            <tbody>${baris}</tbody>
          </table>
          <div class="ttd">
            <div>
              <p>Mengetahui,<br>Kepala Sekolah</p>
              <p class="garis">(________________________)</p>
            </div>
          </div>
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    // REKAP JURNAL
    let rekapJurnalCache = [];

    async function loadRekapJurnal() {
      const isAdminRekap = currentRole === 'admin';
      if (!isAdminRekap && !currentUser?.teacher_id) {
        showToast('⛔ Rekap Jurnal hanya untuk Admin (akun guru bisa lihat rekap milik sendiri)', 'error');
        return;
      }
      const bulanInput = document.getElementById('rekapJurnalBulan');
      if (bulanInput && !bulanInput.value) bulanInput.value = getMonth();
      const periode = bulanInput.value;
      showLoading(true, 'Memuat rekap jurnal...');
      try {
        const [journalSnap, teachersSnap] = await Promise.all([
          db.ref('journal').once('value'), db.ref('teachers').once('value')
        ]);
        const journalData = journalSnap.val() || {};
        const teachers = teachersSnap.val() || {};

        // Kelompokkan per guru (utamakan guruKey; fallback ke nama untuk
        // entri lama yang belum termigrasi) - konsisten dengan pola di Jurnal Mengajar.
        const grouped = {}; // key: guruKey atau nama, value: { nama, jumlah, mapelTerakhir, tanggalTerakhir }
        Object.values(journalData).forEach(j => {
          if (!j.tanggal || !j.tanggal.startsWith(periode)) return;
          if (!isAdminRekap && j.guruKey !== currentUser.teacher_id) return; // non-admin: cuma jurnal milik sendiri
          const key = j.guruKey || `nama:${j.guru || '-'}`;
          const namaTampil = (j.guruKey && teachers[j.guruKey]?.nama) || j.guru || '-';
          if (!grouped[key]) grouped[key] = { nama: namaTampil, jumlah: 0, mapelTerakhir: '-', tanggalTerakhir: '' };
          grouped[key].jumlah++;
          if (j.tanggal > grouped[key].tanggalTerakhir) {
            grouped[key].tanggalTerakhir = j.tanggal;
            grouped[key].mapelTerakhir = j.mapel || '-';
          }
          grouped[key].nama = namaTampil; // selalu pakai nama paling segar
        });

        rekapJurnalCache = Object.values(grouped);
        renderRekapJurnalTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading rekap jurnal:', error);
        showToast('Gagal memuat rekap jurnal', 'error');
        showLoading(false);
      }
    }

    function renderRekapJurnalTable() {
      const tbody = document.getElementById('rekapJurnalTableBody');
      if (!tbody) return;
      if (rekapJurnalCache.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280;">Belum ada jurnal pada bulan ini</td></tr>';
        return;
      }
      const query = (document.getElementById('rekapJurnalSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('rekapJurnalSort')?.value || '';
      let filtered = rekapJurnalCache;
      if (query) filtered = filtered.filter(r => r.nama.toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => a.nama.localeCompare(b.nama));
      else if (sortBy === 'jumlah_desc') filtered.sort((a, b) => b.jumlah - a.jumlah);
      else if (sortBy === 'jumlah_asc') filtered.sort((a, b) => a.jumlah - b.jumlah);
      else filtered.sort((a, b) => b.jumlah - a.jumlah); // default: terbanyak dulu

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada guru yang cocok dengan pencarian</td></tr>';
        return;
      }
      tbody.innerHTML = filtered.map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(r.nama)}</td>
          <td>${r.jumlah}</td>
          <td>${escapeHtml(r.mapelTerakhir)}</td>
          <td>${r.tanggalTerakhir ? formatDate(r.tanggalTerakhir) : '-'}</td>
        </tr>
      `).join('');
    }

    function exportRekapJurnalExcel() {
      if (rekapJurnalCache.length === 0) { showToast('Belum ada data untuk diexport!', 'warning'); return; }
      const periode = document.getElementById('rekapJurnalBulan')?.value || getMonth();
      const data = [['No', 'Nama Guru', 'Jumlah Jurnal', 'Mapel Terakhir', 'Tanggal Terakhir'],
        ...rekapJurnalCache.map((r, idx) => [idx + 1, r.nama, r.jumlah, r.mapelTerakhir, r.tanggalTerakhir ? formatDate(r.tanggalTerakhir) : '-'])];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Jurnal');
      XLSX.writeFile(wb, `Rekap_Jurnal_${periode}.xlsx`);
      showToast('✅ Export Excel berhasil!', 'success');
    }

    // REKAP NILAI
    let rekapNilaiCache = [];

    async function loadRekapNilai() {
      showLoading(true, 'Memuat rekap capaian...');
      try {
        const kelas = document.getElementById('rekapNilaiKelas').value;
        const semester = document.getElementById('rekapNilaiSemester').value;
        const [studentsSnap, gradesSnap, subjectsSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('grades').once('value'),
          db.ref('subjects').once('value')
        ]);
        const students = studentsSnap.val() || {};
        const grades = gradesSnap.val() || {};
        const subjectsData = subjectsSnap.val() || {};
        const entries = Object.entries(students).filter(([id, s]) => !kelas || s.kelas === kelas);

        // Aspek perkembangan diambil dinamis dari database (bukan hardcode).
        // Fallback ke 6 aspek standar kurikulum PAUD kalau data aspek belum diisi.
        let subjectEntries = Object.entries(subjectsData);
        if (subjectEntries.length === 0) {
          const kurikulum = await getKurikulumSetting();
          const aspekDefault = getAspekDefault(kurikulum);
          subjectEntries = Object.entries(aspekDefault).map(([kode, nama]) => [kode, { kode, nama }]);
        }
        window.__rekapNilaiSubjects = subjectEntries;

        const headRow = document.getElementById('rekapNilaiHeadRow');
        if (headRow) {
          headRow.innerHTML = `<th>No</th><th>Nama</th><th>Kelas</th>` +
            subjectEntries.map(([id, s]) => `<th>${escapeHtml(s.kode || s.nama)}</th>`).join('');
        }

        rekapNilaiCache = entries.map(([id, student]) => {
          const levels = subjectEntries.map(([subjectId]) => grades[id]?.[subjectId]?.[semester]?.nilai);
          return { id, nama: student.nama || '-', kelas: student.kelas || '-', levels };
        });
        renderRekapNilaiTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading rekap nilai:', error);
        showToast('Gagal memuat rekap capaian', 'error');
        showLoading(false);
      }
    }

    function renderRekapNilaiTable() {
      const container = document.getElementById('rekapNilaiBody');
      if (!container) return;
      const subjectEntries = window.__rekapNilaiSubjects || [];
      const colspan = 3 + subjectEntries.length;
      if (rekapNilaiCache.length === 0) {
        container.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data siswa</td></tr>`;
        return;
      }
      const query = (document.getElementById('rekapNilaiSearch')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('rekapNilaiSort')?.value || '';
      let filtered = rekapNilaiCache;
      if (query) filtered = filtered.filter(r => r.nama.toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => a.nama.localeCompare(b.nama));
      else if (sortBy === 'nama_desc') filtered.sort((a, b) => b.nama.localeCompare(a.nama));

      if (filtered.length === 0) {
        container.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada siswa yang cocok dengan pencarian</td></tr>`;
        return;
      }
      container.innerHTML = filtered.map((r, idx) => {
        const cells = r.levels.map(level => `<td>${capaianBadge(level)}</td>`).join('');
        return `<tr class="siswa-row"><td>${idx + 1}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.kelas)}</td>${cells}</tr>`;
      }).join('');
    }

    function exportRekapNilaiExcel() {
      showLoading(true, 'Membuat file Excel...');
      try {
        const table = document.getElementById('rekapNilaiTable');
        if (!table) { showToast('Tidak ada data untuk diexport', 'warning'); showLoading(false); return; }
        const wb = XLSX.utils.table_to_book(table);
        XLSX.writeFile(wb, `Rekap_Nilai_${getToday()}.xlsx`);
        showToast('✅ Export Excel berhasil!', 'success');
        showLoading(false);
      } catch (error) {
        console.error('Error exporting Excel:', error);
        showToast('Gagal export Excel', 'error');
        showLoading(false);
      }
    }

