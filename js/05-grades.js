    // ============================================================
    // GRADES
    // ============================================================
    // ============================================================
    // KURIKULUM PAUD (aspek perkembangan/elemen capaian pembelajaran)
    // ============================================================
    const ASPEK_K13 = { NAM: 'Nilai Agama dan Moral', FM: 'Fisik Motorik', KOG: 'Kognitif', BHS: 'Bahasa', SOSEM: 'Sosial Emosional', SN: 'Seni' };
    const ASPEK_MERDEKA = { NAB: 'Nilai Agama dan Budi Pekerti', JD: 'Jati Diri', DLM: 'Dasar-Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni (STEAM)' };

    function getAspekDefault(kurikulum) {
      return kurikulum === 'merdeka' ? ASPEK_MERDEKA : ASPEK_K13;
    }

    async function getKurikulumSetting() {
      try {
        const snap = await db.ref('settings/kurikulum').once('value');
        return snap.val() || 'k13';
      } catch (error) {
        console.error('Gagal membaca setting kurikulum:', error);
        return 'k13';
      }
    }

    async function saveKurikulumPaud() {
      const kurikulum = document.getElementById('kurikulumPaudSelect')?.value || 'k13';
      try {
        await db.ref('settings/kurikulum').set({
          value: kurikulum, updated_by: currentUser?.nama || 'Sistem', updated_by_role: currentRole || '-',
          updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        const label = kurikulum === 'merdeka' ? 'Kurikulum Merdeka PAUD (3 Elemen)' : 'Kurikulum 2013 PAUD (6 Aspek)';
        logActivity(`Mengubah kurikulum PAUD menjadi: ${label}`);
        showToast(`✅ Kurikulum diset ke ${label}`, 'success');
      } catch (error) { console.error('Error saving kurikulum:', error); showToast('❌ Gagal menyimpan pilihan kurikulum', 'error'); }
    }

    async function createDefaultAspek() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat menjalankan setup ini!', 'warning'); return; }
      const kurikulum = document.getElementById('kurikulumPaudSelect')?.value || 'k13';
      const aspekMap = getAspekDefault(kurikulum);
      const label = kurikulum === 'merdeka' ? 'Kurikulum Merdeka PAUD (3 Elemen)' : 'Kurikulum 2013 PAUD (6 Aspek)';
      if (!confirm(`Buat aspek perkembangan default sesuai ${label}? Ini hanya berjalan jika data aspek masih kosong.`)) return;
      showLoading(true, 'Membuat aspek perkembangan default...');
      try {
        const defaultAspek = {};
        Object.entries(aspekMap).forEach(([kode, nama]) => {
          const key = db.ref('subjects').push().key;
          defaultAspek[key] = { kode, nama, kelompok: 'A', guru: '-', guruKey: currentUser?.id || null, created_at: Date.now() };
        });
        const result = await db.ref('subjects').transaction(current => {
          if (current && Object.keys(current).length > 0) return; // batal, sudah ada data
          return defaultAspek;
        });
        if (result.committed) {
          logActivity(`Membuat aspek perkembangan default: ${label}`);
          showToast('✅ Aspek perkembangan default berhasil dibuat!', 'success');
          if (currentPage === 'subjects') loadSubjects();
        } else {
          showToast('ℹ️ Data aspek sudah ada, setup dilewati', 'info');
        }
        showLoading(false);
      } catch (error) {
        console.error('Error creating default aspek:', error);
        showToast('❌ Gagal membuat aspek perkembangan default', 'error');
        showLoading(false);
      }
    }

    // ============================================================
    // MIGRASI SATU-KALI: backfill field guruKey ke data lama
    // ============================================================
    // Admin-only, idempoten - aman dijalankan berkali-kali. Record yang
    // SUDAH punya field guruKey (termasuk yang bernilai null) otomatis
    // dilewati, tidak ditimpa ulang. Untuk data lama yang memang tidak
    // mungkin diketahui siapa pembuat aslinya, guruKey diisi null supaya
    // fieldnya konsisten ADA di semua record (bukan hilang di sebagian).
    // Best-effort: kalau nama pembuat (field by/guru/user/dibuat_oleh/
    // updated_by) persis cocok dengan SATU user yang terdaftar, guruKey
    // diisi id user tersebut alih-alih null.
    async function migrasiGuruKey() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat menjalankan migrasi ini!', 'warning'); return; }
      if (!confirm('Jalankan migrasi guruKey untuk semua data lama? Ini hanya MENAMBAH field yang belum ada, tidak mengubah/menimpa data lain.')) return;

      const resultEl = document.getElementById('migrasiGuruKeyResult');
      if (resultEl) resultEl.textContent = '⏳ Memproses...';
      showLoading(true, 'Menjalankan migrasi guruKey...');

      try {
        // Dua peta nama -> id: satu dari 'users' (untuk field seperti log 'user',
        // surat 'dibuat_oleh'), satu lagi dari 'teachers' (untuk field 'guru' di
        // journal/jadwal/subjects, yang memang merujuk ke Data Guru, bukan user login).
        const [usersSnap, teachersSnap] = await Promise.all([
          db.ref('users').once('value'), db.ref('teachers').once('value')
        ]);

        function buildNameToIdMap(collectionData) {
          const nameToId = {};
          const nameCount = {};
          Object.entries(collectionData).forEach(([id, r]) => {
            const nama = (r.nama || '').trim();
            if (!nama) return;
            nameCount[nama] = (nameCount[nama] || 0) + 1;
            nameToId[nama] = id;
          });
          // Kalau satu nama dipakai lebih dari 1 entri, jangan ditebak (ambigu) - biarkan null.
          Object.keys(nameCount).forEach(nama => { if (nameCount[nama] > 1) delete nameToId[nama]; });
          return nameToId;
        }
        const userNameToId = buildNameToIdMap(usersSnap.val() || {});
        const teacherNameToId = buildNameToIdMap(teachersSnap.val() || {});

        // preferTeacherMap = true untuk koleksi yang field 'guru'-nya memang
        // merujuk ke Data Guru (journal, jadwal, subjects), bukan ke user login.
        function resolveGuruKey(record, preferTeacherMap) {
          const map = preferTeacherMap ? teacherNameToId : userNameToId;
          const candidateNames = [record.guru, record.by, record.user, record.dibuat_oleh, record.updated_by].filter(Boolean);
          for (const nama of candidateNames) { if (map[nama]) return map[nama]; }
          return null;
        }

        let totalUpdated = 0;
        const summaryLines = [];

        // --- Koleksi flat: node/{id} ---
        const teacherNameCollections = new Set(['journal', 'jadwal', 'subjects']);
        const flatCollections = ['students', 'subjects', 'teachers', 'journal', 'jadwal', 'jam_pelajaran', 'users', 'logs', 'surat_riwayat', 'promotion_history'];
        for (const col of flatCollections) {
          const snap = await db.ref(col).once('value');
          const data = snap.val() || {};
          const updates = {};
          let count = 0;
          const preferTeacherMap = teacherNameCollections.has(col);
          Object.entries(data).forEach(([id, record]) => {
            if (record && typeof record === 'object' && !('guruKey' in record)) {
              updates[`${col}/${id}/guruKey`] = resolveGuruKey(record, preferTeacherMap);
              count++;
            }
          });
          if (count > 0) { await db.ref().update(updates); totalUpdated += count; summaryLines.push(`${col}: ${count}`); }
        }

        // --- Koleksi bertingkat 2 level: node/{a}/{b} (mis. attendance/{tanggal}/{studentId}) ---
        const nested2Collections = ['attendance'];
        for (const col of nested2Collections) {
          const snap = await db.ref(col).once('value');
          const data = snap.val() || {};
          const updates = {};
          let count = 0;
          Object.entries(data).forEach(([a, level1]) => {
            Object.entries(level1 || {}).forEach(([b, record]) => {
              if (record && typeof record === 'object' && !('guruKey' in record)) {
                updates[`${col}/${a}/${b}/guruKey`] = resolveGuruKey(record, false);
                count++;
              }
            });
          });
          if (count > 0) { await db.ref().update(updates); totalUpdated += count; summaryLines.push(`${col}: ${count}`); }
        }

        // --- Koleksi bertingkat 3 level: node/{a}/{b}/{c} (grades, infaq, teacher_attendance) ---
        const nested3Collections = ['grades', 'infaq', 'teacher_attendance'];
        for (const col of nested3Collections) {
          const snap = await db.ref(col).once('value');
          const data = snap.val() || {};
          const updates = {};
          let count = 0;
          Object.entries(data).forEach(([a, level1]) => {
            Object.entries(level1 || {}).forEach(([b, level2]) => {
              Object.entries(level2 || {}).forEach(([c, record]) => {
                if (record && typeof record === 'object' && !('guruKey' in record)) {
                  updates[`${col}/${a}/${b}/${c}/guruKey`] = resolveGuruKey(record, false);
                  count++;
                }
              });
            });
          });
          if (count > 0) { await db.ref().update(updates); totalUpdated += count; summaryLines.push(`${col}: ${count}`); }
        }

        logActivity(`Menjalankan migrasi backfill guruKey (${totalUpdated} record diperbarui)`);
        const summaryText = totalUpdated === 0
          ? '✅ Semua data sudah punya guruKey — tidak ada yang perlu dimigrasi.'
          : `✅ Migrasi selesai: ${totalUpdated} record diperbarui.\n${summaryLines.join(', ')}`;
        if (resultEl) resultEl.innerHTML = `<div style="padding:10px;background:#dcfce7;border-radius:8px;color:#065f46;white-space:pre-line;">${escapeHtml(summaryText)}</div>`;
        showToast(`✅ Migrasi selesai (${totalUpdated} record diperbarui)`, 'success');
        showLoading(false);
      } catch (error) {
        console.error('Error migrasi guruKey:', error);
        if (resultEl) resultEl.innerHTML = `<div style="padding:10px;background:#fee2e2;border-radius:8px;color:#991b1b;">❌ Migrasi gagal: ${escapeHtml(error.message || 'terjadi kesalahan')}</div>`;
        showToast('❌ Migrasi gagal', 'error');
        showLoading(false);
      }
    }

    async function loadGrades() {
      showLoading(true, 'Memuat data capaian perkembangan...');
      try {
        const myKelas = await getMyKelasDiampu();
        const [studentsSnap, gradesSnap, subjectsSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('grades').once('value'),
          db.ref('subjects').once('value')
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        const grades = gradesSnap.val() || {};
        const subjects = subjectsSnap.val() || {};
        window.__gradesStudentsCache = students; // dipakai saveGrade()/deleteGrade() untuk logging
        window.__gradesSubjectsCache = subjects;

        const studentSelect = document.getElementById('gradeStudentSelect');
        if (studentSelect) {
          studentSelect.innerHTML = '<option value="">Pilih Siswa</option>' +
            Object.entries(students).map(([id, s]) =>
              `<option value="${escapeHtml(id)}">${escapeHtml(s.nama)} - ${escapeHtml(s.kelas)}</option>`
            ).join('');
        }

        const subjectSelect = document.getElementById('gradeSubjectSelect');
        if (subjectSelect) {
          const subjectEntries = Object.entries(subjects);
          if (subjectEntries.length > 0) {
            subjectSelect.innerHTML = '<option value="">Pilih Aspek</option>' +
              subjectEntries.map(([id, s]) =>
                `<option value="${escapeHtml(id)}">${escapeHtml(s.kode || '')} - ${escapeHtml(s.nama || '')}</option>`
              ).join('');
          } else {
            const kurikulum = await getKurikulumSetting();
            const aspekDefault = getAspekDefault(kurikulum);
            subjectSelect.innerHTML = '<option value="">Pilih Aspek</option>' +
              Object.entries(aspekDefault).map(([kode, nama]) =>
                `<option value="${kode}">${kode} - ${nama}</option>`
              ).join('');
          }
        }

        const historyBody = document.getElementById('gradeHistoryBody');
        const historyEntries = Object.entries(grades).filter(([studentId]) => students[studentId]);
        if (historyEntries.length === 0) {
          historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">Belum ada data capaian</td></tr>';
        } else {
          let historyHTML = '';
          for (const [studentId, subjectsData] of historyEntries) {
            const student = students[studentId] || { nama: 'Unknown' };
            for (const [subjectId, semesters] of Object.entries(subjectsData)) {
              for (const [semester, data] of Object.entries(semesters)) {
                historyHTML += `
                  <tr>
                    <td>${escapeHtml(student.nama)}</td>
                    <td>${escapeHtml(subjects[subjectId]?.nama || subjectId)}</td>
                    <td>Semester ${escapeHtml(semester)}</td>
                    <td>${capaianBadge(data.nilai)}</td>
                    <td style="font-size:12px;color:#6b7280;">${escapeHtml(data.updated_by || '-')}</td>
                    <td><button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteGrade('${escapeHtml(studentId)}','${escapeHtml(subjectId)}','${escapeHtml(semester)}')">🗑️</button></td>
                  </tr>
                `;
              }
            }
          }
          historyBody.innerHTML = historyHTML;
        }
        showLoading(false);
      } catch (error) {
        console.error('Error loading grades:', error);
        showToast('Gagal memuat data capaian perkembangan', 'error');
        showLoading(false);
      }
    }

    // Badge warna untuk skala capaian PAUD: BB/MB/BSH/BSB
    function capaianBadge(level) {
      const labels = { BB: 'BB', MB: 'MB', BSH: 'BSH', BSB: 'BSB' };
      const colors = {
        BB: 'background:#fee2e2;color:#991b1b;', MB: 'background:#fef3c7;color:#92400e;',
        BSH: 'background:#dbeafe;color:#1e40af;', BSB: 'background:#dcfce7;color:#065f46;'
      };
      if (!level || !labels[level]) return '-';
      return `<span style="padding:3px 10px;border-radius:10px;font-weight:600;font-size:12px;${colors[level]}">${labels[level]}</span>`;
    }

    async function saveGrade() {
      const studentId = document.getElementById('gradeStudentSelect').value;
      const subjectId = document.getElementById('gradeSubjectSelect').value;
      const nilai = document.getElementById('gradeNilai').value;
      const semester = document.getElementById('gradeSemester').value;
      if (!studentId || !subjectId || !nilai) { showToast('Isi semua data!', 'warning'); return; }
      if (!window.__gradesStudentsCache?.[studentId]) { showToast('⛔ Anda tidak punya akses ke siswa ini', 'error'); return; }
      const validLevels = ['BB', 'MB', 'BSH', 'BSB'];
      if (!validLevels.includes(nilai)) { showToast('Pilih capaian yang valid (BB/MB/BSH/BSB)!', 'error'); return; }
      const namaSiswa = window.__gradesStudentsCache?.[studentId]?.nama || studentId;
      const namaMapel = window.__gradesSubjectsCache?.[subjectId]?.nama || subjectId;
      const success = await writeWithOfflineFallback(`grades/${studentId}/${subjectId}/${semester}`, {
        nilai: nilai, updated_at: firebase.database.ServerValue.TIMESTAMP,
        updated_by: currentUser?.nama || 'Sistem', updated_by_role: currentRole || '-', guruKey: currentUser?.id || null
      }, `Capaian ${namaSiswa} - ${namaMapel} → ${nilai}`);
      if (success) {
        logActivity(`Mengubah capaian ${namaSiswa} - ${namaMapel} semester ${semester} menjadi ${nilai}`);
        showToast('Capaian berhasil disimpan!', 'success');
        document.getElementById('gradeNilai').value = '';
        loadGrades();
      } else {
        document.getElementById('gradeNilai').value = '';
      }
    }

    async function deleteGrade(studentId, subjectId, semester) {
      if (!window.__gradesStudentsCache?.[studentId]) { showToast('⛔ Anda tidak punya akses ke siswa ini', 'error'); return; }
      if (!confirm('Yakin ingin menghapus capaian ini?')) return;
      try {
        await db.ref(`grades/${studentId}/${subjectId}/${semester}`).remove();
        const namaSiswa = window.__gradesStudentsCache?.[studentId]?.nama || studentId;
        const namaMapel = window.__gradesSubjectsCache?.[subjectId]?.nama || subjectId;
        logActivity(`Menghapus capaian ${namaSiswa} - ${namaMapel} semester ${semester}`);
        showToast('Capaian berhasil dihapus!', 'success');
        loadGrades();
      } catch (error) { console.error('Error deleting grade:', error); showToast('Gagal menghapus capaian', 'error'); }
    }

