    // ============================================================
    // CATATAN ANEKDOT
    // ============================================================
    let anekdotCache = [];
    let anekdotStudentsCache = {};

    async function loadAnekdot() {
      showLoading(true, 'Memuat catatan anekdot...');
      try {
        const myKelas = await getMyKelasDiampu();
        const [studentsSnap, anekdotSnap, kurikulum] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('anekdot').orderByChild('tanggal').limitToLast(200).once('value'),
          getKurikulumSetting()
        ]);
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        anekdotStudentsCache = students;

        const tanggalInput = document.getElementById('anekdotTanggal');
        if (tanggalInput && !tanggalInput.value) tanggalInput.value = getToday();

        const studentSelect = document.getElementById('anekdotStudentSelect');
        if (studentSelect) {
          studentSelect.innerHTML = '<option value="">Pilih Siswa</option>' +
            Object.entries(students).map(([id, s]) => `<option value="${escapeHtml(id)}">${escapeHtml(s.nama)} - ${escapeHtml(s.kelas)}</option>`).join('');
        }
        const filterSiswa = document.getElementById('anekdotFilterSiswa');
        if (filterSiswa) {
          filterSiswa.innerHTML = '<option value="">Semua Siswa</option>' +
            Object.entries(students).map(([id, s]) => `<option value="${escapeHtml(id)}">${escapeHtml(s.nama)} - ${escapeHtml(s.kelas)}</option>`).join('');
        }
        const aspekSelect = document.getElementById('anekdotAspek');
        if (aspekSelect) {
          const aspekDefault = getAspekDefault(kurikulum);
          aspekSelect.innerHTML = '<option value="">Pilih Aspek</option>' +
            Object.entries(aspekDefault).map(([kode, nama]) => `<option value="${kode}">${kode} - ${nama}</option>`).join('');
        }

        const data = anekdotSnap.val() || {};
        anekdotCache = Object.entries(data)
          .map(([id, a]) => ({ id, ...a }))
          .filter(a => students[a.studentId]) // batasi ke siswa yang diakses (kelas diampu)
          .sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.created_at || 0) - (a.created_at || 0));

        renderAnekdotList();
        showLoading(false);
      } catch (error) {
        console.error('Error loading anekdot:', error);
        showToast('Gagal memuat catatan anekdot', 'error');
        showLoading(false);
      }
    }

    function renderAnekdotList() {
      const container = document.getElementById('anekdotList');
      if (!container) return;
      const query = (document.getElementById('anekdotSearch')?.value || '').trim().toLowerCase();
      const filterSiswaId = document.getElementById('anekdotFilterSiswa')?.value || '';
      let filtered = anekdotCache;
      if (filterSiswaId) filtered = filtered.filter(a => a.studentId === filterSiswaId);
      if (query) filtered = filtered.filter(a => (a.namaSiswa || '').toLowerCase().includes(query) || (a.catatan || '').toLowerCase().includes(query));

      const btnCetak = document.getElementById('btnCetakAnekdot');
      if (btnCetak) btnCetak.style.display = filterSiswaId ? 'inline-flex' : 'none';

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Belum ada catatan</div>';
        return;
      }
      container.innerHTML = filtered.map(a => `
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:4px;">
            <strong>${escapeHtml(a.namaSiswa || '-')}</strong>
            <span style="font-size:12px;color:#6b7280;">${escapeHtml(formatDate(a.tanggal))} · ${escapeHtml(a.aspekLabel || a.aspek || '-')}</span>
          </div>
          <p style="font-size:13px;color:#374151;margin-bottom:6px;">${escapeHtml(a.catatan || '')}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:#9ca3af;">Dicatat oleh: ${escapeHtml(a.guru || '-')}</span>
            <button class="btn btn-danger" style="padding:1px 8px;font-size:11px;" onclick="deleteAnekdot('${escapeHtml(a.id)}')">🗑️ Hapus</button>
          </div>
        </div>
      `).join('');
    }

    async function saveAnekdot() {
      const studentId = document.getElementById('anekdotStudentSelect')?.value;
      const tanggal = document.getElementById('anekdotTanggal')?.value;
      const aspekKode = document.getElementById('anekdotAspek')?.value;
      const aspekSelectEl = document.getElementById('anekdotAspek');
      const aspekLabel = aspekSelectEl?.selectedOptions?.[0]?.textContent || aspekKode;
      const catatan = document.getElementById('anekdotCatatan')?.value.trim();
      if (!studentId || !tanggal || !aspekKode) { showToast('Pilih siswa, tanggal, dan aspek dulu!', 'warning'); return; }
      if (!catatan || catatan.length < 3) { showToast('Isi catatan minimal 3 karakter!', 'warning'); return; }
      const student = anekdotStudentsCache[studentId];
      if (!student) { showToast('Siswa tidak ditemukan / di luar akses Anda!', 'error'); return; }
      try {
        await db.ref('anekdot').push({
          studentId, namaSiswa: student.nama || '-', kelas: student.kelas || '-',
          tanggal, aspek: aspekKode, aspekLabel: sanitizeInput(aspekLabel),
          catatan: sanitizeInput(catatan),
          guru: currentUser?.nama || 'Sistem', guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity(`Menambah catatan anekdot untuk ${student.nama} (${aspekLabel})`);
        showToast('✅ Catatan anekdot berhasil disimpan!', 'success');
        document.getElementById('anekdotCatatan').value = '';
        loadAnekdot();
      } catch (error) { console.error('Error saving anekdot:', error); showToast('Gagal menyimpan catatan anekdot', 'error'); }
    }

    async function deleteAnekdot(id) {
      if (!confirm('Yakin ingin menghapus catatan ini?')) return;
      try {
        await db.ref(`anekdot/${id}`).remove();
        showToast('Catatan berhasil dihapus!', 'success');
        loadAnekdot();
      } catch (error) { console.error('Error deleting anekdot:', error); showToast('Gagal menghapus catatan', 'error'); }
    }

    function cetakAnekdotSiswa() {
      const studentId = document.getElementById('anekdotFilterSiswa')?.value;
      if (!studentId) { showToast('Pilih siswa dulu di filter untuk mencetak!', 'warning'); return; }
      const student = anekdotStudentsCache[studentId];
      const catatanSiswa = anekdotCache.filter(a => a.studentId === studentId).sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
      if (catatanSiswa.length === 0) { showToast('Belum ada catatan untuk siswa ini!', 'warning'); return; }
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';

      const baris = catatanSiswa.map((a, idx) => `<tr>
        <td style="text-align:center;">${idx + 1}</td><td style="text-align:center;">${escapeHtml(formatDate(a.tanggal))}</td>
        <td>${escapeHtml(a.aspekLabel || a.aspek || '-')}</td><td>${escapeHtml(a.catatan || '')}</td>
      </tr>`).join('');

      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Catatan Anekdot - ${escapeHtml(student?.nama || '-')}</title>
        <style>
          body { font-family:Arial,sans-serif; font-size:12px; padding:24px; color:#111827; }
          h1 { text-align:center; font-size:16px; margin-bottom:2px; }
          h2 { text-align:center; font-size:13px; font-weight:normal; margin-top:0; margin-bottom:20px; color:#374151; }
          table { border-collapse:collapse; width:100%; margin-top:12px; }
          th, td { border:1px solid #9ca3af; padding:6px 8px; font-size:11px; vertical-align:top; }
          th { background:#f3f4f6; text-align:center; }
          @media print { body { padding:10px; } }
        </style></head><body>
          <h1>${escapeHtml(namaSekolah)}</h1>
          <h2>Kumpulan Catatan Anekdot — ${escapeHtml(student?.nama || '-')} (Kelas ${escapeHtml(student?.kelas || '-')})</h2>
          <table>
            <thead><tr><th>No</th><th>Tanggal</th><th>Aspek</th><th>Catatan</th></tr></thead>
            <tbody>${baris}</tbody>
          </table>
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    // ============================================================
    // RAPOR NARASI
    // ============================================================
    const TEMPLATE_NARASI_CAPAIAN = {
      BSB: (nama, aspek) => `Ananda ${nama} menunjukkan perkembangan yang sangat baik dalam aspek ${aspek}, bahkan telah melampaui harapan yang ditetapkan untuk usianya.`,
      BSH: (nama, aspek) => `Ananda ${nama} telah berkembang sesuai harapan dalam aspek ${aspek}.`,
      MB: (nama, aspek) => `Ananda ${nama} mulai menunjukkan perkembangan dalam aspek ${aspek}, namun masih memerlukan bimbingan dan stimulasi lebih lanjut.`,
      BB: (nama, aspek) => `Ananda ${nama} masih berada pada tahap awal perkembangan aspek ${aspek} dan memerlukan pendampingan intensif dari guru dan orang tua.`
    };

    async function loadRaporNarasi() {
      try {
        const myKelas = await getMyKelasDiampu();
        const studentsSnap = await db.ref('students').once('value');
        let students = studentsSnap.val() || {};
        if (myKelas) students = Object.fromEntries(Object.entries(students).filter(([, s]) => myKelas.includes(s.kelas)));
        window.__raporStudentsCache = students;
        const select = document.getElementById('raporStudentSelect');
        if (select) {
          select.innerHTML = '<option value="">Pilih Siswa</option>' +
            Object.entries(students).map(([id, s]) => `<option value="${escapeHtml(id)}">${escapeHtml(s.nama)} - ${escapeHtml(s.kelas)}</option>`).join('');
        }
        const hasil = document.getElementById('raporNarasiHasil');
        if (hasil) hasil.style.display = 'none';
      } catch (error) { console.error('Error loading rapor narasi page:', error); }
    }

    async function generateRaporNarasi() {
      const studentId = document.getElementById('raporStudentSelect')?.value;
      const semester = document.getElementById('raporSemester')?.value;
      const tglMulai = document.getElementById('raporTanggalMulai')?.value;
      const tglSelesai = document.getElementById('raporTanggalSelesai')?.value;
      if (!studentId) { showToast('Pilih siswa dulu!', 'warning'); return; }
      const student = window.__raporStudentsCache?.[studentId];
      if (!student) { showToast('⛔ Siswa tidak ditemukan / di luar akses Anda', 'error'); return; }

      showLoading(true, 'Membuat draft narasi...');
      try {
        const [gradesSnap, subjectsSnap, anekdotSnap, kurikulum] = await Promise.all([
          db.ref(`grades/${studentId}`).once('value'),
          db.ref('subjects').once('value'),
          db.ref('anekdot').orderByChild('studentId').equalTo(studentId).once('value'),
          getKurikulumSetting()
        ]);
        const gradesData = gradesSnap.val() || {};
        const subjects = subjectsSnap.val() || {};
        const aspekDefault = getAspekDefault(kurikulum);
        const anekdotData = anekdotSnap.val() || {};

        // Susun daftar aspek: pakai 'subjects' custom kalau ada, kalau tidak pakai 6 aspek PAUD default.
        const daftarAspek = Object.keys(subjects).length > 0
          ? Object.entries(subjects).map(([id, s]) => ({ id, kode: s.kode || id, nama: s.nama || id }))
          : Object.entries(aspekDefault).map(([kode, nama]) => ({ id: kode, kode, nama }));

        // Kelompokkan catatan anekdot (dalam rentang tanggal, kalau diisi) per kode aspek.
        const anekdotPerAspek = {};
        Object.values(anekdotData).forEach(a => {
          if (tglMulai && a.tanggal < tglMulai) return;
          if (tglSelesai && a.tanggal > tglSelesai) return;
          const kode = a.aspek;
          if (!anekdotPerAspek[kode]) anekdotPerAspek[kode] = [];
          anekdotPerAspek[kode].push(a.catatan);
        });

        const listContainer = document.getElementById('raporNarasiAspekList');
        let html = '';
        daftarAspek.forEach(aspek => {
          const nilai = gradesData[aspek.id]?.[semester]?.nilai;
          const templateFn = TEMPLATE_NARASI_CAPAIAN[nilai];
          let narasi = templateFn ? templateFn(student.nama, aspek.nama) : `Belum ada data capaian untuk aspek ${aspek.nama} pada semester ini.`;
          const catatanTerkait = anekdotPerAspek[aspek.kode] || anekdotPerAspek[aspek.id] || [];
          if (catatanTerkait.length > 0) {
            narasi += ' Hal ini terlihat dari pengamatan sehari-hari, di antaranya: ' + catatanTerkait.join('; ') + '.';
          }
          html += `
            <div style="margin-bottom:16px;">
              <label class="label">${escapeHtml(aspek.kode)} - ${escapeHtml(aspek.nama)} ${nilai ? capaianBadge(nilai) : ''}</label>
              <textarea class="field" data-aspek-kode="${escapeHtml(aspek.kode)}" data-aspek-nama="${escapeHtml(aspek.nama)}" rows="3">${escapeHtml(narasi)}</textarea>
            </div>
          `;
        });
        if (listContainer) listContainer.innerHTML = html;
        const hasil = document.getElementById('raporNarasiHasil');
        if (hasil) hasil.style.display = 'block';
        window.__raporCurrentStudent = student;
        window.__raporCurrentSemester = semester;
        showLoading(false);
      } catch (error) {
        console.error('Error generating rapor narasi:', error);
        showToast('Gagal membuat draft narasi', 'error');
        showLoading(false);
      }
    }

    function cetakRaporNarasi() {
      const student = window.__raporCurrentStudent;
      const semester = window.__raporCurrentSemester;
      if (!student) { showToast('Buat draft narasi dulu!', 'warning'); return; }
      const textareas = document.querySelectorAll('#raporNarasiAspekList textarea');
      if (textareas.length === 0) { showToast('Tidak ada data untuk dicetak!', 'warning'); return; }
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
      const semesterLabel = semester === '2' ? 'Semester 2 (Genap)' : 'Semester 1 (Ganjil)';

      let bodyHtml = '';
      textareas.forEach(ta => {
        bodyHtml += `<div style="margin-bottom:14px;"><strong>${escapeHtml(ta.dataset.aspekKode)} - ${escapeHtml(ta.dataset.aspekNama)}</strong><p style="margin-top:4px;text-align:justify;">${escapeHtml(ta.value)}</p></div>`;
      });

      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Rapor Narasi - ${escapeHtml(student.nama)}</title>
        <style>
          body { font-family:Arial,sans-serif; font-size:13px; padding:28px; color:#111827; line-height:1.5; }
          h1 { text-align:center; font-size:17px; margin-bottom:2px; }
          h2 { text-align:center; font-size:14px; font-weight:normal; margin-top:0; margin-bottom:4px; color:#374151; }
          .bio { margin: 16px 0 20px; font-size:13px; }
          .bio span { display:inline-block; min-width:110px; }
          .ttd { margin-top:50px; display:flex; justify-content:space-between; }
          .ttd div { text-align:center; width:220px; }
          .ttd .garis { margin-top:60px; border-top:1px solid #111827; padding-top:4px; }
          @media print { body { padding:10px; } }
        </style></head><body>
          <h1>${escapeHtml(namaSekolah)}</h1>
          <h2>Laporan Perkembangan Anak (Rapor Narasi)</h2>
          <div class="bio">
            <div><span>Nama</span>: ${escapeHtml(student.nama)}</div>
            <div><span>Kelas</span>: ${escapeHtml(student.kelas || '-')}</div>
            <div><span>Semester</span>: ${escapeHtml(semesterLabel)}</div>
          </div>
          ${bodyHtml}
          <div class="ttd">
            <div><p>Wali Kelas</p><p class="garis">(________________________)</p></div>
            <div><p>Mengetahui,<br>Kepala Sekolah</p><p class="garis">(________________________)</p></div>
          </div>
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    function kirimRaporNarasiWA() {
      const student = window.__raporCurrentStudent;
      const semester = window.__raporCurrentSemester;
      if (!student) { showToast('Buat draft narasi dulu!', 'warning'); return; }
      if (!student.no_wa_ortu) {
        showToast('⚠️ No. WhatsApp orang tua belum diisi. Lengkapi dulu di menu Data Siswa.', 'warning');
        return;
      }
      const textareas = document.querySelectorAll('#raporNarasiAspekList textarea');
      if (textareas.length === 0) { showToast('Tidak ada data untuk dikirim!', 'warning'); return; }
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
      const semesterLabel = semester === '2' ? 'Semester 2 (Genap)' : 'Semester 1 (Ganjil)';

      let pesan = `Assalamu'alaikum Bapak/Ibu orang tua dari ananda *${student.nama}* (Kelas ${student.kelas || '-'}).\n\n`;
      pesan += `Berikut laporan perkembangan ananda dari ${namaSekolah} - ${semesterLabel}:\n\n`;
      textareas.forEach(ta => {
        pesan += `*${ta.dataset.aspekKode} - ${ta.dataset.aspekNama}*\n${ta.value}\n\n`;
      });
      pesan += `Terima kasih atas kerja sama Bapak/Ibu dalam mendukung tumbuh kembang ananda di rumah 🙏`;

      if (pesan.length > 3500) {
        showToast('⚠️ Narasi cukup panjang, sebagian mungkin terpotong di WhatsApp. Pertimbangkan pakai tombol Cetak untuk versi lengkap.', 'warning');
      }
      bukaWhatsApp(student.no_wa_ortu, pesan);
    }

    // ============================================================
    // JOURNAL
    // ============================================================
    async function loadJournal() {
      showLoading(true, 'Memuat jurnal...');
      try {
        const myKelas = await getMyKelasDiampu();
        const [journalSnap, teachersSnap] = await Promise.all([
          db.ref('journal').orderByChild('tanggal').limitToLast(100).once('value'),
          db.ref('teachers').once('value')
        ]);
        const data = journalSnap.val() || {};
        let entries = Object.entries(data).map(([key, val]) => ({ ...val, id: key }));
        if (myKelas) entries = entries.filter(j => myKelas.includes(j.kelas));
        allJournalData = entries.reverse();
        window.__journalMyKelas = myKelas; // dipakai saveJournal() untuk validasi

        // Kelas yang boleh dipilih saat menulis jurnal baru - dibatasi kalau
        // akun ini punya "Kelas yang Diampu" (guru/wali_kelas).
        const journalKelasSelect = document.getElementById('journalKelas');
        if (journalKelasSelect) {
          const currentVal = journalKelasSelect.value;
          const allowedKelas = myKelas || KELAS_LIST;
          journalKelasSelect.innerHTML = allowedKelas.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
          if (allowedKelas.includes(currentVal)) journalKelasSelect.value = currentVal;
        }

        const teachers = teachersSnap.val() || {};
        // Cache guru segar (bukan nama beku) - dipakai renderJournal() untuk tampilkan
        // nama TERKINI dari Data Guru, bukan snapshot nama saat jurnal dibuat dulu.
        window.__journalTeachersCache = teachers;
        const teacherEntries = Object.entries(teachers).filter(([, t]) => t.nama).sort((a, b) => a[1].nama.localeCompare(b[1].nama));

        const inputSelect = document.getElementById('journalGuru');
        const filterSelect = document.getElementById('journalFilterGuru');
        // Bangun <option> lewat document.createElement() + textContent/.value (bukan
        // string HTML) - aman dari quote-breakout walau nama guru mengandung tanda kutip.
        // value = ID guru (guruKey), BUKAN nama - supaya kalau nama diubah nanti,
        // filter & data yang tersimpan tetap merujuk ke guru yang benar.
        function populateGuruSelect(select, placeholderText) {
          if (!select) return;
          const currentVal = select.value;
          select.innerHTML = '';
          const placeholderOpt = document.createElement('option');
          placeholderOpt.value = '';
          placeholderOpt.textContent = placeholderText;
          select.appendChild(placeholderOpt);
          teacherEntries.forEach(([id, t]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = t.nama;
            select.appendChild(opt);
          });
          if (currentVal) select.value = currentVal;
        }
        populateGuruSelect(inputSelect, '-- Pilih Guru --');
        populateGuruSelect(filterSelect, 'Semua Guru');

        const perPageSelect = document.getElementById('journalPerPage');
        if (perPageSelect) journalPerPage = parseInt(perPageSelect.value) || 10;
        renderJournal();
        showLoading(false);
      } catch (error) {
        console.error('Error loading journal:', error);
        showToast('Gagal memuat jurnal', 'error');
        showLoading(false);
      }
    }

    function filterJournalByGuru() {
      journalPage = 1;
      renderJournal();
    }

    function renderJournal() {
      const container = document.getElementById('journalList');
      if (!container) return;
      const teachers = window.__journalTeachersCache || {};
      const filterGuruKey = document.getElementById('journalFilterGuru')?.value || '';
      const filterGuruNama = filterGuruKey ? (teachers[filterGuruKey]?.nama || '') : '';
      const searchQuery = (document.getElementById('journalSearch')?.value || '').trim().toLowerCase();
      let filteredData = allJournalData;
      if (filterGuruKey) {
        // Utamakan cocokkan lewat guruKey; fallback ke nama untuk record lama
        // yang belum termigrasi / belum punya guruKey sama sekali.
        filteredData = filteredData.filter(j => (j.guruKey ? j.guruKey === filterGuruKey : j.guru === filterGuruNama));
      }
      if (searchQuery) {
        filteredData = filteredData.filter(j =>
          (j.mapel || '').toLowerCase().includes(searchQuery) || (j.materi || '').toLowerCase().includes(searchQuery)
        );
      }
      const start = (journalPage - 1) * journalPerPage;
      const end = start + journalPerPage;
      const pageData = filteredData.slice(start, end);
      if (pageData.length === 0 && journalPage > 1) {
        journalPage = Math.max(1, Math.ceil(filteredData.length / journalPerPage));
        return renderJournal();
      }
      if (filteredData.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Belum ada jurnal</div>';
      } else {
        container.innerHTML = pageData.map((j) => {
          // Nama guru diambil SEGAR dari Data Guru terkini (lewat guruKey), bukan
          // nama beku yang dicatat saat jurnal disimpan dulu - supaya kalau nama
          // guru diganti admin, jurnal lama ikut menampilkan nama terbaru dan
          // tidak "hilang"/tampil nama usang. Fallback ke j.guru kalau guruKey
          // tidak ada atau tidak ditemukan lagi di Data Guru.
          const namaGuruTampil = (j.guruKey && teachers[j.guruKey]?.nama) || j.guru || '-';
          return `
          <div style="padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:8px;border-left:4px solid #2563eb;">
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
              <strong>${escapeHtml(j.mapel || '-')}</strong>
              <span style="font-size:12px;color:#6b7280;">${formatDate(j.tanggal)}</span>
            </div>
            <div style="font-size:13px;margin-top:4px;">${escapeHtml(j.materi || '-')}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">👨‍🏫 ${escapeHtml(namaGuruTampil)} | Kelas ${escapeHtml(j.kelas || '-')}</div>
            <div style="margin-top:4px;">
              <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteJournal('${escapeHtml(j.id)}')">🗑️</button>
            </div>
          </div>
        `;
        }).join('');
      }
      const totalPages = Math.ceil(filteredData.length / journalPerPage) || 1;
      document.getElementById('journalPageInfo').textContent = `Halaman ${journalPage} dari ${totalPages}`;
      document.getElementById('journalPrevBtn').disabled = journalPage <= 1;
      document.getElementById('journalNextBtn').disabled = journalPage >= totalPages;
    }

    function changeJournalPage(delta) {
      const totalPages = Math.ceil(allJournalData.length / journalPerPage) || 1;
      const newPage = Math.min(Math.max(1, journalPage + delta), totalPages);
      if (newPage !== journalPage) { journalPage = newPage; renderJournal(); }
    }

    // Validasi isi jurnal supaya tidak diisi sembarangan (satu kata, spasi
    // doang, karakter berulang seperti "aaaaaa"/"asdasd", atau kepanjangan
    // karena salah paste).
    function validateJournalText(text, minLength, maxLength) {
      const trimmed = (text || '').trim();
      if (trimmed.length < minLength || trimmed.length > maxLength) return false;
      if (/(.)\1{5,}/.test(trimmed)) return false; // karakter yang sama berulang 6x+ berturut-turut
      if (!/[a-zA-Z]/.test(trimmed)) return false; // harus ada huruf, bukan cuma angka/simbol
      return true;
    }

    async function saveJournal() {
      const mapel = document.getElementById('journalMapel').value.trim();
      const materi = document.getElementById('journalMateri').value.trim();
      const guruKey = document.getElementById('journalGuru').value; // id guru terpilih (guruKey)
      const guruNama = guruKey ? (window.__journalTeachersCache?.[guruKey]?.nama || '-') : (currentUser?.nama || '-');
      const kelas = document.getElementById('journalKelas').value;

      if (!guruKey) { showToast('Pilih guru terlebih dahulu!', 'warning'); return; }
      if (window.__journalMyKelas && !window.__journalMyKelas.includes(kelas)) {
        showToast('⛔ Anda tidak punya akses ke kelas ini', 'error'); return;
      }
      if (!mapel || !materi) { showToast('Isi mapel dan materi!', 'warning'); return; }
      if (!validateJournalText(mapel, 3, 100)) {
        showToast('Aspek/mapel harus 3-100 karakter dan wajar (bukan asal ketik)', 'error'); return;
      }
      if (!validateJournalText(materi, 30, 1000)) {
        showToast('Materi harus diisi minimal 30 karakter dengan jelas (bukan satu kata/asal ketik)', 'error'); return;
      }
      try {
        await db.ref('journal').push({
          mapel: sanitizeInput(mapel), materi: sanitizeInput(materi),
          guru: sanitizeInput(guruNama), guruKey: guruKey || null, kelas: sanitizeInput(kelas || '-'),
          tanggal: getToday(), timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Jurnal berhasil disimpan!', 'success');
        document.getElementById('journalMapel').value = '';
        document.getElementById('journalMateri').value = '';
        loadJournal();
      } catch (error) { console.error('Error saving journal:', error); showToast('Gagal menyimpan jurnal', 'error'); }
    }

    async function deleteJournal(id) {
      if (window.__journalMyKelas) {
        const entry = allJournalData.find(j => j.id === id);
        if (!entry || !window.__journalMyKelas.includes(entry.kelas)) {
          showToast('⛔ Anda tidak punya akses ke jurnal ini', 'error');
          return;
        }
      }
      if (!confirm('Yakin ingin menghapus jurnal ini?')) return;
      try { await db.ref(`journal/${id}`).remove(); showToast('Jurnal berhasil dihapus!', 'success'); loadJournal(); }
      catch (error) { console.error('Error deleting journal:', error); showToast('Gagal menghapus jurnal', 'error'); }
    }

