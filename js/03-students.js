    // ============================================================
    // STUDENTS - DENGAN PAGINATION + SEARCH & SORT
    // ============================================================
    let filteredStudents = [];
    let studentPageCursors = [null]; // cursor (key) untuk tiap halaman; halaman 1 = null (tanpa startAt)
    let studentPageIndex = 0; // 0-based
    let studentHasNextPage = false;
    let studentsSearchCache = null; // cache penuh, hanya dipakai saat mode cari/sortir aktif
    let studentsSearchMode = false;

    async function loadStudents() {
      const perPageSelect = document.getElementById('studentsPerPage');
      if (perPageSelect) studentPerPage = parseInt(perPageSelect.value) || 10;
      studentPageCursors = [null];
      studentPageIndex = 0;
      studentsSearchCache = null;
      window.__studentsMyKelas = await getMyKelasDiampu();
      const pagination = document.getElementById('studentsPagination');
      if (window.__studentsMyKelas) {
        // Akun dibatasi kelas (guru/wali_kelas) -> selalu pakai mode "tarik semua
        // lalu filter di browser" (sama seperti alur pencarian), supaya pagination
        // server-side (yang tidak bisa memfilter kelas) tidak pernah membocorkan
        // siswa dari kelas lain ke halaman manapun.
        studentsSearchMode = true;
        if (pagination) pagination.style.display = 'none';
        await runSearchSortStudents();
        return;
      }
      studentsSearchMode = false;
      if (pagination) pagination.style.display = '';
      await fetchStudentsPage();
    }

    async function fetchStudentsPage() {
      showLoading(true, 'Memuat data siswa...');
      try {
        // Server-side pagination pakai orderByKey + limitToFirst/startAt,
        // supaya tidak perlu menarik SELURUH data siswa ke browser.
        let query = db.ref('students').orderByKey();
        const cursor = studentPageCursors[studentPageIndex];
        if (cursor) query = query.startAt(cursor);
        query = query.limitToFirst(studentPerPage + 1); // +1 untuk deteksi ada halaman berikutnya

        const snapshot = await query.once('value');
        const items = [];
        snapshot.forEach(child => { items.push({ id: child.key, ...child.val() }); return false; });

        studentHasNextPage = items.length > studentPerPage;
        const pageItems = studentHasNextPage ? items.slice(0, studentPerPage) : items;

        if (studentHasNextPage) {
          const nextCursor = items[studentPerPage].id;
          studentPageCursors[studentPageIndex + 1] = nextCursor;
        }

        filteredStudents = pageItems; // data yang sedang ditampilkan di halaman ini
        renderStudents();
        showLoading(false);
      } catch (error) {
        console.error('Error loading students:', error);
        showToast('Gagal memuat data siswa', 'error');
        showLoading(false);
      }
    }

    // Pencarian/sortir: begitu ada kata kunci atau urutan dipilih, tarik SEMUA
    // data siswa sekali (di-cache), lalu filter/sortir di browser — supaya
    // pencarian mencakup seluruh siswa (bukan cuma yang lagi ditampilkan di
    // halaman aktif). Saat kosong lagi, kembali ke mode paginated seperti biasa.
    let studentsSearchDebounce = null;
    function searchSortStudents() {
      clearTimeout(studentsSearchDebounce);
      studentsSearchDebounce = setTimeout(runSearchSortStudents, 250);
    }

    async function runSearchSortStudents() {
      const query = (document.getElementById('studentsSearchInput')?.value || '').trim().toLowerCase();
      const sortBy = document.getElementById('studentsSortSelect')?.value || '';

      if (!query && !sortBy && !window.__studentsMyKelas) {
        studentsSearchMode = false;
        const pagination = document.getElementById('studentsPagination');
        if (pagination) pagination.style.display = '';
        loadStudents();
        return;
      }

      studentsSearchMode = true;
      const pagination = document.getElementById('studentsPagination');
      if (pagination) pagination.style.display = 'none';
      showLoading(true, 'Mencari...');
      try {
        if (!studentsSearchCache) {
          const snap = await db.ref('students').once('value');
          const data = snap.val() || {};
          let entries = Object.entries(data).map(([id, s]) => ({ id, ...s }));
          if (window.__studentsMyKelas) entries = entries.filter(s => window.__studentsMyKelas.includes(s.kelas));
          studentsSearchCache = entries;
        }
        let results = studentsSearchCache;
        if (query) {
          results = results.filter(s =>
            (s.nama || '').toLowerCase().includes(query) ||
            (s.nis || '').toLowerCase().includes(query) ||
            (s.orang_tua || '').toLowerCase().includes(query)
          );
        }
        results = [...results];
        if (sortBy === 'nama_asc') results.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
        else if (sortBy === 'nama_desc') results.sort((a, b) => (b.nama || '').localeCompare(a.nama || ''));
        else if (sortBy === 'kelas') results.sort((a, b) => (a.kelas || '').localeCompare(b.kelas || '') || (a.nama || '').localeCompare(b.nama || ''));
        else if (sortBy === 'nis') results.sort((a, b) => (a.nis || '').localeCompare(b.nis || ''));

        filteredStudents = results;
        renderStudents();
        showLoading(false);
      } catch (error) {
        console.error('Error searching students:', error);
        showToast('Gagal mencari data siswa', 'error');
        showLoading(false);
      }
    }

    function clearStudentsSearchSort() {
      document.getElementById('studentsSearchInput').value = '';
      document.getElementById('studentsSortSelect').value = '';
      studentsSearchCache = null;
      studentsSearchMode = false;
      const pagination = document.getElementById('studentsPagination');
      if (pagination) pagination.style.display = '';
      loadStudents();
    }

    function renderStudents() {
      const container = document.getElementById('studentsTableBody');
      if (!container) return;
      if (filteredStudents.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#6b7280;">${studentsSearchMode ? 'Tidak ada siswa yang cocok dengan pencarian' : 'Belum ada data siswa'}</td></tr>`;
      } else {
        container.innerHTML = filteredStudents.map((s) => {
          const badgeKategori = s.kategori_infaq === 'yatim'
            ? ' <span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;">Yatim</span>'
            : s.kategori_infaq === 'bersaudara'
            ? ' <span style="font-size:10px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:8px;">Bersaudara</span>'
            : '';
          return `
          <tr>
            <td>${escapeHtml(s.nis || '-')}</td>
            <td>${escapeHtml(s.nama || '-')}${badgeKategori}</td>
            <td>${escapeHtml(s.kelas || '-')}</td>
            <td>${escapeHtml(s.jenis_kelamin || '-')}</td>
            <td>${escapeHtml(s.orang_tua || '-')}</td>
            <td>
              <button class="btn btn-edit" style="padding:2px 10px;font-size:11px;" onclick="editStudent('${escapeHtml(s.id)}')">✏️</button>
              <button class="btn btn-success" style="padding:2px 8px;font-size:11px;" onclick="kirimLinkPortalWA('${escapeHtml(s.id)}')" title="Kirim link Portal Orang Tua via WhatsApp">🔗📲</button>
              <button class="btn" style="padding:2px 8px;font-size:11px;background:#fef3c7;color:#92400e;" onclick="resetLinkPortal('${escapeHtml(s.id)}')" title="Reset akses Portal Orang Tua (link lama & PIN lama langsung tidak berlaku)">🔄🔒</button>
              <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteStudent('${escapeHtml(s.id)}')">🗑️</button>
            </td>
          </tr>
        `;
        }).join('');
      }
      if (studentsSearchMode) {
        document.getElementById('studentsPageInfo').textContent = `${filteredStudents.length} siswa ditemukan`;
      } else {
        document.getElementById('studentsPageInfo').textContent = `Halaman ${studentPageIndex + 1}`;
        document.getElementById('studentsPrevBtn').disabled = studentPageIndex <= 0;
        document.getElementById('studentsNextBtn').disabled = !studentHasNextPage;
      }
    }

    function changeStudentPage(delta) {
      if (studentsSearchMode) return;
      const newIndex = studentPageIndex + delta;
      if (newIndex < 0) return;
      if (delta > 0 && !studentHasNextPage) return;
      studentPageIndex = newIndex;
      fetchStudentsPage();
    }

    function showTambahSiswa() {
      const myKelas = window.__studentsMyKelas;
      const kelasOptions = (myKelas || KELAS_LIST).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'tambahSiswaModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">➕ Tambah Siswa</h3>
          <div style="margin-bottom:12px;"><label class="label">NIS</label><input type="text" class="field" id="newSiswaNIS" placeholder="Nomor Induk Siswa" maxlength="20"></div>
          <div style="margin-bottom:12px;"><label class="label">Nama</label><input type="text" class="field" id="newSiswaNama" placeholder="Nama lengkap" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Kelas</label><select class="field" id="newSiswaKelas">${kelasOptions}</select></div>
          <div style="margin-bottom:12px;"><label class="label">Jenis Kelamin</label><select class="field" id="newSiswaJK"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
          <div style="margin-bottom:16px;"><label class="label">Orang Tua</label><input type="text" class="field" id="newSiswaOrtu" placeholder="Nama orang tua" maxlength="100"></div>
          <div style="margin-bottom:16px;"><label class="label">No. WhatsApp Orang Tua</label><input type="tel" class="field" id="newSiswaNoWA" placeholder="Contoh: 08123456789" maxlength="20"></div>
          <div style="margin-bottom:16px;"><label class="label">Kategori Infaq</label><select class="field" id="newSiswaKategoriInfaq"><option value="normal">Normal</option><option value="yatim">Yatim/Piatu</option><option value="bersaudara">Bersaudara (punya kakak/adik di sini)</option></select></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="guardedCall(this, () => tambahSiswa(false))">💾 Simpan & Tutup</button>
            <button class="btn btn-success" onclick="guardedCall(this, () => tambahSiswa(true))">➕ Simpan & Tambah Lagi</button>
            <button class="btn btn-soft" onclick="document.getElementById('tambahSiswaModal').remove()">Batal</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('newSiswaNIS').focus();
    }

    async function tambahSiswa(keepOpen = false) {
      const nis = document.getElementById('newSiswaNIS').value.trim();
      const nama = document.getElementById('newSiswaNama').value.trim();
      const kelas = document.getElementById('newSiswaKelas').value;
      const jk = document.getElementById('newSiswaJK').value;
      const ortu = document.getElementById('newSiswaOrtu').value.trim();
      if (!nis || !nama) { showToast('NIS dan Nama wajib diisi!', 'warning'); return; }
      if (window.__studentsMyKelas && !window.__studentsMyKelas.includes(kelas)) {
        showToast('⛔ Anda tidak punya akses ke kelas ini', 'error'); return;
      }
      if (!validateNIS(nis)) { showToast('NIS hanya boleh huruf, angka, dan tanda hubung!', 'error'); return; }
      if (!validateNama(nama)) { showToast('Nama harus 2-100 karakter!', 'error'); return; }
      try {
        // Nomor Induk permanen otomatis dibuat saat pendaftaran (transaction
        // counter global - tidak pernah tabrakan/dipakai ulang).
        const counterResult = await db.ref('settings/nomor_induk_counter').transaction(current => (current || 0) + 1);
        const nomorInduk = String(counterResult.snapshot.val()).padStart(4, '0');
        await db.ref('students').push({
          nis: sanitizeInput(nis), nama: sanitizeInput(nama), kelas: sanitizeInput(kelas),
          jenis_kelamin: sanitizeInput(jk), orang_tua: sanitizeInput(ortu),
          no_wa_ortu: sanitizeInput(document.getElementById('newSiswaNoWA')?.value.trim() || ''),
          no_wa_ortu_norm: normalisasiNomorWA(document.getElementById('newSiswaNoWA')?.value.trim() || ''), // dipakai Portal Ortu untuk cari anak by nomor WA
          kategori_infaq: document.getElementById('newSiswaKategoriInfaq')?.value || 'normal',
          nomor_induk: nomorInduk, tanggal_masuk: getToday(),
          guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        });
        if (keepOpen) {
          // Simpan & Tambah Lagi: form dikosongkan tapi Kelas & JK dipertahankan
          // (biasanya input berturut-turut untuk kelas yang sama), fokus balik ke NIS.
          showToast(`✅ ${nama} ditambahkan! Lanjut input siswa berikutnya...`, 'success');
          document.getElementById('newSiswaNIS').value = '';
          document.getElementById('newSiswaNama').value = '';
          document.getElementById('newSiswaOrtu').value = '';
          document.getElementById('newSiswaNIS').focus();
        } else {
          showToast('Siswa berhasil ditambahkan!', 'success');
          document.getElementById('tambahSiswaModal').remove();
        }
        loadStudents();
      } catch (error) { console.error('Error adding student:', error); showToast('Gagal menambahkan siswa', 'error'); }
    }

    function downloadTemplateSiswa() {
      const data = [
        ['NIS', 'Nama', 'Kelas', 'Jenis Kelamin (L/P)', 'Orang Tua'],
        ['2024001', 'Contoh: Ahmad Fauzan', 'A', 'L', 'Contoh: Bapak Fauzan']
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
      ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 18 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa');
      XLSX.writeFile(wb, 'Template_Import_Siswa.xlsx');
      showToast('✅ Template Excel berhasil diunduh!', 'success');
    }

    function normalizeHeaderSiswa(h) {
      return String(h || '').toLowerCase().replace(/[^a-z]/g, '');
    }

    async function importSiswaExcel(file) {
      if (!file) return;
      showLoading(true, 'Membaca file Excel...');
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          if (rows.length === 0) {
            showToast('File kosong atau format tidak dikenali', 'warning');
            showLoading(false);
            return;
          }

          // Cocokkan nama kolom secara fleksibel (huruf besar/kecil, spasi, tanda kurung diabaikan)
          const firstRowKeys = Object.keys(rows[0]);
          const findKey = (aliases) => firstRowKeys.find(k => aliases.includes(normalizeHeaderSiswa(k)));
          const keyNIS = findKey(['nis']);
          const keyNama = findKey(['nama', 'namalengkap']);
          const keyKelas = findKey(['kelas']);
          const keyJK = findKey(['jeniskelamin', 'jeniskelaminlp', 'jk']);
          const keyOrtu = findKey(['orangtua', 'namaorangtua', 'walimurid']);

          if (!keyNIS || !keyNama) {
            showToast('Kolom "NIS" dan "Nama" wajib ada di file Excel. Gunakan tombol Template Excel.', 'error');
            showLoading(false);
            return;
          }

          const existingSnap = await db.ref('students').once('value');
          const existingData = existingSnap.val() || {};
          const existingNIS = new Set(Object.values(existingData).map(s => String(s.nis || '').trim()));

          const toInsert = {};
          const seenInFile = new Set();
          let skipped = 0, invalid = 0, ditolakKelas = 0;

          rows.forEach(row => {
            const nis = String(row[keyNIS] || '').trim();
            const nama = String(row[keyNama] || '').trim();
            const kelas = (String(row[keyKelas] || 'A').trim().toUpperCase() || 'A');
            let jk = String(row[keyJK] || 'L').trim().toUpperCase();
            if (jk !== 'L' && jk !== 'P') jk = jk.startsWith('P') ? 'P' : 'L';
            const ortu = String(row[keyOrtu] || '').trim();

            if (!nis || !nama || !validateNIS(nis) || !validateNama(nama)) { invalid++; return; }
            if (window.__studentsMyKelas && !window.__studentsMyKelas.includes(kelas)) { ditolakKelas++; return; }
            if (existingNIS.has(nis) || seenInFile.has(nis)) { skipped++; return; }
            seenInFile.add(nis);

            const key = db.ref('students').push().key;
            toInsert[key] = {
              nis: sanitizeInput(nis), nama: sanitizeInput(nama), kelas: sanitizeInput(kelas),
              jenis_kelamin: jk, orang_tua: sanitizeInput(ortu), created_at: Date.now()
            };
          });

          const insertCount = Object.keys(toInsert).length;
          if (insertCount === 0) {
            showToast('Tidak ada data baru untuk diimport (semua NIS sudah ada / data tidak valid / di luar akses kelas Anda)', 'warning');
            showLoading(false);
            return;
          }

          // Tulis semua sekaligus lewat satu multi-path update (bukan loop push berkali-kali).
          const updates = {};
          Object.entries(toInsert).forEach(([key, val]) => { updates[`students/${key}`] = val; });
          await db.ref().update(updates);

          logActivity(`Import Excel: ${insertCount} siswa baru ditambahkan${skipped ? `, ${skipped} dilewati (NIS duplikat)` : ''}${invalid ? `, ${invalid} baris tidak valid` : ''}${ditolakKelas ? `, ${ditolakKelas} ditolak (di luar kelas yang diampu)` : ''}`);
          showToast(`✅ ${insertCount} siswa berhasil diimport!${skipped ? ` (${skipped} dilewati krn NIS duplikat)` : ''}${invalid ? ` (${invalid} baris tidak valid)` : ''}${ditolakKelas ? ` (${ditolakKelas} ditolak, di luar kelas Anda)` : ''}`, 'success');
          document.getElementById('importSiswaFile').value = '';
          loadStudents();
        } catch (error) {
          console.error('Error importing siswa excel:', error);
          showToast('❌ Gagal membaca/import file Excel. Pastikan formatnya sesuai template.', 'error');
        }
        showLoading(false);
      };
      reader.onerror = () => { showToast('❌ Gagal membaca file', 'error'); showLoading(false); };
      reader.readAsArrayBuffer(file);
    }

    async function editStudent(id) {
      showLoading(true, 'Memuat data siswa...');
      let student;
      try {
        const snap = await db.ref(`students/${id}`).once('value');
        student = snap.val();
        showLoading(false);
      } catch (error) {
        console.error('Error fetching student for edit:', error);
        showToast('Gagal memuat data siswa', 'error');
        showLoading(false);
        return;
      }
      if (!student) { showToast('Data siswa tidak ditemukan (mungkin sudah dihapus)!', 'error'); return; }
      if (window.__studentsMyKelas && !window.__studentsMyKelas.includes(student.kelas)) {
        showToast('⛔ Anda tidak punya akses ke siswa ini', 'error');
        return;
      }
      const myKelas = window.__studentsMyKelas;
      const kelasOptions = (myKelas || KELAS_LIST).map(k => `<option value="${escapeHtml(k)}" ${student.kelas === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('');
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'editSiswaModal';
      modal.innerHTML = `
        <div class="modal-box">
          <h3 style="margin-bottom:16px;">✏️ Edit Siswa</h3>
          <div style="margin-bottom:12px;"><label class="label">NIS</label><input type="text" class="field" id="editSiswaNIS" maxlength="20"></div>
          <div style="margin-bottom:12px;"><label class="label">Nama</label><input type="text" class="field" id="editSiswaNama" maxlength="100"></div>
          <div style="margin-bottom:12px;"><label class="label">Kelas</label><select class="field" id="editSiswaKelas">${kelasOptions}</select></div>
          <div style="margin-bottom:12px;"><label class="label">JK</label><select class="field" id="editSiswaJK"><option value="L" ${student.jenis_kelamin==='L'?'selected':''}>Laki-laki</option><option value="P" ${student.jenis_kelamin==='P'?'selected':''}>Perempuan</option></select></div>
          <div style="margin-bottom:16px;"><label class="label">Orang Tua</label><input type="text" class="field" id="editSiswaOrtu" maxlength="100"></div>
          <div style="margin-bottom:16px;"><label class="label">No. WhatsApp Orang Tua</label><input type="tel" class="field" id="editSiswaNoWA" placeholder="Contoh: 08123456789" maxlength="20"></div>
          <div style="margin-bottom:16px;"><label class="label">Kategori Infaq</label><select class="field" id="editSiswaKategoriInfaq"><option value="normal" ${(!student.kategori_infaq || student.kategori_infaq === 'normal') ? 'selected' : ''}>Normal</option><option value="yatim" ${student.kategori_infaq === 'yatim' ? 'selected' : ''}>Yatim/Piatu</option><option value="bersaudara" ${student.kategori_infaq === 'bersaudara' ? 'selected' : ''}>Bersaudara (punya kakak/adik di sini)</option></select></div>
          <div style="margin-bottom:16px;">
            <label class="label">Foto Anak (untuk Portal Orang Tua)</label>
            <div style="display:flex;align-items:center;gap:10px;">
              <div id="editSiswaFotoPreview" style="width:52px;height:52px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:11px;color:#9ca3af;flex-shrink:0;">Memuat...</div>
              <input type="file" accept="image/*" class="field" id="editSiswaFotoInput" style="flex:1;padding:6px;" onchange="prosesFotoSiswa('${escapeHtml(id)}', this)">
            </div>
            <p style="font-size:11px;color:#9ca3af;margin-top:4px;">Foto otomatis dikompres kecil sebelum disimpan (hemat kuota Firebase).</p>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, () => updateSiswa('${escapeHtml(id)}'))">💾 Update</button><button class="btn btn-soft" onclick="document.getElementById('editSiswaModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      // Isi value lewat properti JS (bukan atribut HTML) - aman dari quote-breakout,
      // setara textContent untuk form input, tidak butuh escaping sama sekali.
      document.getElementById('editSiswaNIS').value = student.nis || '';
      document.getElementById('editSiswaNama').value = student.nama || '';
      document.getElementById('editSiswaOrtu').value = student.orang_tua || '';
      document.getElementById('editSiswaNoWA').value = student.no_wa_ortu || '';
      muatPreviewFotoSiswa(id);
    }

    // Foto disimpan TERPISAH dari node 'students' (path 'student_photos/{id}')
    // supaya tidak ikut ke-download tiap kali halaman lain (Absensi, Nilai,
    // Infaq, dst.) memuat data siswa - cuma dibaca saat memang dibutuhkan
    // (preview di form ini & Portal Orang Tua), hemat kuota Firebase Spark.
    async function muatPreviewFotoSiswa(studentId) {
      const preview = document.getElementById('editSiswaFotoPreview');
      if (!preview) return;
      try {
        const snap = await db.ref(`student_photos/${studentId}`).once('value');
        const foto = snap.val();
        preview.innerHTML = foto ? `<img src="${foto}" style="width:100%;height:100%;object-fit:cover;">` : 'Belum ada';
      } catch (error) { console.error('Error load preview foto:', error); preview.innerHTML = 'Gagal muat'; }
    }

    function prosesFotoSiswa(studentId, inputEl) {
      const file = inputEl.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar!', 'warning'); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          // Kompres: resize maks 200x200px (jaga rasio), JPEG kualitas 0.6.
          const MAKS_DIMENSI = 200;
          let { width, height } = img;
          if (width > height && width > MAKS_DIMENSI) { height = Math.round(height * MAKS_DIMENSI / width); width = MAKS_DIMENSI; }
          else if (height > MAKS_DIMENSI) { width = Math.round(width * MAKS_DIMENSI / height); height = MAKS_DIMENSI; }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          try {
            await db.ref(`student_photos/${studentId}`).set(dataUrl);
            showToast(`✅ Foto berhasil disimpan (${Math.round(dataUrl.length / 1024)}KB)`, 'success');
            muatPreviewFotoSiswa(studentId);
          } catch (error) { console.error('Error saving foto siswa:', error); showToast('❌ Gagal menyimpan foto', 'error'); }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    async function updateSiswa(id) {
      const nis = document.getElementById('editSiswaNIS').value.trim();
      const nama = document.getElementById('editSiswaNama').value.trim();
      const kelas = document.getElementById('editSiswaKelas').value;
      const jk = document.getElementById('editSiswaJK').value;
      const ortu = document.getElementById('editSiswaOrtu').value.trim();
      if (!nis || !nama) { showToast('NIS dan Nama wajib diisi!', 'warning'); return; }
      if (window.__studentsMyKelas && !window.__studentsMyKelas.includes(kelas)) {
        showToast('⛔ Anda tidak punya akses ke kelas ini', 'error'); return;
      }
      if (!validateNIS(nis)) { showToast('NIS hanya boleh huruf, angka, dan tanda hubung!', 'error'); return; }
      if (!validateNama(nama)) { showToast('Nama harus 2-100 karakter!', 'error'); return; }
      try {
        await db.ref(`students/${id}`).update({
          nis: sanitizeInput(nis), nama: sanitizeInput(nama), kelas: sanitizeInput(kelas),
          jenis_kelamin: sanitizeInput(jk), orang_tua: sanitizeInput(ortu),
          no_wa_ortu: sanitizeInput(document.getElementById('editSiswaNoWA')?.value.trim() || ''),
          no_wa_ortu_norm: normalisasiNomorWA(document.getElementById('editSiswaNoWA')?.value.trim() || ''), // dipakai Portal Ortu untuk cari anak by nomor WA
          kategori_infaq: document.getElementById('editSiswaKategoriInfaq')?.value || 'normal'
        });
        showToast('Data siswa berhasil diupdate!', 'success');
        document.getElementById('editSiswaModal').remove();
        refreshStudentsView();
      } catch (error) { console.error('Error updating student:', error); showToast('Gagal mengupdate siswa', 'error'); }
    }

    async function deleteStudent(id) {
      if (window.__studentsMyKelas && !filteredStudents.some(s => s.id === id)) {
        showToast('⛔ Anda tidak punya akses ke siswa ini', 'error');
        return;
      }
      if (!confirm('Yakin ingin menghapus siswa ini?')) return;
      try { await db.ref(`students/${id}`).remove(); showToast('Siswa berhasil dihapus!', 'success'); refreshStudentsView(); }
      catch (error) { console.error('Error deleting student:', error); showToast('Gagal menghapus siswa', 'error'); }
    }

    // Refresh tabel Data Siswa sesuai mode yang lagi aktif (pencarian atau paginated biasa).
    function refreshStudentsView() {
      studentsSearchCache = null; // cache lama sudah basi setelah ada perubahan data
      if (studentsSearchMode) { runSearchSortStudents(); } else { fetchStudentsPage(); }
    }

    // ============================================================
    // BUKU INDUK (biodata permanen siswa - aktif & alumni, tidak dihapus)
    // ============================================================
    let bukuIndukCache = [];

    async function loadBukuInduk() {
      showLoading(true, 'Memuat buku induk...');
      try {
        const [studentsSnap, alumniSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('alumni').once('value')
        ]);
        const students = studentsSnap.val() || {};
        const alumni = alumniSnap.val() || {};
        bukuIndukCache = [
          ...Object.entries(students).map(([id, s]) => ({ id, ...s, isAlumni: false })),
          ...Object.entries(alumni).map(([id, s]) => ({ id, ...s, isAlumni: true }))
        ].sort((a, b) => {
          const na = parseInt(a.nomor_induk, 10), nb = parseInt(b.nomor_induk, 10);
          if (isNaN(na) && isNaN(nb)) return (a.nama || '').localeCompare(b.nama || '');
          if (isNaN(na)) return 1; // yang belum ada nomor induk ditaruh di akhir
          if (isNaN(nb)) return -1;
          return na - nb;
        });
        renderBukuIndukTable();
        showLoading(false);
      } catch (error) {
        console.error('Error loading buku induk:', error);
        showToast('Gagal memuat buku induk', 'error');
        showLoading(false);
      }
    }

    function renderBukuIndukTable() {
      const tbody = document.getElementById('bukuIndukTableBody');
      if (!tbody) return;
      const query = (document.getElementById('bukuIndukSearch')?.value || '').trim().toLowerCase();
      const filterStatus = document.getElementById('bukuIndukFilterStatus')?.value || '';
      let filtered = bukuIndukCache;
      if (filterStatus === 'aktif') filtered = filtered.filter(s => !s.isAlumni);
      else if (filterStatus === 'lulus') filtered = filtered.filter(s => s.isAlumni);
      if (query) {
        filtered = filtered.filter(s =>
          (s.nama || '').toLowerCase().includes(query) ||
          (s.nomor_induk || '').toString().toLowerCase().includes(query) ||
          (s.nisn || '').toLowerCase().includes(query)
        );
      }
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#6b7280;">Tidak ada data yang cocok</td></tr>';
        return;
      }
      tbody.innerHTML = filtered.map((s, idx) => {
        const ttl = (s.tempat_lahir || s.tanggal_lahir) ? `${escapeHtml(s.tempat_lahir || '-')}, ${escapeHtml(formatDate(s.tanggal_lahir) || '-')}` : '-';
        const statusLabel = s.isAlumni ? `Lulus ${escapeHtml(s.tahun_lulus || '')}` : 'Aktif';
        const statusColor = s.isAlumni ? '#6b7280' : '#059669';
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(s.nomor_induk || '-')}</td>
          <td>${escapeHtml(s.nisn || '-')}</td>
          <td>${escapeHtml(s.nama || '-')}</td>
          <td>${ttl}</td>
          <td>${escapeHtml(s.jenis_kelamin || '-')}</td>
          <td style="font-size:12px;">${escapeHtml(s.nama_ayah || '-')} / ${escapeHtml(s.nama_ibu || '-')}</td>
          <td>${s.tanggal_masuk ? escapeHtml(formatDate(s.tanggal_masuk)) : '-'}</td>
          <td><span style="color:${statusColor};font-weight:600;">${statusLabel}</span></td>
          <td><button class="btn btn-edit" style="padding:2px 10px;font-size:11px;" onclick="editBiodataSiswa('${escapeHtml(s.id)}', ${s.isAlumni})">✏️ Biodata</button></td>
        </tr>`;
      }).join('');
    }

    function editBiodataSiswa(id, isAlumni) {
      const student = bukuIndukCache.find(s => s.id === id);
      if (!student) { showToast('Data tidak ditemukan', 'error'); return; }
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'biodataSiswaModal';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:520px;">
          <h3 style="margin-bottom:4px;">📖 Biodata Buku Induk</h3>
          <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">${escapeHtml(student.nama || '-')} - ${student.isAlumni ? 'Alumni' : 'Siswa Aktif'}</p>

          <div style="display:flex;align-items:end;gap:8px;margin-bottom:12px;">
            <div style="flex:1;"><label class="label">Nomor Induk (permanen)</label><input type="text" class="field" id="biodataNomorInduk" readonly style="background:#f3f4f6;"></div>
            <button class="btn btn-soft" id="btnGenerateNomorInduk" onclick="generateNomorIndukSiswa('${escapeHtml(id)}', ${isAlumni})">🔢 Generate</button>
          </div>
          <div class="grid-2" style="margin-bottom:12px;">
            <div><label class="label">NISN (opsional)</label><input type="text" class="field" id="biodataNISN" maxlength="20"></div>
            <div><label class="label">Agama</label><input type="text" class="field" id="biodataAgama" maxlength="30" placeholder="Islam"></div>
          </div>
          <div class="grid-2" style="margin-bottom:12px;">
            <div><label class="label">Tempat Lahir</label><input type="text" class="field" id="biodataTempatLahir" maxlength="50"></div>
            <div><label class="label">Tanggal Lahir</label><input type="date" class="field" id="biodataTanggalLahir"></div>
          </div>
          <div style="margin-bottom:12px;"><label class="label">Anak ke- (dari jumlah bersaudara)</label><input type="text" class="field" id="biodataAnakKe" maxlength="20" placeholder="Contoh: 2 dari 3 bersaudara"></div>
          <div style="margin-bottom:12px;"><label class="label">Alamat Lengkap</label><textarea class="field" id="biodataAlamat" rows="2" maxlength="300"></textarea></div>
          <div class="grid-2" style="margin-bottom:12px;">
            <div><label class="label">Nama Ayah</label><input type="text" class="field" id="biodataNamaAyah" maxlength="100"></div>
            <div><label class="label">Pekerjaan Ayah</label><input type="text" class="field" id="biodataPekerjaanAyah" maxlength="60"></div>
          </div>
          <div class="grid-2" style="margin-bottom:12px;">
            <div><label class="label">Nama Ibu</label><input type="text" class="field" id="biodataNamaIbu" maxlength="100"></div>
            <div><label class="label">Pekerjaan Ibu</label><input type="text" class="field" id="biodataPekerjaanIbu" maxlength="60"></div>
          </div>
          <div class="grid-2" style="margin-bottom:16px;">
            <div><label class="label">Asal Sekolah/TK (kalau pindahan)</label><input type="text" class="field" id="biodataAsalSekolah" maxlength="100"></div>
            <div><label class="label">Tanggal Masuk</label><input type="date" class="field" id="biodataTanggalMasuk"></div>
          </div>
          <div style="display:flex;gap:8px;"><button class="btn btn-primary" onclick="guardedCall(this, () => saveBiodataSiswa('${escapeHtml(id)}', ${isAlumni}))">💾 Simpan Biodata</button><button class="btn btn-soft" onclick="document.getElementById('biodataSiswaModal').remove()">Batal</button></div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('biodataNomorInduk').value = student.nomor_induk || '(belum ada)';
      document.getElementById('biodataNISN').value = student.nisn || '';
      document.getElementById('biodataAgama').value = student.agama || '';
      document.getElementById('biodataTempatLahir').value = student.tempat_lahir || '';
      document.getElementById('biodataTanggalLahir').value = student.tanggal_lahir || '';
      document.getElementById('biodataAnakKe').value = student.anak_ke || '';
      document.getElementById('biodataAlamat').value = student.alamat || '';
      document.getElementById('biodataNamaAyah').value = student.nama_ayah || '';
      document.getElementById('biodataPekerjaanAyah').value = student.pekerjaan_ayah || '';
      document.getElementById('biodataNamaIbu').value = student.nama_ibu || '';
      document.getElementById('biodataPekerjaanIbu').value = student.pekerjaan_ibu || '';
      document.getElementById('biodataAsalSekolah').value = student.asal_sekolah || '';
      document.getElementById('biodataTanggalMasuk').value = student.tanggal_masuk || '';
    }

    // Nomor Induk permanen: pakai transaction pada counter global supaya tidak
    // ada 2 siswa kebagian nomor yang sama walau di-klik nyaris bersamaan, dan
    // nomor yang sudah dipakai TIDAK PERNAH dipakai ulang (sesuai aturan Buku Induk).
    async function generateNomorIndukSiswa(id, isAlumni) {
      const student = bukuIndukCache.find(s => s.id === id);
      if (student?.nomor_induk) { showToast('Siswa ini sudah punya Nomor Induk!', 'warning'); return; }
      try {
        const result = await db.ref('settings/nomor_induk_counter').transaction(current => (current || 0) + 1);
        const nomorBaru = String(result.snapshot.val()).padStart(4, '0');
        const path = isAlumni ? `alumni/${id}` : `students/${id}`;
        await db.ref(path).update({ nomor_induk: nomorBaru });
        showToast(`✅ Nomor Induk ${nomorBaru} berhasil dibuat!`, 'success');
        const input = document.getElementById('biodataNomorInduk');
        if (input) input.value = nomorBaru;
        loadBukuInduk();
      } catch (error) { console.error('Error generating nomor induk:', error); showToast('Gagal membuat nomor induk', 'error'); }
    }

    async function saveBiodataSiswa(id, isAlumni) {
      const data = {
        nisn: sanitizeInput(document.getElementById('biodataNISN').value.trim()),
        agama: sanitizeInput(document.getElementById('biodataAgama').value.trim()),
        tempat_lahir: sanitizeInput(document.getElementById('biodataTempatLahir').value.trim()),
        tanggal_lahir: document.getElementById('biodataTanggalLahir').value || '',
        anak_ke: sanitizeInput(document.getElementById('biodataAnakKe').value.trim()),
        alamat: sanitizeInput(document.getElementById('biodataAlamat').value.trim()),
        nama_ayah: sanitizeInput(document.getElementById('biodataNamaAyah').value.trim()),
        pekerjaan_ayah: sanitizeInput(document.getElementById('biodataPekerjaanAyah').value.trim()),
        nama_ibu: sanitizeInput(document.getElementById('biodataNamaIbu').value.trim()),
        pekerjaan_ibu: sanitizeInput(document.getElementById('biodataPekerjaanIbu').value.trim()),
        asal_sekolah: sanitizeInput(document.getElementById('biodataAsalSekolah').value.trim()),
        tanggal_masuk: document.getElementById('biodataTanggalMasuk').value || ''
      };
      try {
        const path = isAlumni ? `alumni/${id}` : `students/${id}`;
        await db.ref(path).update(data);
        showToast('✅ Biodata berhasil disimpan!', 'success');
        document.getElementById('biodataSiswaModal').remove();
        loadBukuInduk();
      } catch (error) { console.error('Error saving biodata siswa:', error); showToast('Gagal menyimpan biodata', 'error'); }
    }

    function exportBukuIndukExcel() {
      if (bukuIndukCache.length === 0) { showToast('Belum ada data untuk diexport!', 'warning'); return; }
      const data = [
        ['No', 'Nomor Induk', 'NISN', 'Nama', 'JK', 'Tempat Lahir', 'Tanggal Lahir', 'Agama', 'Anak Ke', 'Alamat', 'Nama Ayah', 'Pekerjaan Ayah', 'Nama Ibu', 'Pekerjaan Ibu', 'Asal Sekolah', 'Tanggal Masuk', 'Status', 'Kelas/Kelas Terakhir'],
        ...bukuIndukCache.map((s, idx) => [
          idx + 1, s.nomor_induk || '-', s.nisn || '-', s.nama || '-', s.jenis_kelamin || '-',
          s.tempat_lahir || '-', s.tanggal_lahir || '-', s.agama || '-', s.anak_ke || '-', s.alamat || '-',
          s.nama_ayah || '-', s.pekerjaan_ayah || '-', s.nama_ibu || '-', s.pekerjaan_ibu || '-',
          s.asal_sekolah || '-', s.tanggal_masuk || '-', s.isAlumni ? `Lulus ${s.tahun_lulus || ''}` : 'Aktif',
          s.isAlumni ? (s.kelas_terakhir || '-') : (s.kelas || '-')
        ])
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(amankanDataExcel(data));
      XLSX.utils.book_append_sheet(wb, ws, 'Buku Induk');
      XLSX.writeFile(wb, 'Buku_Induk_Siswa.xlsx');
      showToast('✅ Export Excel berhasil!', 'success');
    }

    function cetakBukuInduk() {
      if (bukuIndukCache.length === 0) { showToast('Belum ada data untuk dicetak!', 'warning'); return; }
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
      const baris = bukuIndukCache.map((s, idx) => {
        const ttl = (s.tempat_lahir || s.tanggal_lahir) ? `${escapeHtml(s.tempat_lahir || '-')}, ${escapeHtml(formatDate(s.tanggal_lahir) || '-')}` : '-';
        const statusLabel = s.isAlumni ? `Lulus ${escapeHtml(s.tahun_lulus || '')}` : 'Aktif';
        return `<tr>
          <td style="text-align:center;">${idx + 1}</td><td>${escapeHtml(s.nomor_induk || '-')}</td><td>${escapeHtml(s.nisn || '-')}</td>
          <td>${escapeHtml(s.nama || '-')}</td><td style="text-align:center;">${escapeHtml(s.jenis_kelamin || '-')}</td><td>${ttl}</td>
          <td style="font-size:9.5px;">${escapeHtml(s.nama_ayah || '-')} / ${escapeHtml(s.nama_ibu || '-')}</td>
          <td>${s.tanggal_masuk ? escapeHtml(formatDate(s.tanggal_masuk)) : '-'}</td><td style="text-align:center;">${statusLabel}</td>
        </tr>`;
      }).join('');

      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Buku Induk Siswa</title>
        <style>
          body { font-family:Arial,sans-serif; font-size:11px; padding:20px; color:#111827; }
          h1 { text-align:center; font-size:16px; margin-bottom:2px; }
          h2 { text-align:center; font-size:13px; font-weight:normal; margin-top:0; margin-bottom:16px; color:#374151; }
          table { border-collapse:collapse; width:100%; }
          th, td { border:1px solid #9ca3af; padding:4px 6px; font-size:9.5px; }
          th { background:#f3f4f6; text-align:center; }
          @media print { body { padding:8px; } }
        </style></head><body>
          <h1>${escapeHtml(namaSekolah)}</h1>
          <h2>Buku Induk Siswa</h2>
          <table>
            <thead><tr><th>No</th><th>No. Induk</th><th>NISN</th><th>Nama</th><th>JK</th><th>TTL</th><th>Ayah / Ibu</th><th>Tgl Masuk</th><th>Status</th></tr></thead>
            <tbody>${baris}</tbody>
          </table>
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

