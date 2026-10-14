    // PROFIL RA
    async function loadProfil() {
      showLoading(true, 'Memuat profil...');
      try {
        const [profilSnap, tahunSnap] = await Promise.all([
          db.ref('profil').once('value'),
          db.ref('tahun_ajaran').once('value')
        ]);
        const profilData = profilSnap.val() || {};
        const tahunData = tahunSnap.val() || {};
        if (Object.keys(profilData).length === 0) {
          await createDefaultProfil();
          return loadProfil();
        }
        if (Object.keys(tahunData).length === 0) {
          await createDefaultTahunAjaran();
          return loadProfil();
        }
        displayProfil(profilData);
        displayTahunAjaran(tahunData);
        const isAdminProfil = currentRole === 'admin';
        ['btnEditProfil', 'btnEditTahun', 'btnEditTahunAjaran'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.style.display = isAdminProfil ? 'inline-block' : 'none';
        });
        const cardLokasiQR = document.getElementById('cardLokasiQRGuru');
        if (cardLokasiQR) {
          cardLokasiQR.style.display = isAdminProfil ? 'block' : 'none';
          if (isAdminProfil) loadLokasiSekolahInfo('lokasiSekolahInfoProfil', 'radiusSekolahProfil', 'latSekolahProfil', 'lngSekolahProfil');
        }
        await loadProfilStats();
        showLoading(false);
      } catch (error) {
        console.error('Error loading profil:', error);
        showToast('Gagal memuat profil', 'error');
        showLoading(false);
      }
    }

    async function createDefaultProfil() {
      try {
        await db.ref('profil').set({
          nama: 'RA Mambaul Ulum', npsn: '12345678', nsm: '', yayasan: '', jenjang: 'RA (Raudhatul Athfal)',
          status: 'Terakreditasi A', alamat: 'Jl. Pendidikan No. 123, Kota Pendidikan',
          desa: '', kecamatan: '', kabupaten: '', provinsi: '',
          kodepos: '12345', telp: '(021) 1234567', email: 'ra.mambaululum@gmail.com',
          website: 'https://ra-mambaululum.sch.id', kepsek: 'Hj. Siti Aminah, S.Pd.I',
          kepsek_nip: '196512342021012001', bendahara: '', operator: '', ketua_yayasan: '',
          visi: 'Terwujudnya generasi muslim yang cerdas, berakhlak mulia, dan berwawasan global berdasarkan Al-Qur\'an dan Sunnah',
          misi: ['Menyelenggarakan pendidikan yang berkualitas dan berkarakter Islami', 'Mengembangkan potensi anak secara optimal sesuai dengan tahapan usianya', 'Menanamkan nilai-nilai keimanan dan ketakwaan sejak dini', 'Menciptakan lingkungan belajar yang aman, nyaman, dan menyenangkan', 'Menjalin kerjasama yang harmonis dengan orang tua dan masyarakat'],
          tahun_berdiri: 2020, updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        console.log('✅ Profil default dibuat');
      } catch (error) { console.error('Error creating default profil:', error); }
    }

    function displayProfil(data) {
      document.getElementById('profilNama').textContent = data.nama || 'RA Mambaul Ulum';
      document.getElementById('profilNamaLengkap').textContent = data.nama || 'RA Mambaul Ulum';
      document.getElementById('profilNPSN').textContent = data.npsn || '-';
      document.getElementById('profilNSM').textContent = data.nsm || '-';
      document.getElementById('profilYayasan').textContent = data.yayasan || '-';
      document.getElementById('profilJenjang').textContent = data.jenjang || 'RA';
      document.getElementById('profilStatusLembaga').textContent = data.status || 'Aktif';
      document.getElementById('profilAlamat').textContent = data.alamat || '-';
      document.getElementById('profilDesa').textContent = data.desa || '-';
      document.getElementById('profilKecamatan').textContent = data.kecamatan || '-';
      document.getElementById('profilKabupaten').textContent = data.kabupaten || '-';
      document.getElementById('profilProvinsi').textContent = data.provinsi || '-';
      document.getElementById('profilKodepos').textContent = data.kodepos || '-';
      document.getElementById('profilTelp').textContent = data.telp || '-';
      document.getElementById('profilEmail').textContent = data.email || '-';
      document.getElementById('profilKepsek').textContent = data.kepsek || '-';
      document.getElementById('profilKepsekNip').textContent = data.kepsek_nip || '-';
      document.getElementById('profilBendahara').textContent = data.bendahara || '-';
      document.getElementById('profilOperator').textContent = data.operator || '-';
      document.getElementById('profilKetuaYayasan').textContent = data.ketua_yayasan || '-';
      document.getElementById('profilVisi').textContent = data.visi || '-';
      document.getElementById('profilTahunBerdiri').textContent = data.tahun_berdiri || '-';
      const misiList = document.getElementById('profilMisi');
      if (data.misi && Array.isArray(data.misi)) {
        misiList.innerHTML = data.misi.map(m => `<li>${escapeHtml(m)}</li>`).join('');
      } else { misiList.innerHTML = '<li>Belum ada data misi</li>'; }
      if (data.updated_at) document.getElementById('profilLastUpdate').textContent = formatTime(data.updated_at);
    }

    async function loadProfilStats() {
      try {
        const [studentsSnap, teachersSnap] = await Promise.all([
          db.ref('students').once('value'),
          db.ref('teachers').once('value')
        ]);
        const students = studentsSnap.val() || {};
        const teachers = teachersSnap.val() || {};
        document.getElementById('profilTotalSiswa').textContent = Object.keys(students).length;
        document.getElementById('profilTotalGuru').textContent = Object.keys(teachers).length;
        const kelasSet = new Set();
        Object.values(students).forEach(s => { if (s.kelas) kelasSet.add(s.kelas); });
        document.getElementById('profilTotalKelas').textContent = kelasSet.size || 0;
      } catch (error) { console.error('Error loading stats:', error); }
    }

    function editProfil() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mengubah Profil RA!', 'warning'); return; }
      showLoading(true, 'Membuka form edit...');
      db.ref('profil').once('value').then(snap => {
        const data = snap.val() || {};
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'editProfilModal';
        modal.innerHTML = `
          <div class="modal-box" style="max-width:700px;">
            <h3 style="margin-bottom:16px;">✏️ Edit Profil RA Mambaul Ulum</h3>
            <div style="max-height:70vh;overflow-y:auto;padding-right:8px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="grid-column:span 2;"><label class="label">Nama Lembaga</label><input type="text" class="field" id="editProfilNama" maxlength="100"></div>
                <div style="grid-column:span 2;"><label class="label">Nama Yayasan</label><input type="text" class="field" id="editProfilYayasan" maxlength="100"></div>
                <div><label class="label">NPSN</label><input type="text" class="field" id="editProfilNPSN" maxlength="20"></div>
                <div><label class="label">NSM (Nomor Statistik Madrasah)</label><input type="text" class="field" id="editProfilNSM" maxlength="20"></div>
                <div><label class="label">Jenjang</label><input type="text" class="field" id="editProfilJenjang" maxlength="50"></div>
                <div><label class="label">Status</label><select class="field" id="editProfilStatus"><option value="Terakreditasi A" ${data.status==='Terakreditasi A'?'selected':''}>Terakreditasi A</option><option value="Terakreditasi B" ${data.status==='Terakreditasi B'?'selected':''}>Terakreditasi B</option><option value="Terakreditasi C" ${data.status==='Terakreditasi C'?'selected':''}>Terakreditasi C</option><option value="Aktif" ${data.status==='Aktif'?'selected':''}>Aktif</option><option value="Belum Terakreditasi" ${data.status==='Belum Terakreditasi'?'selected':''}>Belum Terakreditasi</option></select></div>
                <div><label class="label">Tahun Berdiri</label><input type="number" class="field" id="editProfilTahun" min="1900" max="2099"></div>
                <div style="grid-column:span 2;"><label class="label">Alamat (Jalan)</label><input type="text" class="field" id="editProfilAlamat" maxlength="200"></div>
                <div><label class="label">Desa/Kelurahan</label><input type="text" class="field" id="editProfilDesa" maxlength="100"></div>
                <div><label class="label">Kecamatan</label><input type="text" class="field" id="editProfilKecamatan" maxlength="100"></div>
                <div><label class="label">Kabupaten/Kota</label><input type="text" class="field" id="editProfilKabupaten" maxlength="100"></div>
                <div><label class="label">Provinsi</label><input type="text" class="field" id="editProfilProvinsi" maxlength="100"></div>
                <div><label class="label">Kode Pos</label><input type="text" class="field" id="editProfilKodepos" maxlength="10"></div>
                <div><label class="label">Telepon</label><input type="text" class="field" id="editProfilTelp" maxlength="20"></div>
                <div><label class="label">Email</label><input type="email" class="field" id="editProfilEmail" maxlength="100"></div>
                <div><label class="label">Website</label><input type="text" class="field" id="editProfilWebsite" maxlength="100"></div>
                <div style="grid-column:span 2;"><hr style="border-color:#e5e7eb;margin:4px 0;"><p style="font-size:12px;font-weight:600;color:#6b7280;margin-top:8px;">👥 PENGURUS & STRUKTUR</p></div>
                <div><label class="label">Nama Kepala Sekolah</label><input type="text" class="field" id="editProfilKepsek" maxlength="100"></div>
                <div><label class="label">NIP Kepala Sekolah</label><input type="text" class="field" id="editProfilKepsekNip" maxlength="30"></div>
                <div><label class="label">Nama Bendahara</label><input type="text" class="field" id="editProfilBendahara" maxlength="100"></div>
                <div><label class="label">Nama Operator Madrasah</label><input type="text" class="field" id="editProfilOperator" maxlength="100"></div>
                <div style="grid-column:span 2;"><label class="label">Nama Ketua Yayasan</label><input type="text" class="field" id="editProfilKetuaYayasan" maxlength="100"></div>
                <div style="grid-column:span 2;"><label class="label">Visi</label><textarea class="field" id="editProfilVisi" rows="3">${escapeHtml(data.visi || '')}</textarea></div>
                <div style="grid-column:span 2;"><label class="label">Misi (pisahkan dengan baris baru)</label><textarea class="field" id="editProfilMisi" rows="5">${Array.isArray(data.misi) ? data.misi.map(m => escapeHtml(m)).join('\n') : escapeHtml(data.misi || '')}</textarea></div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:16px;"><button class="btn btn-primary" onclick="guardedCall(this, updateProfil)">💾 Simpan Perubahan</button><button class="btn btn-soft" onclick="document.getElementById('editProfilModal').remove()">Batal</button></div>
          </div>
        `;
        document.body.appendChild(modal);
        // Isi value lewat properti JS (bukan atribut HTML) - aman dari quote-breakout.
        document.getElementById('editProfilNama').value = data.nama || '';
        document.getElementById('editProfilYayasan').value = data.yayasan || '';
        document.getElementById('editProfilNPSN').value = data.npsn || '';
        document.getElementById('editProfilNSM').value = data.nsm || '';
        document.getElementById('editProfilJenjang').value = data.jenjang || 'RA';
        document.getElementById('editProfilTahun').value = data.tahun_berdiri || 2020;
        document.getElementById('editProfilAlamat').value = data.alamat || '';
        document.getElementById('editProfilDesa').value = data.desa || '';
        document.getElementById('editProfilKecamatan').value = data.kecamatan || '';
        document.getElementById('editProfilKabupaten').value = data.kabupaten || '';
        document.getElementById('editProfilProvinsi').value = data.provinsi || '';
        document.getElementById('editProfilKodepos').value = data.kodepos || '';
        document.getElementById('editProfilTelp').value = data.telp || '';
        document.getElementById('editProfilEmail').value = data.email || '';
        document.getElementById('editProfilWebsite').value = data.website || '';
        document.getElementById('editProfilKepsek').value = data.kepsek || '';
        document.getElementById('editProfilKepsekNip').value = data.kepsek_nip || '';
        document.getElementById('editProfilBendahara').value = data.bendahara || '';
        document.getElementById('editProfilOperator').value = data.operator || '';
        document.getElementById('editProfilKetuaYayasan').value = data.ketua_yayasan || '';
        showLoading(false);
      }).catch(err => { console.error('Error loading profil for edit:', err); showToast('Gagal memuat data untuk edit', 'error'); showLoading(false); });
    }

    async function updateProfil() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mengubah Profil RA!', 'warning'); return; }
      const nama = document.getElementById('editProfilNama').value.trim();
      const yayasan = document.getElementById('editProfilYayasan').value.trim();
      const npsn = document.getElementById('editProfilNPSN').value.trim();
      const nsm = document.getElementById('editProfilNSM').value.trim();
      const jenjang = document.getElementById('editProfilJenjang').value.trim();
      const status = document.getElementById('editProfilStatus').value;
      const tahun = document.getElementById('editProfilTahun').value;
      const alamat = document.getElementById('editProfilAlamat').value.trim();
      const desa = document.getElementById('editProfilDesa').value.trim();
      const kecamatan = document.getElementById('editProfilKecamatan').value.trim();
      const kabupaten = document.getElementById('editProfilKabupaten').value.trim();
      const provinsi = document.getElementById('editProfilProvinsi').value.trim();
      const kodepos = document.getElementById('editProfilKodepos').value.trim();
      const telp = document.getElementById('editProfilTelp').value.trim();
      const email = document.getElementById('editProfilEmail').value.trim();
      const website = document.getElementById('editProfilWebsite').value.trim();
      const kepsek = document.getElementById('editProfilKepsek').value.trim();
      const kepsek_nip = document.getElementById('editProfilKepsekNip').value.trim();
      const bendahara = document.getElementById('editProfilBendahara').value.trim();
      const operator = document.getElementById('editProfilOperator').value.trim();
      const ketua_yayasan = document.getElementById('editProfilKetuaYayasan').value.trim();
      const visi = document.getElementById('editProfilVisi').value.trim();
      const misiRaw = document.getElementById('editProfilMisi').value;
      if (!nama) { showToast('Nama lembaga wajib diisi!', 'warning'); return; }
      const misi = misiRaw.split('\n').filter(m => m.trim() !== '');
      try {
        await db.ref('profil').update({
          nama: sanitizeInput(nama), yayasan: sanitizeInput(yayasan || '-'),
          npsn: sanitizeInput(npsn || '-'), nsm: sanitizeInput(nsm || '-'), jenjang: sanitizeInput(jenjang || 'RA'),
          status: sanitizeInput(status), tahun_berdiri: parseInt(tahun) || 2020,
          alamat: sanitizeInput(alamat || '-'), desa: sanitizeInput(desa || '-'),
          kecamatan: sanitizeInput(kecamatan || '-'), kabupaten: sanitizeInput(kabupaten || '-'),
          provinsi: sanitizeInput(provinsi || '-'), kodepos: sanitizeInput(kodepos || '-'),
          telp: sanitizeInput(telp || '-'), email: sanitizeInput(email || '-'), website: sanitizeInput(website || '-'),
          kepsek: sanitizeInput(kepsek || '-'), kepsek_nip: sanitizeInput(kepsek_nip || '-'),
          bendahara: sanitizeInput(bendahara || '-'), operator: sanitizeInput(operator || '-'),
          ketua_yayasan: sanitizeInput(ketua_yayasan || '-'),
          visi: sanitizeInput(visi || '-'), misi: misi.length > 0 ? misi : ['-'],
          updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity('Memperbarui Profil RA/Madrasah');
        showToast('✅ Profil berhasil diperbarui!', 'success');
        document.getElementById('editProfilModal').remove();
        loadProfil();
      } catch (error) { console.error('Error updating profil:', error); showToast('❌ Gagal memperbarui profil', 'error'); }
    }

    // TAHUN AJARAN
    async function loadTahunAjaran() {
      try {
        const snapshot = await db.ref('tahun_ajaran').once('value');
        const data = snapshot.val() || {};
        if (Object.keys(data).length === 0) {
          await createDefaultTahunAjaran();
          return loadTahunAjaran();
        }
        displayTahunAjaran(data);
        ['btnEditTahun', 'btnEditTahunAjaran'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.style.display = (currentRole === 'admin') ? 'inline-block' : 'none';
        });
        updateTopbarTahun(data);
      } catch (error) { console.error('Error loading tahun ajaran:', error); }
    }

    async function createDefaultTahunAjaran() {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const nextYear = year + 1;
        const isGenap = now.getMonth() >= 6;
        await db.ref('tahun_ajaran').set({
          tahun_ajaran: `${year}/${nextYear}`, semester: isGenap ? 1 : 2,
          semester_nama: isGenap ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)',
          tanggal_mulai: `${year}-07-01`, tanggal_akhir: `${nextYear}-06-30`,
          status: 'Aktif', updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        console.log('✅ Tahun ajaran default dibuat');
      } catch (error) { console.error('Error creating default tahun ajaran:', error); }
    }

    function displayTahunAjaran(data) {
      document.getElementById('profilTahunAjaran').textContent = data.tahun_ajaran || '2025/2026';
      document.getElementById('profilSemesterAktif').textContent = data.semester_nama || 'Semester 1 (Ganjil)';
      document.getElementById('profilPeriodeAwal').textContent = data.tanggal_mulai || '-';
      document.getElementById('profilPeriodeAkhir').textContent = data.tanggal_akhir || '-';
      document.getElementById('profilStatusSemester').textContent = data.status || 'Aktif';
      document.getElementById('profilStatusSemester').style.color = data.status === 'Aktif' ? '#a7f3d0' : '#fca5a5';
    }

    function updateTopbarTahun(data) {
      const select = document.getElementById('tahunAjaranSelect');
      if (select) { select.value = data.tahun_ajaran || '2025/2026'; }
    }

    function editTahunAjaran() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mengubah Tahun Ajaran!', 'warning'); return; }
      showLoading(true, 'Membuka form edit tahun ajaran...');
      db.ref('tahun_ajaran').once('value').then(snap => {
        const data = snap.val() || {};
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'editTahunAjaranModal';
        modal.innerHTML = `
          <div class="modal-box" style="max-width:500px;">
            <h3 style="margin-bottom:16px;">📅 Edit Tahun Ajaran & Semester</h3>
            <div style="margin-bottom:12px;"><label class="label">Tahun Pelajaran</label><input type="text" class="field" id="editTahunAjaran" placeholder="Contoh: 2025/2026" maxlength="20"></div>
            <div style="margin-bottom:12px;"><label class="label">Semester</label><select class="field" id="editSemester"><option value="1" ${data.semester===1?'selected':''}>Semester 1 (Ganjil)</option><option value="2" ${data.semester===2?'selected':''}>Semester 2 (Genap)</option></select></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"><div><label class="label">Tanggal Mulai</label><input type="date" class="field" id="editTanggalMulai"></div><div><label class="label">Tanggal Akhir</label><input type="date" class="field" id="editTanggalAkhir"></div></div>
            <div style="margin-top:12px;margin-bottom:12px;"><label class="label">Status</label><select class="field" id="editStatusSemester"><option value="Aktif" ${data.status==='Aktif'?'selected':''}>Aktif</option><option value="Tutup" ${data.status==='Tutup'?'selected':''}>Tutup</option></select></div>
            <div style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e;">⚠️ Perubahan tahun ajaran akan mempengaruhi seluruh sistem.</div>
            <div style="display:flex;gap:8px;margin-top:16px;"><button class="btn btn-primary" onclick="guardedCall(this, updateTahunAjaran)">💾 Simpan</button><button class="btn btn-soft" onclick="document.getElementById('editTahunAjaranModal').remove()">Batal</button></div>
          </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('editTahunAjaran').value = data.tahun_ajaran || '';
        document.getElementById('editTanggalMulai').value = data.tanggal_mulai || '';
        document.getElementById('editTanggalAkhir').value = data.tanggal_akhir || '';
        showLoading(false);
      }).catch(err => { console.error('Error loading tahun ajaran for edit:', err); showToast('Gagal memuat data', 'error'); showLoading(false); });
    }

    async function updateTahunAjaran() {
      const tahun = document.getElementById('editTahunAjaran').value.trim();
      const semester = document.getElementById('editSemester').value;
      const tanggalMulai = document.getElementById('editTanggalMulai').value;
      const tanggalAkhir = document.getElementById('editTanggalAkhir').value;
      const status = document.getElementById('editStatusSemester').value;
      if (!tahun) { showToast('Tahun pelajaran wajib diisi!', 'warning'); return; }
      if (!/^\d{4}\/\d{4}$/.test(tahun)) { showToast('Format tahun harus YYYY/YYYY', 'error'); return; }
      const [tahun1, tahun2] = tahun.split('/');
      if (parseInt(tahun2) !== parseInt(tahun1) + 1) { showToast('Tahun kedua harus tahun berikutnya!', 'error'); return; }
      const semesterNama = semester === '1' ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)';
      try {
        await db.ref('tahun_ajaran').update({
          tahun_ajaran: sanitizeInput(tahun), semester: parseInt(semester),
          semester_nama: sanitizeInput(semesterNama), tanggal_mulai: sanitizeInput(tanggalMulai || '-'),
          tanggal_akhir: sanitizeInput(tanggalAkhir || '-'), status: sanitizeInput(status),
          updated_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('✅ Tahun ajaran berhasil diperbarui!', 'success');
        document.getElementById('editTahunAjaranModal').remove();
        loadTahunAjaran();
        loadDashboard();
        const select = document.getElementById('tahunAjaranSelect');
        if (select) select.value = tahun;
      } catch (error) { console.error('Error updating tahun ajaran:', error); showToast('❌ Gagal memperbarui tahun ajaran', 'error'); }
    }

    function gantiTahunAjaran() {
      const tahun = document.getElementById('tahunAjaranSelect').value;
      if (currentRole === 'admin') {
        db.ref('tahun_ajaran').update({ tahun_ajaran: tahun, updated_at: firebase.database.ServerValue.TIMESTAMP })
          .then(() => { showToast(`✅ Tahun ajaran diubah ke ${tahun}`, 'success'); loadTahunAjaran(); })
          .catch(err => { console.error('Error updating tahun ajaran:', err); showToast('❌ Gagal mengubah tahun ajaran', 'error'); });
      } else {
        showToast('⚠️ Hanya Admin yang dapat mengubah tahun ajaran!', 'warning');
        loadTahunAjaran();
      }
    }

