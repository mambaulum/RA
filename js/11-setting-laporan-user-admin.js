    // SETTING JAM
    async function loadSettingJam() {
      showLoading(true, 'Memuat data jam pelajaran...');
      try {
        const snapshot = await db.ref('jam_pelajaran').once('value');
        const data = snapshot.val() || {};
        allJams = Object.entries(data).map(([key, val]) => ({ ...val, id: key }));
        renderJamList();
        renderPreviewJadwal();
        showLoading(false);
      } catch (error) {
        console.error('Error loading jam:', error);
        showToast('❌ Gagal memuat jam pelajaran', 'error');
        showLoading(false);
      }
    }

    function renderJamList() {
      const container = document.getElementById('jamList');
      if (!container) return;
      if (allJams.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:30px;color:#6b7280;">
            <div style="font-size:48px;margin-bottom:12px;">🕐</div>
            <p>Belum ada jam pelajaran</p>
            <button class="btn btn-primary" style="margin-top:12px;" onclick="guardedCall(this, tambahJam)">➕ Tambah Jam Pertama</button>
          </div>
        `;
        return;
      }
      const sortedJams = [...allJams].sort((a, b) => (a.mulai || '00:00').localeCompare(b.mulai || '00:00'));
      container.innerHTML = sortedJams.map((jam, index) => `
        <div class="jam-item ${jam.extra ? 'extra' : ''}" 
             style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:${jam.extra ? '#f5f3ff' : '#f8fafc'};border-radius:8px;margin-bottom:6px;flex-wrap:wrap;border-left:4px solid ${jam.extra ? '#7c3aed' : '#2563eb'};">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:150px;">
            <span style="font-weight:700;width:24px;text-align:center;color:#6b7280;">${index + 1}</span>
            <input type="text" id="jam_nama_${escapeHtml(jam.id)}" 
                   style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;width:120px;background:white;" placeholder="Nama Jam">
            <span style="font-size:12px;color:#6b7280;">⏰</span>
            <input type="time" id="jam_mulai_${escapeHtml(jam.id)}" 
                   style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;width:90px;background:white;">
            <span style="font-size:12px;color:#6b7280;">s/d</span>
            <input type="time" id="jam_selesai_${escapeHtml(jam.id)}" 
                   style="padding:4px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;width:90px;background:white;">
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="jam_extra_${jam.id}" ${jam.extra ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
              <span style="color:#7c3aed;font-weight:600;">⭐ Extra</span>
            </label>
            <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;min-height:30px;" onclick="hapusJam('${escapeHtml(jam.id)}')">🗑️</button>
          </div>
        </div>
      `).join('');
      // Isi value nama/mulai/selesai lewat properti JS (bukan atribut HTML) - aman dari quote-breakout.
      sortedJams.forEach((jam, index) => {
        const namaEl = document.getElementById(`jam_nama_${jam.id}`);
        const mulaiEl = document.getElementById(`jam_mulai_${jam.id}`);
        const selesaiEl = document.getElementById(`jam_selesai_${jam.id}`);
        if (namaEl) namaEl.value = jam.nama || `Jam ${index + 1}`;
        if (mulaiEl) mulaiEl.value = jam.mulai || '07:30';
        if (selesaiEl) selesaiEl.value = jam.selesai || '08:15';
      });
    }

    function renderPreviewJadwal() {
      const container = document.getElementById('previewJadwal');
      if (!container) return;
      if (allJams.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:12px;color:#6b7280;">Tambahkan jam pelajaran untuk melihat preview</div>';
        return;
      }
      const sortedJams = [...allJams].sort((a, b) => (a.mulai || '00:00').localeCompare(b.mulai || '00:00'));
      const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      let html = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="padding:6px 8px;background:#f3f4f6;border:1px solid #e5e7eb;text-align:center;min-width:80px;">Jam</th>${hariList.map(h => `<th style="padding:6px 8px;background:#f3f4f6;border:1px solid #e5e7eb;text-align:center;min-width:80px;">${h}</th>`).join('')}</tr></thead><tbody>`;
      sortedJams.forEach((jam, idx) => {
        const waktu = `${jam.mulai || '07:30'} - ${jam.selesai || '08:15'}`;
        const nama = jam.nama || `Jam ${idx + 1}`;
        const isExtra = jam.extra ? '⭐' : '';
        html += `<tr><td style="padding:4px 6px;border:1px solid #e5e7eb;font-weight:600;text-align:center;font-size:11px;background:#f8fafc;">${escapeHtml(nama)}<br><span style="font-size:10px;color:#6b7280;">${escapeHtml(waktu)}</span>${isExtra ? `<span style="font-size:10px;color:#7c3aed;"> ${isExtra}</span>` : ''}</td>${hariList.map(() => `<td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">-</td>`).join('')}</tr>`;
      });
      html += `</tbody></table></div><div style="margin-top:8px;font-size:11px;color:#6b7280;text-align:right;">* Isi jadwal di menu Jadwal untuk mengisi mata pelajaran</div>`;
      container.innerHTML = html;
    }

    function tambahJam() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'tambahJamModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">🕐 Tambah Jam Pelajaran</h3>
          <div style="margin-bottom:12px;"><label class="label">Nama Jam</label><input type="text" class="field" id="newJamNama" placeholder="Contoh: Jam 1" maxlength="50" value="Jam ${allJams.length + 1}"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><label class="label">Jam Mulai</label><input type="time" class="field" id="newJamMulai" value="07:30"></div>
            <div><label class="label">Jam Selesai</label><input type="time" class="field" id="newJamSelesai" value="08:15"></div>
          </div>
          <div style="margin-top:12px;margin-bottom:16px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="newJamExtra" style="width:18px;height:18px;cursor:pointer;"><span style="font-weight:600;color:#7c3aed;">⭐ Jam Ekstrakurikuler</span></label></div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, tambahJamSimpan)">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('tambahJamModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    async function tambahJamSimpan() {
      const nama = document.getElementById('newJamNama').value.trim();
      const mulai = document.getElementById('newJamMulai').value;
      const selesai = document.getElementById('newJamSelesai').value;
      const extra = document.getElementById('newJamExtra').checked;
      if (!nama) { showToast('Nama jam wajib diisi!', 'warning'); return; }
      if (!mulai || !selesai) { showToast('Jam mulai dan selesai wajib diisi!', 'warning'); return; }
      if (mulai >= selesai) { showToast('Jam mulai harus sebelum jam selesai!', 'error'); return; }
      const existing = allJams.find(j => j.mulai === mulai && j.selesai === selesai);
      if (existing) { showToast(`⚠️ Jam ${mulai} - ${selesai} sudah ada!`, 'warning'); return; }
      try {
        await db.ref('jam_pelajaran').push({
          nama: sanitizeInput(nama), mulai: sanitizeInput(mulai), selesai: sanitizeInput(selesai),
          extra: extra, guruKey: currentUser?.id || null, created_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('✅ Jam pelajaran berhasil ditambahkan!', 'success');
        document.getElementById('tambahJamModal').remove();
        loadSettingJam();
      } catch (error) { console.error('Error adding jam:', error); showToast('❌ Gagal menambah jam', 'error'); }
    }

    async function hapusJam(id) {
      const jam = allJams.find(j => j.id === id);
      if (!jam) return;
      if (!confirm(`Yakin ingin menghapus jam "${jam.nama || 'Jam'}" (${jam.mulai} - ${jam.selesai})?`)) return;
      try { await db.ref(`jam_pelajaran/${id}`).remove(); showToast('✅ Jam berhasil dihapus!', 'success'); loadSettingJam(); }
      catch (error) { console.error('Error deleting jam:', error); showToast('❌ Gagal menghapus jam', 'error'); }
    }

    async function simpanJam() {
      if (allJams.length === 0) { showToast('Belum ada jam untuk disimpan', 'warning'); return; }
      showLoading(true, 'Menyimpan perubahan...');
      try {
        const updates = {};
        let hasChanges = false;
        for (const jam of allJams) {
          const nama = document.getElementById(`jam_nama_${jam.id}`)?.value.trim();
          const mulai = document.getElementById(`jam_mulai_${jam.id}`)?.value;
          const selesai = document.getElementById(`jam_selesai_${jam.id}`)?.value;
          const extra = document.getElementById(`jam_extra_${jam.id}`)?.checked || false;
          if (nama && mulai && selesai) {
            if (nama !== jam.nama || mulai !== jam.mulai || selesai !== jam.selesai || extra !== jam.extra) {
              updates[`jam_pelajaran/${jam.id}/nama`] = sanitizeInput(nama);
              updates[`jam_pelajaran/${jam.id}/mulai`] = sanitizeInput(mulai);
              updates[`jam_pelajaran/${jam.id}/selesai`] = sanitizeInput(selesai);
              updates[`jam_pelajaran/${jam.id}/extra`] = extra;
              hasChanges = true;
            }
          }
        }
        if (!hasChanges) { showToast('Tidak ada perubahan yang disimpan', 'info'); showLoading(false); return; }
        await db.ref().update(updates);
        showToast('✅ Semua jam pelajaran berhasil disimpan!', 'success');
        loadSettingJam();
      } catch (error) {
        console.error('Error saving jam:', error);
        showToast('❌ Gagal menyimpan jam pelajaran', 'error');
        showLoading(false);
      }
    }

    // LAPORAN
    const LAPORAN_JUDUL = { absensi: 'Laporan Absensi Siswa', nilai: 'Laporan Nilai Siswa', kehadiran_guru: 'Laporan Kehadiran Guru' };
    let laporanData = null; // { headers, rows, judul, periode } - dipakai bersama oleh preview & export

    function loadLaporan() {
      const periode = document.getElementById('laporanPeriode');
      if (periode && !periode.value) periode.value = getMonth();
    }

    async function generateLaporan() {
      const jenis = document.getElementById('laporanJenis')?.value || 'absensi';
      const periode = document.getElementById('laporanPeriode')?.value || getMonth();
      const preview = document.getElementById('laporanPreview');
      if (!preview) return;
      showLoading(true, 'Membuat laporan...');
      try {
        let headers = [], rows = [];

        if (jenis === 'absensi') {
          const [studentsSnap, attendanceSnap] = await Promise.all([
            db.ref('students').once('value'),
            db.ref('attendance').orderByKey().startAt(`${periode}-01`).endAt(`${periode}-31`).once('value') // cuma bulan terpilih
          ]);
          const students = studentsSnap.val() || {};
          const attendance = attendanceSnap.val() || {};
          const monthAttendance = {};
          for (const [date, records] of Object.entries(attendance)) {
            if (date.startsWith(periode)) monthAttendance[date] = records;
          }
          headers = ['No', 'Nama', 'Kelas', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Total'];
          let no = 1;
          for (const [id, student] of Object.entries(students)) {
            let hadir = 0, sakit = 0, izin = 0, alpa = 0, total = 0;
            for (const records of Object.values(monthAttendance)) {
              if (records[id]) {
                const status = records[id].status;
                if (status === 'H') hadir++; else if (status === 'S') sakit++;
                else if (status === 'I') izin++; else if (status === 'A') alpa++;
                total++;
              }
            }
            rows.push([no++, student.nama || '-', student.kelas || '-', hadir, sakit, izin, alpa, total]);
          }
        } else if (jenis === 'nilai') {
          const [studentsSnap, gradesSnap, tahunSnap, subjectsSnap] = await Promise.all([
            db.ref('students').once('value'), db.ref('grades').once('value'), db.ref('tahun_ajaran').once('value'),
            db.ref('subjects').once('value')
          ]);
          const students = studentsSnap.val() || {};
          const grades = gradesSnap.val() || {};
          const semester = (tahunSnap.val()?.semester) || 1;
          let subjectEntries = Object.entries(subjectsSnap.val() || {});
          if (subjectEntries.length === 0) {
            const kurikulum = await getKurikulumSetting();
            const aspekDefault = getAspekDefault(kurikulum);
            subjectEntries = Object.entries(aspekDefault).map(([kode, nama]) => [kode, { kode, nama }]);
          }
          headers = ['No', 'Nama', 'Kelas', ...subjectEntries.map(([id, s]) => s.kode || s.nama)];
          let no = 1;
          for (const [id, student] of Object.entries(students)) {
            const nilaiRow = subjectEntries.map(([subjectId]) => {
              const level = grades[id]?.[subjectId]?.[semester]?.nilai;
              return level || '-';
            });
            rows.push([no++, student.nama || '-', student.kelas || '-', ...nilaiRow]);
          }
        } else if (jenis === 'kehadiran_guru') {
          const [teachersSnap, teacherAttendanceSnap] = await Promise.all([
            db.ref('teachers').once('value'),
            db.ref('teacher_attendance').orderByKey().startAt(`${periode}-01`).endAt(`${periode}-31`).once('value') // cuma bulan terpilih
          ]);
          const teachers = teachersSnap.val() || {};
          const teacherAttendance = teacherAttendanceSnap.val() || {};
          const monthDates = Object.keys(teacherAttendance).filter(date => date.startsWith(periode));
          headers = ['No', 'Nama', 'NIP', 'Jumlah Hadir', 'Dari Hari Tercatat', '% Kehadiran'];
          let no = 1;
          for (const [id, teacher] of Object.entries(teachers)) {
            let hadir = 0;
            monthDates.forEach(date => { if (teacherAttendance[date][id]?.datang) hadir++; });
            const persen = monthDates.length > 0 ? Math.round((hadir / monthDates.length) * 100) : 0;
            rows.push([no++, teacher.nama || '-', teacher.nip || '-', hadir, monthDates.length, `${persen}%`]);
          }
        }

        laporanData = { headers, rows, judul: LAPORAN_JUDUL[jenis] || 'Laporan', periode };

        if (rows.length === 0) {
          preview.innerHTML = `
            <div class="header">${laporanData.judul}</div>
            <div class="sub-header">Periode: ${formatMonthLabel(periode)}</div>
            <div style="text-align:center;padding:20px;color:#6b7280;">Belum ada data untuk periode ini</div>
          `;
        } else {
          preview.innerHTML = `
            <div class="header">${laporanData.judul}</div>
            <div class="sub-header">Periode: ${formatMonthLabel(periode)}</div>
            <table id="laporanTable">
              <thead><tr>${headers.map(h => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr></thead>
              <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
            <div style="margin-top:16px;text-align:center;font-size:11px;color:#6b7280;">SI MAMBA - RA Mambaul Ulum • Dicetak ${formatDate(getToday())}</div>
          `;
        }
        showToast('✅ Laporan berhasil dibuat', 'success');
      } catch (error) {
        console.error('Error generating laporan:', error);
        showToast('❌ Gagal membuat laporan: ' + error.message, 'error');
      }
      showLoading(false);
    }

    function formatMonthLabel(periode) {
      if (!periode) return '-';
      const [y, m] = periode.split('-');
      const bulanNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
      const idx = parseInt(m, 10) - 1;
      return `${bulanNama[idx] || m} ${y}`;
    }

    function exportLaporanExcel() {
      if (!laporanData || laporanData.rows.length === 0) { showToast('Generate laporan dulu sebelum export!', 'warning'); return; }
      showLoading(true, 'Membuat file Excel...');
      try {
        const data = [laporanData.headers, ...laporanData.rows];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
        XLSX.writeFile(wb, `${laporanData.judul.replace(/\s+/g, '_')}_${laporanData.periode}.xlsx`);
        showToast('✅ Export Excel berhasil!', 'success');
      } catch (error) {
        console.error('Error exporting laporan Excel:', error);
        showToast('❌ Gagal export Excel', 'error');
      }
      showLoading(false);
    }

    function exportLaporanPDF() {
      if (!laporanData || laporanData.rows.length === 0) { showToast('Generate laporan dulu sebelum export!', 'warning'); return; }
      showLoading(true, 'Membuat file PDF...');
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: laporanData.headers.length > 6 ? 'landscape' : 'portrait' });
        doc.setFontSize(14);
        doc.text('SI MAMBA - RA Mambaul Ulum', doc.internal.pageSize.getWidth() / 2, 14, { align: 'center' });
        doc.setFontSize(11);
        doc.text(laporanData.judul, doc.internal.pageSize.getWidth() / 2, 21, { align: 'center' });
        doc.setFontSize(9);
        doc.text(`Periode: ${formatMonthLabel(laporanData.periode)}`, doc.internal.pageSize.getWidth() / 2, 27, { align: 'center' });
        doc.autoTable({ head: [laporanData.headers], body: laporanData.rows, startY: 33, styles: { fontSize: 8 }, headStyles: { fillColor: [15, 59, 44] } });
        doc.save(`${laporanData.judul.replace(/\s+/g, '_')}_${laporanData.periode}.pdf`);
        showToast('✅ Export PDF berhasil!', 'success');
      } catch (error) {
        console.error('Error exporting laporan PDF:', error);
        showToast('❌ Gagal export PDF: ' + error.message, 'error');
      }
      showLoading(false);
    }

    // USER MANAGEMENT
    let usersDataCache = [];
    let teachersDataCache = {};

    async function loadUserManagement() {
      showLoading(true, 'Memuat user...');
      try {
        const [snapshot, teachersSnap] = await Promise.all([
          db.ref('users').once('value'), db.ref('teachers').once('value')
        ]);
        const data = snapshot.val() || {};
        teachersDataCache = teachersSnap.val() || {};
        usersDataCache = Object.entries(data).map(([id, user]) => ({ id, ...user }));
        renderUserTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading users:', error);
        showToast('Gagal memuat user', 'error');
        showLoading(false);
      }
    }

    function renderUserTable() {
      const container = document.getElementById('userTableBody');
      if (!container) return;

      const query = (document.getElementById('usersSearchInput')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('usersSortSelect')?.value || '';

      let filtered = usersDataCache;
      if (query) filtered = filtered.filter(u => (u.nama || '').toLowerCase().includes(query));
      filtered = [...filtered];
      if (sortBy === 'nama_asc') filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      else if (sortBy === 'nama_desc') filtered.sort((a, b) => (b.nama || '').localeCompare(a.nama || ''));
      else if (sortBy === 'role') filtered.sort((a, b) => (a.role || '').localeCompare(b.role || '') || (a.nama || '').localeCompare(b.nama || ''));

      if (filtered.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">${query ? 'Tidak ada user yang cocok dengan pencarian' : 'Belum ada user'}</td></tr>`;
        return;
      }
      container.innerHTML = filtered.map((user) => {
        const id = user.id;
        let sinkronCell = '<span style="font-size:11px;color:#9ca3af;">-</span>';
        if (bolehDikaitkanKeGuru(user.role)) {
          const linkedTeacher = user.teacher_id ? teachersDataCache[user.teacher_id] : null;
          sinkronCell = linkedTeacher
            ? `<span style="font-size:11px;background:#dcfce7;color:#065f46;padding:3px 8px;border-radius:10px;">🔗 ${escapeHtml(linkedTeacher.nama || '-')}</span>`
            : `<span style="font-size:11px;background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:10px;">⚠️ Belum terhubung</span> <button class="btn btn-soft" style="padding:2px 8px;font-size:10px;min-height:24px;" onclick="linkUserToTeacher('${escapeHtml(id)}')">🔗 Hubungkan</button>`;
        }
        const isPetugasInfaq = user.role === 'admin' ? true : !!user.petugas_infaq;
        const infaqCell = user.role === 'admin'
          ? '<span style="font-size:11px;color:#6b7280;">Selalu (Admin)</span>'
          : `<button class="btn ${isPetugasInfaq ? 'btn-success' : 'btn-soft'}" style="padding:2px 10px;font-size:11px;min-height:26px;" onclick="togglePetugasInfaq('${escapeHtml(id)}', ${isPetugasInfaq})">${isPetugasInfaq ? '✅ Petugas' : '➕ Jadikan Petugas'}</button>`;
        return `
        <tr>
          <td>${escapeHtml(user.nama||'-')}</td>
          <td><span class="role-badge ${escapeHtml(user.role||'guru')}">${escapeHtml(user.role||'guru')}</span></td>
          <td>${user.pin_hash ? '<span style="font-size:11px;color:#059669;">🔒 Ter-enkripsi</span>' : (user.pin ? '<span style="font-size:11px;color:#d97706;">⚠️ Belum ter-enkripsi (akan otomatis saat login)</span>' : '<span style="font-size:11px;color:#9ca3af;">-</span>')}</td>
          <td>${sinkronCell}</td>
          <td>${infaqCell}</td>
          <td>${id !== currentUser?.id ? `<button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteUser('${escapeHtml(id)}')">🗑️</button>` : '<span style="font-size:11px;color:#6b7280;">(Anda)</span>'}</td>
        </tr>
      `;
      }).join('');
    }

    function showTambahUser() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'tambahUserModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">👤 Tambah User</h3>
          <div style="margin-bottom:12px;"><label class="label">Nama</label><input type="text" class="field" id="newUserName" placeholder="Nama lengkap" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">PIN</label><input type="password" class="field" id="newUserPin" maxlength="6" placeholder="PIN 4-6 digit"></div>
          <div style="margin-bottom:12px;"><label class="label">Role</label><select class="field" id="newUserRole" onchange="toggleNewUserTeacherLink()"><option value="admin">Admin</option><option value="kepsek">Kepala Sekolah</option><option value="wali_kelas">Wali Kelas</option><option value="guru">Guru</option></select></div>
          <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;"><input type="checkbox" id="newUserPetugasInfaq" style="width:16px;height:16px;"><label for="newUserPetugasInfaq" style="font-size:13px;">💰 Jadikan Petugas Infaq (bisa kelola menu Infaq)</label></div>
          <div style="margin-bottom:16px;" id="newUserTeacherLinkWrap">
            <label class="label">Kaitkan dengan Data Guru</label>
            <select class="field" id="newUserTeacherLink"><option value="">-- Belum dikaitkan --</option></select>
            <p style="font-size:11px;color:#6b7280;margin-top:4px;">Supaya akun login ini otomatis muncul di halaman Absen Guru. Kalau belum ada di Data Guru, tambahkan dulu lewat menu Absen Guru.</p>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, tambahUser)">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('tambahUserModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      populateTeacherLinkSelect('newUserTeacherLink');
      toggleNewUserTeacherLink();
    }

    // Dikaitkan ke Data Guru relevan untuk siapa saja yang JUGA mengajar dan perlu
    // absen mandiri lewat QR (lihat js/02-nav-dashboard.js: btnDashboardAbsenMandiri
    // tampil untuk SEMUA role asal currentUser.teacher_id terisi, tidak dibatasi
    // role === 'guru') - jadi field ini dibuka juga untuk wali_kelas, bukan cuma guru.
    function bolehDikaitkanKeGuru(role) {
      return role === 'guru' || role === 'wali_kelas';
    }

    function toggleNewUserTeacherLink() {
      const role = document.getElementById('newUserRole')?.value;
      const wrap = document.getElementById('newUserTeacherLinkWrap');
      if (wrap) wrap.style.display = bolehDikaitkanKeGuru(role) ? 'block' : 'none';
    }

    async function populateTeacherLinkSelect(selectId, excludeLinkedTo) {
      const select = document.getElementById(selectId);
      if (!select) return;
      try {
        const [teachersSnap, usersSnap] = await Promise.all([
          db.ref('teachers').once('value'), db.ref('users').once('value')
        ]);
        const teachers = teachersSnap.val() || {};
        const users = usersSnap.val() || {};
        const linkedTeacherIds = new Set(Object.entries(users).filter(([uid]) => uid !== excludeLinkedTo).map(([, u]) => u.teacher_id).filter(Boolean));
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = '-- Belum dikaitkan --';
        select.appendChild(placeholder);
        Object.entries(teachers).forEach(([id, t]) => {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = (t.nama || '-') + (linkedTeacherIds.has(id) ? ' (sudah terhubung ke user lain)' : '');
          select.appendChild(opt);
        });
      } catch (error) { console.error('Gagal memuat daftar guru untuk dikaitkan:', error); }
    }

    async function tambahUser() {
      if (currentRole !== 'admin') { showToast('⛔ Hanya Admin yang bisa menambah user', 'error'); return; }
      const nama = document.getElementById('newUserName').value.trim();
      const pin = document.getElementById('newUserPin').value.trim();
      const role = document.getElementById('newUserRole').value;
      const teacherId = document.getElementById('newUserTeacherLink')?.value || null;
      const petugasInfaq = document.getElementById('newUserPetugasInfaq')?.checked || false;
      if (!nama || !pin) { showToast('Nama dan PIN wajib diisi!', 'warning'); return; }
      if (!validatePIN(pin)) { showToast('PIN harus 4-6 digit angka!', 'error'); return; }
      if (!validateNama(nama)) { showToast('Nama harus 2-100 karakter!', 'error'); return; }
      try {
        const { pin_salt, pin_hash } = await buatPinHashBaru(pin);
        const payload = { nama: sanitizeInput(nama), pin_salt, pin_hash, role: sanitizeInput(role), guruKey: currentUser?.id || null, created_at: firebase.database.ServerValue.TIMESTAMP };
        if (bolehDikaitkanKeGuru(role) && teacherId) payload.teacher_id = teacherId;
        if (petugasInfaq) payload.petugas_infaq = true;
        await db.ref('users').push(payload);
        showToast('User berhasil ditambahkan! Sampaikan PIN-nya langsung ke yang bersangkutan.', 'success');
        document.getElementById('tambahUserModal').remove();
        loadUserManagement();
        loadUsersForLogin();
      } catch (error) { console.error('Error adding user:', error); showToast('Gagal menambahkan user', 'error'); }
    }

    async function deleteUser(id) {
      if (currentRole !== 'admin') { showToast('⛔ Hanya Admin yang bisa menghapus user', 'error'); return; }
      if (!confirm('Yakin ingin menghapus user ini?')) return;
      try { await db.ref(`users/${id}`).remove(); showToast('User berhasil dihapus!', 'success'); loadUserManagement(); loadUsersForLogin(); }
      catch (error) { console.error('Error deleting user:', error); showToast('Gagal menghapus user', 'error'); }
    }

    // Tunjuk/cabut status "Petugas Infaq" untuk sebuah akun (hanya Admin).
    // Admin selalu punya akses Infaq secara bawaan (lihat canAccessInfaq()),
    // jadi toggle ini cuma relevan untuk akun non-admin (biasanya guru).
    async function togglePetugasInfaq(userId, currentValue) {
      if (currentRole !== 'admin') { showToast('⛔ Hanya Admin yang bisa menunjuk petugas Infaq', 'error'); return; }
      try {
        await db.ref(`users/${userId}/petugas_infaq`).set(!currentValue);
        logActivity(`${!currentValue ? 'Menunjuk' : 'Mencabut'} petugas Infaq untuk user ${userId}`);
        showToast(!currentValue ? '✅ Ditunjuk sebagai petugas Infaq' : '✅ Status petugas Infaq dicabut', 'success');
        loadUserManagement();
        // Kalau yang diubah kebetulan akun yang sedang login sendiri, sinkronkan sesi lokal juga
        if (currentUser?.id === userId) {
          currentUser.petugas_infaq = !currentValue;
          localStorage.setItem('user', JSON.stringify(currentUser));
          updateMenuByRole(currentRole);
        }
      } catch (error) {
        console.error('Error toggle petugas infaq:', error);
        showToast('❌ Gagal mengubah status petugas Infaq', 'error');
      }
    }

    // Kaitkan user (role guru) yang sudah ada ke Data Guru
    async function linkUserToTeacher(userId) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'linkUserTeacherModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">🔗 Kaitkan ke Data Guru</h3>
          <div style="margin-bottom:16px;">
            <label class="label">Pilih Data Guru</label>
            <select class="field" id="linkTeacherSelect"><option value="">-- Belum dikaitkan --</option></select>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, () => saveLinkUserToTeacher('${escapeHtml(userId)}'))">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('linkUserTeacherModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      await populateTeacherLinkSelect('linkTeacherSelect', userId);
    }

    async function saveLinkUserToTeacher(userId) {
      const teacherId = document.getElementById('linkTeacherSelect')?.value || null;
      try {
        await db.ref(`users/${userId}`).update({ teacher_id: teacherId || null });
        const teachersSnap = teacherId ? await db.ref(`teachers/${teacherId}`).once('value') : null;
        logActivity(`Mengaitkan user dengan data guru: ${teachersSnap?.val()?.nama || '(dilepas)'}`);
        showToast('✅ Berhasil dikaitkan ke Data Guru!', 'success');
        document.getElementById('linkUserTeacherModal').remove();
        loadUserManagement();
      } catch (error) { console.error('Error linking user to teacher:', error); showToast('❌ Gagal mengaitkan', 'error'); }
    }

    // ADMIN
    // MIGRASI SATU-KALI: backfill no_wa_ortu_norm untuk siswa yang datanya
    // dibuat sebelum fitur pencarian nomor WA di Portal Orang Tua ada.
    // Aman dijalankan berkali-kali (idempoten) — cuma mengisi field yang
    // belum ada, tidak menimpa data lain.
    let __migrasiWANormDone = false;
    async function migrasiNomorWANorm() {
      if (__migrasiWANormDone) return;
      __migrasiWANormDone = true;
      try {
        const snap = await db.ref('students').once('value');
        const students = snap.val() || {};
        const updates = {};
        for (const [id, s] of Object.entries(students)) {
          if (s.no_wa_ortu && !s.no_wa_ortu_norm) {
            updates[`${id}/no_wa_ortu_norm`] = normalisasiNomorWA(s.no_wa_ortu);
          }
        }
        if (Object.keys(updates).length > 0) {
          await db.ref('students').update(updates);
          console.log(`Migrasi no_wa_ortu_norm: ${Object.keys(updates).length} siswa diperbarui.`);
        }
      } catch (error) { console.warn('Migrasi no_wa_ortu_norm gagal (tidak fatal):', error); }
    }

    async function loadAdmin() {
      migrasiNomorWANorm(); // jalan di latar belakang, tidak perlu ditunggu
      showLoading(true, 'Memuat data admin...');
      try {
        const kurikulumSelect = document.getElementById('kurikulumPaudSelect');
        if (kurikulumSelect) kurikulumSelect.value = await getKurikulumSetting();

        const pengumumanSnap = await db.ref('pengumuman').orderByChild('tanggal').limitToLast(20).once('value');
        const pengumumanData = pengumumanSnap.val() || {};
        const pengumumanList = document.getElementById('pengumumanList');
        const entries = Object.entries(pengumumanData).reverse();
        if (pengumumanList) {
          if (entries.length === 0) {
            pengumumanList.innerHTML = '<div style="text-align:center;padding:12px;color:#6b7280;">Belum ada pengumuman</div>';
          } else {
            pengumumanList.innerHTML = entries.map(([id, p]) => `
              <div class="pengumuman-item ${escapeHtml(p.jenis||'')}">
                <span class="teks">${escapeHtml(p.teks||'-')}</span>
                <span class="meta">${escapeHtml(p.jenis||'umum')} • ${{semua:'Semua',guru:'Guru & Staf',ortu:'Orang Tua'}[p.target] || 'Semua'} • ${formatDate(p.tanggal)}</span>
                <div class="aksi">
                  <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;min-height:32px;" onclick="deletePengumuman('${escapeHtml(id)}')">🗑️</button>
                </div>
              </div>
            `).join('');
          }
        }
        const logSnap = await db.ref('logs').orderByChild('timestamp').limitToLast(50).once('value');
        const logData = logSnap.val() || {};
        const logList = document.getElementById('logList');
        const logEntries = Object.entries(logData).reverse();
        if (logList) {
          if (logEntries.length === 0) {
            logList.innerHTML = '<div style="text-align:center;padding:12px;color:#6b7280;">Belum ada log</div>';
          } else {
            logList.innerHTML = logEntries.map(([id, log]) => `
              <div class="log-item">
                <span class="log-icon">📋</span>
                <span class="log-action">${escapeHtml(log.action||'-')}</span>
                <span class="log-user">${escapeHtml(log.user||'system')}${log.role ? ` (${escapeHtml(log.role)})` : ''}</span>
                <span class="log-time">${formatTime(log.timestamp)}</span>
              </div>
            `).join('');
          }
        }
        showLoading(false);
      } catch (error) {
        console.error('Error loading admin:', error);
        showToast('Gagal memuat data admin', 'error');
        showLoading(false);
      }
    }

    async function simpanPengumuman() {
      const teks = document.getElementById('pengumumanTeks').value.trim();
      const jenis = document.getElementById('pengumumanJenis').value;
      const target = document.getElementById('pengumumanTarget')?.value || 'semua';
      if (!teks) { showToast('Masukkan teks pengumuman!', 'warning'); return; }
      try {
        await db.ref('pengumuman').push({ teks: sanitizeInput(teks), jenis: sanitizeInput(jenis), target: sanitizeInput(target), tanggal: getToday(), guruKey: currentUser?.id || null, timestamp: firebase.database.ServerValue.TIMESTAMP });
        await db.ref('logs').push({ action: `Menambahkan pengumuman: ${sanitizeInput(teks)}`, user: currentUser?.nama || 'admin', guruKey: currentUser?.id || null, timestamp: firebase.database.ServerValue.TIMESTAMP });
        showToast('Pengumuman berhasil disimpan!', 'success');
        document.getElementById('pengumumanTeks').value = '';
        loadAdmin();
        loadPengumumanMarquee();
      } catch (error) { console.error('Error saving pengumuman:', error); showToast('Gagal menyimpan pengumuman', 'error'); }
    }

    async function deletePengumuman(id) {
      if (!confirm('Yakin ingin menghapus pengumuman ini?')) return;
      try { await db.ref(`pengumuman/${id}`).remove(); showToast('Pengumuman berhasil dihapus!', 'success'); loadAdmin(); loadPengumumanMarquee(); }
      catch (error) { console.error('Error deleting pengumuman:', error); showToast('Gagal menghapus pengumuman', 'error'); }
    }

    function restoreData() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat melakukan restore data!', 'warning'); return; }
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();

          let data;
          try {
            data = JSON.parse(text);
          } catch (parseErr) {
            showToast('❌ File bukan JSON yang valid. Restore dibatalkan.', 'error');
            return;
          }

          // Validasi struktur backup SEBELUM menyentuh database sama sekali.
          if (!data || typeof data !== 'object' || Array.isArray(data)) {
            showToast('❌ Format file tidak sesuai (bukan objek backup yang valid). Restore dibatalkan.', 'error');
            return;
          }
          if (Object.keys(data).length === 0) {
            showToast('❌ File backup kosong. Restore dibatalkan untuk mencegah data hilang.', 'error');
            return;
          }
          const expectedNodes = ['students', 'teachers', 'attendance', 'grades', 'subjects', 'users', 'profil', 'tahun_ajaran', 'journal', 'teacher_attendance', 'pengumuman', 'infaq', 'logs', 'jadwal'];
          const foundNodes = expectedNodes.filter(n => n in data);
          if (foundNodes.length === 0) {
            showToast('❌ File ini tidak terlihat seperti backup SI MAMBA (tidak ada data yang dikenali). Restore dibatalkan.', 'error');
            return;
          }

          const jumlahSiswa = data.students && typeof data.students === 'object' ? Object.keys(data.students).length : 0;
          const jumlahGuru = data.teachers && typeof data.teachers === 'object' ? Object.keys(data.teachers).length : 0;
          const ringkasan = `📄 Ringkasan isi file backup:\n- ${jumlahSiswa} data siswa\n- ${jumlahGuru} data guru\n- Node yang akan ditimpa: ${foundNodes.join(', ')}\n\nData di node LAIN (yang tidak ada di file ini) TIDAK akan dihapus. Lanjutkan?`;
          if (!confirm(ringkasan)) return;

          // Konfirmasi mengetik teks persis, bukan cuma klik OK - supaya tidak
          // ada satu file/klik tidak sengaja yang bisa menimpa data produksi.
          const konfirmasiTeks = prompt('Untuk melanjutkan, ketik persis: TIMPA DATA');
          if (konfirmasiTeks !== 'TIMPA DATA') {
            showToast('Restore dibatalkan (teks konfirmasi tidak cocok).', 'info');
            return;
          }

          showLoading(true, 'Membuat backup pengaman sebelum restore...');
          // Selalu simpan backup OTOMATIS dari data saat ini SEBELUM restore
          // dijalankan - supaya kalau file restore ternyata salah, masih ada
          // jalan mundur tanpa bergantung admin ingat backup manual duluan.
          try {
            // db.ref().once('value') di ROOT sudah tidak diizinkan lagi oleh
            // Firebase Rules (lihat rules.json) - baca per node.
            const currentData = await bacaSeluruhDatabase();
            const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pre-restore-backup-${getToday()}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (backupErr) {
            console.error('Gagal membuat backup pengaman:', backupErr);
            showLoading(false);
            showToast('❌ Gagal membuat backup pengaman otomatis — restore DIBATALKAN demi keamanan data.', 'error');
            return;
          }

          showLoading(true, 'Restore data...');
          // PENTING: pakai update() (bukan set()) di root - hanya menimpa node
          // yang memang ADA di file backup. Node lain yang tidak disebutkan di
          // file (mis. logs, infaq) TIDAK ikut terhapus. Satu file JSON tidak
          // bisa menghapus seluruh database walau isinya cuma sebagian kecil.
          // CATATAN: db.ref().update(data) di root TETAP AMAN tanpa Rules root
          // .write - Firebase memvalidasi multi-location update per key teratas
          // (students, teachers, dst) terhadap Rules node itu masing-masing,
          // bukan terhadap Rules root.
          await db.ref().update(data);
          logActivity(`Restore data dari file backup (node yang ditimpa: ${foundNodes.join(', ')})`);
          showToast('✅ Data berhasil direstore! Backup pengaman otomatis ikut terunduh.', 'success');
          showLoading(false);
          showPage(currentPage);
        } catch (error) {
          console.error('Error restoring data:', error);
          showToast('❌ Gagal merestore data', 'error');
          showLoading(false);
        }
      };
      input.click();
    }

