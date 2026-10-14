    // ============================================================
    // TEACHER ATTENDANCE
    // ============================================================

    // Setup data contoh guru — HANYA dijalankan manual oleh Admin dari
    // Admin Panel (bukan otomatis tiap halaman dibuka), dan pakai Firebase
    // transaction supaya tidak terjadi duplikasi walau diklik berkali-kali.
    async function createDefaultTeachers() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat menjalankan setup ini!', 'warning'); return; }
      if (!confirm('Buat 5 data guru contoh? Ini hanya akan berjalan jika belum ada data guru sama sekali.')) return;
      showLoading(true, 'Membuat data guru contoh...');
      try {
        const teacherList = [
          { nama: 'Ibu Siti Aminah', nip: '198512342021012001', mapel: 'Nilai Agama dan Moral', jk: 'P', no_hp: '081234567890' },
          { nama: 'Bapak Ahmad Fauzi', nip: '198612342021012002', mapel: 'Bahasa', jk: 'L', no_hp: '081234567891' },
          { nama: 'Ibu Dewi Lestari', nip: '198712342021012003', mapel: 'Kognitif', jk: 'P', no_hp: '081234567892' },
          { nama: 'Bapak Muhammad Rizki', nip: '198812342021012004', mapel: 'Fisik Motorik', jk: 'L', no_hp: '081234567893' },
          { nama: 'Ibu Fatimah Zahra', nip: '198912342021012005', mapel: 'Sosial Emosional', jk: 'P', no_hp: '081234567894' }
        ];
        const defaultTeachers = {};
        teacherList.forEach(t => {
          const key = db.ref('teachers').push().key;
          defaultTeachers[key] = { ...t, guruKey: currentUser?.id || null, created_at: Date.now() };
        });

        // Transaction: hanya menulis jika node 'teachers' benar-benar masih kosong.
        const result = await db.ref('teachers').transaction(currentData => {
          if (currentData && Object.keys(currentData).length > 0) return; // batal, sudah ada data
          return defaultTeachers;
        });

        if (result.committed) {
          showToast('✅ Data guru contoh berhasil dibuat!', 'success');
          if (currentPage === 'teacher-attendance') loadTeacherAttendance();
        } else {
          showToast('ℹ️ Data guru sudah ada, setup dilewati', 'info');
        }
        showLoading(false);
      } catch (error) {
        console.error('❌ Error creating default teachers:', error);
        showToast('❌ Gagal membuat data guru contoh', 'error');
        showLoading(false);
      }
    }

    async function loadTeacherAttendance() {
      showLoading(true, 'Memuat data guru...');
      try {
        const today = getToday();
        const tanggal = document.getElementById('filterTanggalGuru').value || today;
        document.getElementById('filterTanggalGuru').value = tanggal;

        const [teachersSnap, attendanceSnap, usersSnap] = await Promise.all([
          db.ref('teachers').once('value'),
          db.ref(`teacher_attendance/${tanggal}`).once('value'),
          db.ref('users').once('value')
        ]);

        const teachers = teachersSnap.val() || {};
        const attendance = attendanceSnap.val() || {};
        const users = usersSnap.val() || {};
        window.__linkedTeacherIds = new Set(Object.values(users).map(u => u.teacher_id).filter(Boolean));

        console.log('📊 DATA GURU:', teachers);
        console.log('📊 JUMLAH GURU:', Object.keys(teachers).length);

        allTeachers = Object.entries(teachers).map(([key, val]) => ({ ...val, id: key }));
        allTeacherAttendance = attendance;

        document.getElementById('totalGuru').textContent = allTeachers.length;
        document.getElementById('totalAbsenGuru').textContent = Object.values(attendance).filter(a => a?.datang).length;
        const btnQR = document.getElementById('btnQRAbsenGuru');
        if (btnQR) btnQR.style.display = (currentRole === 'admin') ? 'inline-flex' : 'none';

        renderTeacherAttendance();
        showLoading(false);
      } catch (error) {
        console.error('❌ Error loading teacher attendance:', error);
        showToast('❌ Gagal memuat data guru: ' + error.message, 'error');
        showLoading(false);
      }
    }

    function renderTeacherAttendance() {
      const container = document.getElementById('teacherAttendanceList');
      if (!container) return;

      console.log('📊 All Teachers untuk render:', allTeachers);

      if (!allTeachers || allTeachers.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px;color:#6b7280;">
            <div style="font-size:64px;margin-bottom:16px;">👨‍🏫</div>
            <h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">Belum ada data guru</h3>
            <p style="font-size:14px;margin-bottom:16px;">Silakan tambahkan guru melalui tombol di bawah</p>
            <button class="btn btn-primary" onclick="showTambahGuru()">+ Tambah Guru</button>
            <button class="btn btn-soft" style="margin-left:8px;" onclick="loadTeacherAttendance()">🔄 Refresh</button>
          </div>
        `;
        return;
      }

      let filtered = [...allTeachers];
      
      if (currentFilterStatus === 'hadir') {
        filtered = filtered.filter(t => allTeacherAttendance[t.id]?.datang);
      } else if (currentFilterStatus === 'belum') {
        filtered = filtered.filter(t => !allTeacherAttendance[t.id]?.datang);
      }

      if (currentSearchGuru) {
        const search = currentSearchGuru.toLowerCase();
        filtered = filtered.filter(t => 
          (t.nama || '').toLowerCase().includes(search) ||
          (t.mapel || '').toLowerCase().includes(search) ||
          (t.nip || '').includes(search)
        );
      }

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:30px;color:#6b7280;">
            <div style="font-size:48px;margin-bottom:12px;">🔍</div>
            <p style="font-size:16px;font-weight:600;">Tidak ada guru yang sesuai</p>
            <p style="font-size:13px;">Coba ubah filter pencarian</p>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map((teacher, index) => {
        const absen = allTeacherAttendance[teacher.id] || {};
        const datang = absen.datang;
        const pulang = absen.pulang;
        const isHadir = !!datang;

        return `
          <div class="teacher-attendance-item ${isHadir ? 'reguler' : 'non-reguler'}" 
               style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:8px;margin-bottom:6px;border-left:4px solid ${isHadir ? '#059669' : '#dc2626'};gap:10px;flex-wrap:wrap;background:${isHadir ? '#f0fdf4' : '#fef2f2'};">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex:1;">
              <div style="width:36px;height:36px;border-radius:50%;background:${isHadir ? '#059669' : '#9ca3af'};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;">
                ${index + 1}
              </div>
              <div>
                <div style="font-weight:600;">${escapeHtml(teacher.nama || '-')}</div>
                <div style="font-size:12px;color:#6b7280;">
                  ${escapeHtml(teacher.mapel || '-')} 
                  ${teacher.nip ? `• NIP: ${escapeHtml(teacher.nip)}` : ''}
                  ${teacher.kelas_diampu?.length ? `• Kelas: ${escapeHtml(teacher.kelas_diampu.join(', '))}` : ''}
                </div>
                ${window.__linkedTeacherIds?.has(teacher.id)
                  ? `<span style="font-size:10px;color:#059669;">🔗 Punya akun login</span>`
                  : (currentRole === 'admin' ? `<button class="btn btn-soft" style="padding:1px 8px;font-size:10px;min-height:22px;margin-top:2px;" onclick="guardedCall(this, () => buatAkunLoginGuru('${escapeHtml(teacher.id)}'))">🔗 Buat Akun Login</button>` : `<span style="font-size:10px;color:#9ca3af;">Belum ada akun login</span>`)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              ${datang ? `
                <span style="font-size:11px;background:#dcfce7;color:#065f46;padding:3px 8px;border-radius:10px;font-weight:600;">
                  🌅 Datang ${formatTime(datang.timestamp)}
                </span>
                <span class="metode-badge" style="font-size:9px;padding:2px 6px;border-radius:10px;background:#dbeafe;color:#1e40af;">
                  ${escapeHtml(datang.metode || 'manual')}${datang.by ? ` • ${escapeHtml(datang.by)}` : ''}
                </span>
                <button class="btn btn-danger" style="padding:2px 8px;font-size:10px;min-height:28px;" onclick="resetTeacherAttendance('${escapeHtml(teacher.id)}','datang')" title="Reset absen datang">↺</button>
              ` : `
                <button class="btn btn-success" style="padding:4px 10px;font-size:11px;min-height:30px;" onclick="absenManualGuru('${escapeHtml(teacher.id)}','datang')">✅ Absen Datang</button>
              `}
              ${pulang ? `
                <span style="font-size:11px;background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:10px;font-weight:600;">
                  🌇 Pulang ${formatTime(pulang.timestamp)}
                </span>
                <span class="metode-badge" style="font-size:9px;padding:2px 6px;border-radius:10px;background:#dbeafe;color:#1e40af;">
                  ${escapeHtml(pulang.metode || 'manual')}${pulang.by ? ` • ${escapeHtml(pulang.by)}` : ''}
                </span>
                <button class="btn btn-danger" style="padding:2px 8px;font-size:10px;min-height:28px;" onclick="resetTeacherAttendance('${escapeHtml(teacher.id)}','pulang')" title="Reset absen pulang">↺</button>
              ` : `
                <button class="btn btn-warning" style="padding:4px 10px;font-size:11px;min-height:30px;" ${!datang ? 'disabled title="Harus absen datang dulu"' : ''} onclick="absenManualGuru('${escapeHtml(teacher.id)}','pulang')">🌇 Absen Pulang</button>
              `}
              <button class="btn btn-edit" style="padding:2px 10px;font-size:11px;min-height:30px;" onclick="editGuru('${escapeHtml(teacher.id)}')">✏️</button>
              <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;min-height:30px;" onclick="deleteGuru('${escapeHtml(teacher.id)}')">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // Riwayat Absen Saya - khusus untuk guru melihat riwayat absen QR
    // mandiri milik AKUN SENDIRI (read-only, tidak bisa lihat/ubah guru lain).
    async function loadRiwayatAbsenSaya() {
      const container = document.getElementById('riwayatAbsenSayaList');
      if (!container) return;
      if (!currentUser?.teacher_id) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">Akun Anda belum terhubung ke Data Guru. Hubungi admin untuk mengaktifkan riwayat absen.</div>`;
        return;
      }
      const monthInput = document.getElementById('riwayatAbsenBulan');
      if (monthInput && !monthInput.value) monthInput.value = getMonth();
      const bulan = (monthInput?.value) || getMonth();
      container.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">Memuat data...</div>`;
      try {
        const snap = await db.ref('teacher_attendance')
          .orderByKey().startAt(`${bulan}-01`).endAt(`${bulan}-31`)
          .once('value');
        const data = snap.val() || {};
        const rows = Object.keys(data).sort().reverse()
          .map(tgl => ({ tgl, rec: data[tgl][currentUser.teacher_id] }))
          .filter(r => r.rec);

        if (rows.length === 0) {
          container.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">Belum ada riwayat absen di bulan ini.</div>`;
          return;
        }

        container.innerHTML = `
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="text-align:left;border-bottom:2px solid #e5e7eb;">
                <th style="padding:8px;">Tanggal</th><th style="padding:8px;">Datang</th><th style="padding:8px;">Pulang</th><th style="padding:8px;">Metode</th>
              </tr></thead>
              <tbody>
                ${rows.map(({ tgl, rec }) => `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:8px;">${formatDate(tgl)}</td>
                    <td style="padding:8px;">${rec.datang ? `✅ ${formatTime(rec.datang.timestamp)}` : '—'}</td>
                    <td style="padding:8px;">${rec.pulang ? `✅ ${formatTime(rec.pulang.timestamp)}` : '—'}</td>
                    <td style="padding:8px;">${escapeHtml(rec.datang?.metode || rec.pulang?.metode || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (error) {
        console.error('Error load riwayat absen saya:', error);
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#dc2626;">Gagal memuat riwayat. Coba refresh.</div>`;
      }
    }

    async function buatAkunLoginGuru(teacherId) {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat membuat akun login!', 'warning'); return; }
      const teacher = allTeachers.find(t => t.id === teacherId);
      if (!teacher) return;
      const pin = prompt(`Buat akun login untuk ${teacher.nama}.\nMasukkan PIN 4-6 digit (pilih sendiri, jangan pakai PIN yang mudah ditebak seperti 123456):`, '');
      if (pin === null) return;
      if (!validatePIN(pin)) { showToast('PIN harus 4-6 digit angka!', 'error'); return; }
      try {
        const { pin_salt, pin_hash } = await buatPinHashBaru(pin);
        await db.ref('users').push({
          nama: sanitizeInput(teacher.nama), pin_salt, pin_hash, role: 'guru', teacher_id: teacherId,
          guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity(`Membuat akun login untuk guru: ${teacher.nama}`);
        showToast(`✅ Akun login untuk ${teacher.nama} berhasil dibuat! Sampaikan PIN-nya langsung ke yang bersangkutan (PIN tidak disimpan lagi di aplikasi setelah ini).`, 'success');
        loadUsersForLogin();
        loadTeacherAttendance();
      } catch (error) { console.error('Error creating guru login account:', error); showToast('❌ Gagal membuat akun login', 'error'); }
    }

    function filterTeacherAttendance() {
      currentFilterStatus = document.getElementById('filterStatusGuru').value;
      currentSearchGuru = document.getElementById('searchGuru').value;
      renderTeacherAttendance();
    }

    async function absenManualGuru(teacherId = null, tipe = 'datang') {
      if (!requireStaffRole('mengabsen guru secara manual')) return;
      try {
        const today = getToday();
        const tanggal = document.getElementById('filterTanggalGuru').value || today;
        if (teacherId) {
          const teachersSnap1 = await db.ref(`teachers/${teacherId}`).once('value');
          const namaGuru = teachersSnap1.val()?.nama || teacherId;

          // Aturan: absen Pulang WAJIB sudah absen Datang dulu hari ini.
          // Dicek di sini juga (bukan cuma disable tombol di UI) supaya tidak
          // bisa dilewati.
          if (tipe === 'pulang') {
            const datangSnap = await db.ref(`teacher_attendance/${tanggal}/${teacherId}/datang`).once('value');
            if (!datangSnap.val()) {
              showToast(`⚠️ ${namaGuru} belum absen Datang hari ini — tidak bisa absen Pulang dulu`, 'warning');
              return;
            }
          }

          // Transaction: pastikan tidak bisa absen dobel walau tombol diklik cepat berkali-kali.
          let result;
          try {
            result = await db.ref(`teacher_attendance/${tanggal}/${teacherId}/${tipe}`).transaction(current => {
              if (current) return; // sudah ada -> batalkan, jangan ditimpa
              return {
                status: 'hadir', metode: 'manual', timestamp: firebase.database.ServerValue.TIMESTAMP,
                by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
              };
            });
          } catch (txError) {
            // Kemungkinan besar sedang offline - transaction butuh koneksi live
            // untuk cek nilai terkini, jadi tidak bisa dijalankan offline.
            // Simpan ke antrian supaya tidak hilang, walau tanpa jaminan anti-dobel
            // sampai tersinkron (risiko kecil & wajar untuk aksi manual admin).
            await writeWithOfflineFallback(`teacher_attendance/${tanggal}/${teacherId}/${tipe}`, {
              status: 'hadir', metode: 'manual', timestamp: firebase.database.ServerValue.TIMESTAMP,
              by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
            }, `Absen ${tipe} guru: ${namaGuru}`);
            return;
          }
          if (result.committed) {
            logActivity(`Absen manual ${tipe} guru: ${namaGuru} (${tanggal})`);
            showToast(`✅ ${namaGuru} berhasil diabsen ${tipe}!`, 'success');
          } else {
            showToast(`ℹ️ ${namaGuru} sudah absen ${tipe} hari ini`, 'info');
          }
        } else {
          const teachersSnap = await db.ref('teachers').once('value');
          const teachers = teachersSnap.val() || {};
          const attendanceSnap = await db.ref(`teacher_attendance/${tanggal}`).once('value');
          const attendance = attendanceSnap.val() || {};
          let count = 0;
          for (const [id] of Object.entries(teachers)) {
            if (!attendance[id]?.datang) {
              const result = await db.ref(`teacher_attendance/${tanggal}/${id}/datang`).transaction(current => {
                if (current) return;
                return {
                  status: 'hadir', metode: 'manual', timestamp: firebase.database.ServerValue.TIMESTAMP,
                  by: currentUser?.nama || 'Sistem', by_role: currentRole || '-', guruKey: currentUser?.id || null
                };
              });
              if (result.committed) count++;
            }
          }
          logActivity(`Absen manual datang semua guru (${count} guru, tanggal ${tanggal})`);
          showToast(`✅ ${count} guru berhasil diabsen datang!`, 'success');
        }
        loadTeacherAttendance();
      } catch (error) {
        console.error('Error absen manual:', error);
        showToast('❌ Gagal absen guru', 'error');
      }
    }

    async function resetTeacherAttendance(teacherId, tipe = 'datang') {
      if (!requireStaffRole('mereset absen guru')) return;
      if (!confirm(`Yakin ingin mereset absen ${tipe} guru ini?`)) return;
      try {
        const today = getToday();
        const tanggal = document.getElementById('filterTanggalGuru').value || today;
        const teachersSnap = await db.ref(`teachers/${teacherId}`).once('value');
        const namaGuru = teachersSnap.val()?.nama || teacherId;
        await db.ref(`teacher_attendance/${tanggal}/${teacherId}/${tipe}`).remove();
        logActivity(`Mereset absen ${tipe} guru: ${namaGuru} (${tanggal})`);
        showToast(`🔄 Absen ${tipe} guru direset!`, 'success');
        loadTeacherAttendance();
      } catch (error) { console.error('Error resetting teacher attendance:', error); showToast('❌ Gagal mereset absen guru', 'error'); }
    }

    // ============================================================
    // ABSEN GURU VIA QR (khusus Admin, dengan validasi lokasi)
    // ============================================================
    // Pintasan dari Dashboard: langsung ke halaman Absen Guru lalu buka
    // modal QR-nya, tanpa perlu klik dua kali (halaman dulu, baru tombol QR).
    function openQRFromDashboard() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mencetak/menampilkan QR Absen!', 'warning'); return; }
      showPage('teacher-attendance');
      showQRAbsenGuru();
    }

    async function showQRAbsenGuru() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mencetak/menampilkan QR Absen!', 'warning'); return; }
      const isLocalFile = window.location.protocol === 'file:';
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'qrAbsenGuruModal';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:400px;text-align:center;">
          <h3 style="margin-bottom:4px;">📱 QR Absen Guru</h3>
          <p style="font-size:12px;color:#6b7280;margin-bottom:16px;">QR ini <strong>permanen</strong> — cukup dibuat 1 kali, cetak, lalu tempel di sekolah. Tidak perlu dibuat ulang tiap hari. Guru scan pakai kamera HP masing-masing, lalu <strong>login dengan PIN akun sendiri</strong> — absen otomatis tercatat untuk akun yang login itu saja (tidak bisa pilih nama guru lain).</p>
          ${isLocalFile ? `
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin-bottom:12px;text-align:left;">
              <p style="font-size:12px;color:#991b1b;font-weight:600;margin-bottom:4px;">⚠️ Aplikasi ini dibuka dari file lokal</p>
              <p style="font-size:11px;color:#991b1b;">QR absen TIDAK akan bisa dipakai guru karena HP guru tidak bisa membuka file di komputer/HP Anda. Upload aplikasi ini ke hosting/web server (alamat https://...) terlebih dahulu supaya bisa diakses dari HP guru manapun. <strong>Tombol "Buat QR Baru" dinonaktifkan di sini</strong> supaya tidak sengaja menimpa QR yang sedang aktif di versi hosting (keduanya berbagi database yang sama).</p>
            </div>
          ` : ''}
          <div id="qrGuruCanvas" style="display:flex;justify-content:center;align-items:center;margin-bottom:12px;min-height:220px;color:#9ca3af;font-size:13px;">Memuat QR...</div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button class="btn btn-success" style="flex:1;" onclick="cetakQRGuru()">🖨️ Cetak</button>
            <button class="btn btn-soft" id="btnBuatQRBaru" style="flex:1;" ${isLocalFile ? 'disabled title="Nonaktif: sedang dibuka dari file lokal, akan menimpa database production"' : ''} onclick="if(confirm('QR lama akan tidak berlaku lagi dan harus dicetak ulang. Yakin buat QR baru?')) generateGuruQRToken(true)">🔄 Buat QR Baru</button>
          </div>
          <p style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Gunakan "Buat QR Baru" hanya kalau QR lama bocor/disalahgunakan — ini akan membatalkan QR yang sudah dicetak sebelumnya.</p>
          <hr style="margin:16px 0;border-color:#e5e7eb;">
          <div style="text-align:left;">
            <p style="font-size:12px;font-weight:600;margin-bottom:6px;">📍 Lokasi Sekolah (opsional — untuk validasi jarak absen)</p>
            <div id="lokasiSekolahInfo" style="font-size:12px;color:#6b7280;margin-bottom:8px;">Memuat...</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="number" class="field" id="radiusSekolah" placeholder="Radius (meter)" style="padding:6px 10px;" value="150">
              <button class="btn btn-soft" style="white-space:nowrap;" onclick="setLokasiSekolah()">📍 Gunakan Lokasi Ini</button>
            </div>
            <p style="font-size:11px;color:#9ca3af;margin-top:4px;">Berdiri di area sekolah lalu klik tombol di atas untuk mengunci titik lokasi & radius yang diizinkan. <strong>Selama belum diatur, guru tetap bisa absen QR tanpa validasi jarak.</strong></p>
          </div>
          <button class="btn btn-danger" style="width:100%;margin-top:16px;" onclick="closeQRAbsenGuru()">Tutup</button>
        </div>
      `;
      document.body.appendChild(modal);
      loadLokasiSekolahInfo();
      loadOrGenerateGuruQR();
    }

    // QR bersifat PERMANEN (1 token tetap, tidak terikat tanggal) — supaya
    // admin tidak perlu generate & cetak ulang tiap hari. Tanggal absen selalu
    // ditentukan otomatis dari waktu HP guru saat scan (WIB), bukan dari QR-nya.
    async function loadOrGenerateGuruQR() {
      try {
        const snap = await db.ref('qr_sessions/guru/permanent').once('value');
        const existing = snap.val();
        if (existing && existing.token) {
          renderGuruQRCanvas(existing.token);
        } else {
          await generateGuruQRToken(false);
        }
      } catch (error) {
        console.error('Error loading QR guru:', error);
        showToast('❌ Gagal memuat QR absen', 'error');
      }
    }

    function renderGuruQRCanvas(token) {
      const url = `${window.location.origin}${window.location.pathname}?checkin=guru&token=${token}`;
      const canvas = document.getElementById('qrGuruCanvas');
      if (canvas) {
        canvas.innerHTML = '';
        canvas.style.color = '';
        new QRCode(canvas, { text: url, width: 220, height: 220, colorDark: '#0f3b2c', colorLight: '#ffffff' });
      }
    }

    // Guard supaya generateGuruQRToken tidak bisa jalan dobel bersamaan
    // (mis. klik ganda / tap dobel di HP saat koneksi lambat). Kalau dua
    // proses generate jalan bersamaan, QR yang TAMPIL di layar (hasil render
    // terakhir) bisa beda dengan token yang benar-benar TERSIMPAN di server
    // (hasil write terakhir) -> QR yang baru dibuat langsung "tidak valid"
    // saat di-scan. Lock ini mencegah itu.
    let __isGeneratingGuruQR = false;

    async function generateGuruQRToken(isRegenerate) {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat membuat QR Absen!', 'warning'); return; }
      if (window.location.protocol === 'file:') {
        showToast('❌ Tidak bisa buat QR dari file lokal — ini akan menimpa QR yang aktif di versi hosting. Buka lewat https://... dulu.', 'error');
        return;
      }
      if (__isGeneratingGuruQR) { showToast('⏳ Sedang memproses, tunggu sebentar...', 'info'); return; }
      __isGeneratingGuruQR = true;
      const btn = document.getElementById('btnBuatQRBaru');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Memproses...'; }

      try {
        const token = 'qr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        // Coba tulis + verifikasi baca-ulang dari server (bukan dari cache
        // lokal) sampai benar-benar match. Ini menutup celah kalau tulisan
        // pertama belum sempat tersimpan sempurna saat langsung dibaca lagi.
        let tersimpan = false;
        let percobaan = 0;
        const MAKS_PERCOBAAN = 3;
        while (!tersimpan && percobaan < MAKS_PERCOBAAN) {
          percobaan++;
          await db.ref('qr_sessions/guru/permanent').set({
            token, created_at: firebase.database.ServerValue.TIMESTAMP, created_by: currentUser?.nama || 'admin'
          });
          // baca ulang langsung dari server untuk verifikasi (bukan asumsi)
          const verifikasiSnap = await db.ref('qr_sessions/guru/permanent/token').once('value');
          if (verifikasiSnap.val() === token) {
            tersimpan = true;
          } else if (percobaan < MAKS_PERCOBAAN) {
            console.warn(`[QR Guru] Verifikasi gagal (percobaan ${percobaan}), token di server:`, verifikasiSnap.val(), '- token seharusnya:', token, '- mencoba lagi...');
            await new Promise(r => setTimeout(r, 500));
          }
        }

        if (!tersimpan) {
          showToast('❌ Gagal memastikan QR tersimpan di server, coba lagi (cek koneksi internet)', 'error');
          return;
        }

        renderGuruQRCanvas(token);
        logActivity(isRegenerate ? 'Membuat ulang QR Absen Guru (QR lama tidak berlaku lagi)' : 'Membuat QR Absen Guru permanen');
        showToast(isRegenerate ? '✅ QR baru dibuat & terverifikasi, cetak & tempel yang baru!' : '✅ QR Absen siap — cukup dicetak 1 kali!', 'success');
      } catch (error) {
        console.error('Error generating QR guru token:', error);
        showToast('❌ Gagal membuat QR absen', 'error');
      } finally {
        __isGeneratingGuruQR = false;
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Buat QR Baru'; }
      }
    }

    function getQRDataUrl(container) {
      const img = container.querySelector('img');
      if (img && img.src) return img.src;
      const canvasEl = container.querySelector('canvas');
      if (canvasEl) return canvasEl.toDataURL('image/png');
      return null;
    }

    function cetakQRGuru() {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mencetak QR Absen!', 'warning'); return; }
      const canvas = document.getElementById('qrGuruCanvas');
      const dataUrl = canvas ? getQRDataUrl(canvas) : null;
      if (!dataUrl) { showToast('QR belum siap, tunggu sebentar lalu coba lagi!', 'warning'); return; }
      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Cetak QR Absen Guru</title>
        <style>
          body { font-family:'Inter',sans-serif; text-align:center; padding:40px; }
          h2 { margin-bottom:4px; } p { color:#555; margin-top:0; }
          img { margin-top:20px; width:280px; height:280px; }
          @media print { body { padding:10px; } }
        </style></head><body>
          <h2>QR Absen Guru</h2>
          <p>SI MAMBA - RA Mambaul Ulum &bull; Berlaku permanen (tidak perlu dicetak ulang tiap hari)</p>
          <img src="${dataUrl}">
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    function closeQRAbsenGuru() {
      const modal = document.getElementById('qrAbsenGuruModal');
      if (modal) modal.remove();
    }

    // ------------------------------------------------------------
    // Lokasi sekolah (dipakai untuk validasi jarak saat absen QR)
    // ------------------------------------------------------------
    async function loadLokasiSekolahInfo(infoElId = 'lokasiSekolahInfo', radiusElId = 'radiusSekolah', latElId = null, lngElId = null) {
      const el = document.getElementById(infoElId);
      if (!el) return;
      try {
        const snap = await db.ref('settings/lokasi_sekolah').once('value');
        const lokasi = snap.val();
        if (lokasi && lokasi.lat && lokasi.lng) {
          const sumberTxt = lokasi.sumber === 'manual' ? ' (input manual)' : (lokasi.accuracy ? ` — akurasi GPS saat disimpan: ±${Math.round(lokasi.accuracy)}m${lokasi.accuracy > 100 ? ' ⚠️ (kurang akurat, sebaiknya ulangi di luar ruangan pakai HP)' : ''}` : '');
          el.textContent = `✅ Lokasi tersimpan: ${lokasi.lat.toFixed(5)}, ${lokasi.lng.toFixed(5)} (radius ${lokasi.radius || 150}m) — validasi jarak AKTIF${sumberTxt}`;
          const radiusInput = document.getElementById(radiusElId);
          if (radiusInput) radiusInput.value = lokasi.radius || 150;
          const latInput = latElId && document.getElementById(latElId);
          if (latInput) latInput.value = lokasi.lat;
          const lngInput = lngElId && document.getElementById(lngElId);
          if (lngInput) lngInput.value = lokasi.lng;
        } else {
          el.textContent = 'ℹ️ Lokasi belum diatur — guru tetap bisa absen QR tanpa validasi jarak (opsional).';
        }
      } catch (error) {
        console.error('Error loading lokasi sekolah:', error);
        el.textContent = 'Gagal memuat lokasi.';
      }
    }

    // Simpan lokasi sekolah dari input Latitude/Longitude manual (mis. disalin
    // dari Google Maps) - lebih akurat & lebih pasti daripada deteksi GPS
    // otomatis, terutama kalau perangkat yang dipakai tidak punya chip GPS asli.
    function simpanLokasiManual(latElId, lngElId, radiusElId, infoElId) {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mengatur lokasi sekolah!', 'warning'); return; }
      const lat = parseFloat(document.getElementById(latElId)?.value);
      const lng = parseFloat(document.getElementById(lngElId)?.value);
      const radius = parseInt(document.getElementById(radiusElId)?.value, 10) || 150;
      if (isNaN(lat) || isNaN(lng)) { showToast('⚠️ Isi Latitude dan Longitude dulu (angka desimal, mis. -7.12345)', 'warning'); return; }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) { showToast('⚠️ Nilai Latitude/Longitude di luar rentang wajar, cek lagi angkanya', 'warning'); return; }
      db.ref('settings/lokasi_sekolah').set({
        lat, lng, radius, sumber: 'manual',
        updated_at: firebase.database.ServerValue.TIMESTAMP, updated_by: currentUser?.nama || 'admin'
      }).then(() => {
        showToast('✅ Lokasi sekolah berhasil disimpan (input manual)!', 'success');
        loadLokasiSekolahInfo(infoElId, radiusElId, latElId, lngElId);
      }).catch((error) => {
        console.error('Error saving lokasi sekolah manual:', error);
        showToast('❌ Gagal menyimpan lokasi', 'error');
      });
    }

    function setLokasiSekolah(radiusElId = 'radiusSekolah', infoElId = 'lokasiSekolahInfo', latElId = null, lngElId = null) {
      if (currentRole !== 'admin') { showToast('⚠️ Hanya Admin yang dapat mengatur lokasi sekolah!', 'warning'); return; }
      if (!navigator.geolocation) { showToast('❌ Perangkat/browser ini tidak mendukung deteksi lokasi', 'error'); return; }
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        showToast('❌ Tidak bisa deteksi GPS akurat lewat alamat http:// biasa (jaringan lokal). Buka lewat https://rasimamba.netlify.app dulu, baru atur lokasi di sana.', 'error');
        return;
      }
      const radius = parseInt(document.getElementById(radiusElId)?.value, 10) || 150;
      showToast('📍 Mendeteksi lokasi saat ini... gunakan HP (bukan laptop) untuk hasil akurat!', 'info');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const accuracy = pos.coords.accuracy;
          // Akurasi sangat buruk (khas hasil tebakan dari IP/WiFi, bukan GPS
          // asli - biasanya terjadi kalau diklik dari laptop/komputer tanpa
          // chip GPS) -> TOLAK simpan sama sekali, jangan sampai nyimpen
          // titik yang salah total.
          if (accuracy > 500) {
            showToast(`❌ Akurasi lokasi sangat buruk (±${Math.round(accuracy)}m) — sepertinya bukan GPS asli (laptop/komputer tidak punya GPS). Lokasi TIDAK disimpan. Coba lagi pakai HP di luar ruangan.`, 'error');
            return;
          }
          await db.ref('settings/lokasi_sekolah').set({
            lat: pos.coords.latitude, lng: pos.coords.longitude, radius, accuracy, sumber: 'gps',
            updated_at: firebase.database.ServerValue.TIMESTAMP, updated_by: currentUser?.nama || 'admin'
          });
          if (accuracy > 100) {
            showToast(`⚠️ Lokasi disimpan, tapi akurasi GPS rendah (±${Math.round(accuracy)}m). Sebaiknya coba lagi di luar ruangan/dekat jendela untuk sinyal GPS lebih baik.`, 'warning');
          } else {
            showToast(`✅ Lokasi sekolah berhasil disimpan! (akurasi ±${Math.round(accuracy)}m)`, 'success');
          }
          loadLokasiSekolahInfo(infoElId, radiusElId, latElId, lngElId);
        } catch (error) {
          console.error('Error saving lokasi sekolah:', error);
          showToast('❌ Gagal menyimpan lokasi', 'error');
        }
      }, (error) => {
        console.error('Geolocation error:', error);
        showToast('❌ Gagal mendeteksi lokasi: ' + (error.message || 'izin lokasi ditolak'), 'error');
      }, { enableHighAccuracy: true, timeout: 10000 });
    }

    function hitungJarakMeter(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const toRad = deg => deg * Math.PI / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // ------------------------------------------------------------
    // Layar check-in yang dibuka guru lewat scan QR (tanpa login)
    // ------------------------------------------------------------
    function getCheckinParams() {
      const params = new URLSearchParams(window.location.search);
      return { mode: params.get('checkin'), token: params.get('token') };
    }

    // Absen Guru MANDIRI - dipakai dari 2 pintu masuk:
    //  (a) overlay QR (?checkin=guru&token=...) - guru scan QR, login, lalu tampil di sini
    //  (b) pintasan di Dashboard ("📱 Absen QR Hari Ini") - guru SUDAH login normal
    //      lewat form login biasa, tinggal klik tombol di dashboard-nya sendiri.
    // Token QR hanya divalidasi kalau memang dibuka lewat link/scan QR (ada
    // ?token= di URL). Kalau dibuka dari pintasan dashboard, token tidak perlu
    // karena identitas sudah pasti dari proses login PIN yang baru saja terjadi.
    async function initAbsenMandiri(boxId, tokenOverride) {
      window.__absenMandiriBoxId = boxId;
      const box = document.getElementById(boxId);
      if (!box) return;
      const token = tokenOverride || getCheckinParams().token;
      const isOverlayMode = boxId === 'qrCheckinBox';
      const tanggalPakai = getToday(); // selalu tanggal HARI INI (WIB), bukan tanggal QR dibuat

      if (!currentUser) {
        box.innerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;">Sesi login tidak ditemukan. Silakan login ulang.</div>`;
        return;
      }

      try {
        const [sessionSnap, teacherSnap, attendanceSnap] = await Promise.all([
          db.ref('qr_sessions/guru/permanent').once('value'),
          currentUser.teacher_id ? db.ref(`teachers/${currentUser.teacher_id}`).once('value') : Promise.resolve(null),
          db.ref(`teacher_attendance/${tanggalPakai}`).once('value')
        ]);

        if (token) {
          const session = sessionSnap.val();
          if (!session || session.token !== token) {
            console.warn('[QR Guru] Token tidak cocok — dari QR:', token, '| di server:', session ? session.token : '(kosong)');
            box.innerHTML = `<div style="text-align:center;padding:10px;">
              <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
              <h3 style="font-weight:700;margin-bottom:8px;">QR Tidak Valid</h3>
              <p style="color:#6b7280;font-size:13px;margin-bottom:${isOverlayMode ? '0' : '14px'};">QR ini sudah tidak berlaku (mungkin sudah diganti dengan yang baru). Minta admin cetak ulang QR absen, lalu scan kembali.</p>
              ${isOverlayMode ? '' : `<button class="btn btn-primary" style="width:100%;" onclick="startAbsenQRScan()">🔄 Scan Ulang</button>`}
            </div>`;
            return;
          }
        }
        // Simpan token yang sudah tervalidasi ini supaya submitQRCheckin() nanti
        // memakai token yang SAMA (bukan baca ulang dari URL, yang kosong untuk
        // alur scan kamera dalam-app / "📱 Absen QR").
        window.__qrCheckinToken = token;

        if (!currentUser.teacher_id || !teacherSnap || !teacherSnap.exists()) {
          box.innerHTML = `
            <div style="text-align:center;padding:10px;">
              <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
              <h3 style="font-weight:700;margin-bottom:8px;">Akun Belum Terhubung ke Data Guru</h3>
              <p style="color:#6b7280;font-size:13px;">Akun <strong>${escapeHtml(currentUser.nama || '-')}</strong> belum dikaitkan ke Data Guru, jadi belum bisa absen mandiri. Hubungi admin untuk menghubungkan akun ini (menu Manajemen User).</p>
            </div>`;
          return;
        }

        window.__qrCheckinTanggal = tanggalPakai;
        window.__qrCheckinTeacher = { id: currentUser.teacher_id, ...teacherSnap.val() };
        window.__qrCheckinAttendance = attendanceSnap.val() || {};
        renderAbsenMandiriCard();
      } catch (error) {
        console.error('Error init absen mandiri:', error);
        box.innerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;">Gagal memuat data. Periksa koneksi internet lalu coba lagi.</div>`;
      }
    }

    // Wrapper untuk pintu masuk (a): overlay QR penuh layar (scan pakai
    // aplikasi Kamera bawaan HP -> browser terbuka dengan link berisi token).
    async function initQRCheckinScreen() {
      document.getElementById('qrCheckinOverlay').style.display = 'block';
      await initAbsenMandiri('qrCheckinBox');
    }

    // Wrapper untuk pintu masuk (b): pintasan di Dashboard. Dashboard HANYA
    // pintasan untuk membuka scanner - absen sesungguhnya tetap wajib lewat
    // scan QR fisik yang ditempel di sekolah pakai kamera HP (di dalam app).
    function showAbsenMandiriModal() {
      if (!currentUser?.teacher_id) {
        showToast('⚠️ Akun Anda belum terhubung ke Data Guru. Hubungi admin.', 'warning');
        return;
      }
      const modal = document.createElement('div');
      modal.className = 'modal-overlay show';
      modal.id = 'absenMandiriModal';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:380px;">
          <div id="absenMandiriModalBox"></div>
          <button class="btn btn-soft" style="width:100%;margin-top:12px;" onclick="closeAbsenMandiriModal()">Tutup</button>
        </div>
      `;
      document.body.appendChild(modal);
      startAbsenQRScan();
    }

    function closeAbsenMandiriModal() {
      stopAbsenQRScan();
      const modal = document.getElementById('absenMandiriModal');
      if (modal) modal.remove();
      if (currentPage === 'dashboard') loadDashboard();
    }

    // ------------------------------------------------------------
    // SCAN QR PAKAI KAMERA HP (untuk pintasan Absen QR di Dashboard)
    // ------------------------------------------------------------
    let __absenScanStream = null;
    let __absenScanRAF = null;

    async function startAbsenQRScan() {
      const box = document.getElementById('absenMandiriModalBox');
      if (!box) return;
      stopAbsenQRScan(); // pastikan tidak ada kamera lain yang masih nyala
      box.innerHTML = `
        <h3 style="font-weight:700;text-align:center;margin-bottom:4px;">📷 Scan QR Absen</h3>
        <p style="font-size:12px;color:#6b7280;text-align:center;margin-bottom:12px;">Arahkan kamera HP ke QR Absen yang ditempel di sekolah</p>
        <div style="position:relative;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:1/1;">
          <video id="absenScanVideo" style="width:100%;height:100%;object-fit:cover;display:block;" playsinline autoplay muted></video>
          <div style="position:absolute;inset:12%;border:3px solid #a7f3d0;border-radius:12px;pointer-events:none;"></div>
        </div>
        <div id="absenScanStatus" style="font-size:12px;color:#6b7280;margin-top:10px;text-align:center;">Meminta izin kamera...</div>
      `;
      const video = document.getElementById('absenScanVideo');
      const statusEl = document.getElementById('absenScanStatus');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusEl.outerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;font-size:13px;">❌ Browser ini tidak mendukung akses kamera, atau halaman tidak dibuka lewat HTTPS/localhost.</div>`;
        return;
      }

      try {
        __absenScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = __absenScanStream;
        await video.play();

        if (typeof window.jsQR !== 'function') {
          // Library pembaca QR gagal dimuat (mis. CDN diblokir jaringan) - kamera
          // sudah nyala tapi tidak akan pernah ada QR yang terdeteksi kalau
          // dibiarkan diam-diam. Tunggu sebentar siapa tahu masih proses load,
          // baru tampilkan error kalau memang benar-benar tidak tersedia.
          await new Promise(r => setTimeout(r, 1500));
          if (typeof window.jsQR !== 'function') {
            stopAbsenQRScan();
            const el = document.getElementById('absenScanStatus');
            if (el) el.outerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;font-size:13px;">❌ Komponen pembaca QR gagal dimuat (kemungkinan koneksi internet/CDN diblokir jaringan). Coba refresh halaman, atau ganti jaringan internet lalu coba lagi.</div>`;
            return;
          }
        }

        if (statusEl) statusEl.textContent = '🔎 Mencari QR... tahan HP dengan stabil';

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const tick = () => {
          if (!__absenScanStream) return; // sudah dihentikan (modal ditutup dsb)
          if (video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height) : null;
            if (code && code.data) { handleAbsenQRScanned(code.data); return; }
          }
          __absenScanRAF = requestAnimationFrame(tick);
        };
        __absenScanRAF = requestAnimationFrame(tick);
      } catch (err) {
        console.error('Gagal akses kamera:', err);
        const msg = err && err.name === 'NotAllowedError'
          ? '❌ Izin kamera ditolak. Aktifkan izin kamera untuk browser ini di pengaturan HP, lalu coba lagi.'
          : '❌ Tidak bisa mengakses kamera HP.';
        const el = document.getElementById('absenScanStatus');
        if (el) el.outerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;font-size:13px;">${msg}</div>`;
      }
    }

    function stopAbsenQRScan() {
      if (__absenScanRAF) cancelAnimationFrame(__absenScanRAF);
      __absenScanRAF = null;
      if (__absenScanStream) {
        __absenScanStream.getTracks().forEach(t => t.stop());
        __absenScanStream = null;
      }
    }

    function handleAbsenQRScanned(rawText) {
      stopAbsenQRScan();
      let token = null;
      try {
        const url = new URL(rawText, window.location.origin);
        token = url.searchParams.get('token');
      } catch (e) { /* bukan URL yang valid */ }

      if (!token) {
        const box = document.getElementById('absenMandiriModalBox');
        if (box) box.innerHTML = `
          <div style="text-align:center;padding:16px;">
            <div style="font-size:40px;">⚠️</div>
            <h3 style="font-weight:700;margin:8px 0;">QR Tidak Dikenali</h3>
            <p style="font-size:12px;color:#6b7280;margin-bottom:12px;">Ini bukan QR Absen Guru SI MAMBA. Pastikan Anda scan QR resmi yang ditempel sekolah.</p>
            <button class="btn btn-primary" style="width:100%;" onclick="startAbsenQRScan()">🔄 Scan Ulang</button>
          </div>`;
        return;
      }
      initAbsenMandiri('absenMandiriModalBox', token);
    }

    function renderAbsenMandiriCard() {
      const box = document.getElementById(window.__absenMandiriBoxId || 'qrCheckinBox');
      if (!box) return;
      const teacher = window.__qrCheckinTeacher || {};
      const attendance = window.__qrCheckinAttendance || {};
      const rec = attendance[teacher.id] || {};
      const datang = rec.datang;
      const pulang = rec.pulang;
      const inisial = (teacher.nama || '?').trim().charAt(0).toUpperCase();
      const isOverlayMode = window.__absenMandiriBoxId === 'qrCheckinBox';

      // Sistem otomatis menentukan jenis absen berikutnya — guru tidak perlu
      // pilih sendiri: belum absen Datang hari ini -> ini pasti absen Datang;
      // sudah Datang tapi belum Pulang -> ini pasti absen Pulang; kalau
      // keduanya sudah ada, tidak ada lagi yang perlu diabsen hari ini.
      let tombolHtml;
      if (!datang) {
        tombolHtml = `<button class="btn btn-primary" style="width:100%;" onclick="submitQRCheckin('datang')">🌅 Absen Datang Sekarang</button>`;
      } else if (!pulang) {
        tombolHtml = `<button class="btn btn-warning" style="width:100%;" onclick="submitQRCheckin('pulang')">🌇 Absen Pulang Sekarang</button>`;
      } else {
        tombolHtml = `<div style="text-align:center;padding:10px 0;color:#059669;font-size:13px;font-weight:600;">✅ Absen hari ini sudah lengkap</div>`;
      }

      const infoDatang = datang
        ? `<p style="font-size:12px;color:#059669;margin-top:6px;">✅ Datang ${formatTime(datang.timestamp)}${datang.telat ? ` <span style="color:#dc2626;font-weight:600;">(Telat ${datang.telatMenit || ''} menit)</span>` : ''}</p>` : '';
      const infoPulang = pulang
        ? `<p style="font-size:12px;color:#059669;">✅ Pulang ${formatTime(pulang.timestamp)}${pulang.pulang_awal ? ` <span style="color:#d97706;font-weight:600;">(Pulang Awal)</span>` : ''}</p>` : '';

      box.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <div style="width:56px;height:56px;border-radius:50%;background:#0f3b2c;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;margin:0 auto 10px;">${escapeHtml(inisial)}</div>
          <h3 style="font-weight:700;">👋 ${escapeHtml(teacher.nama || '-')}</h3>
          <p style="font-size:12px;color:#6b7280;">Absen untuk tanggal ${formatDate(window.__qrCheckinTanggal)}</p>
          ${infoDatang}${infoPulang}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${tombolHtml}
        </div>
        ${isOverlayMode ? `<button class="btn btn-soft" style="width:100%;margin-top:16px;font-size:12px;" onclick="logoutFromQRCheckin()">🚪 Bukan ${escapeHtml(teacher.nama || 'Anda')}? Keluar &amp; ganti akun</button>` : ''}
      `;
    }

    // Bantuan: bungkus geolocation callback jadi Promise supaya bisa dipanggil
    // kondisional (hanya kalau admin memang sudah mengaktifkan validasi lokasi).
    function getCurrentPositionPromise(options) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          err => reject(err),
          options || { enableHighAccuracy: true, timeout: 15000 }
        );
      });
    }

    async function submitQRCheckin(tipe) {
      const token = window.__qrCheckinToken;
      const tanggal = window.__qrCheckinTanggal;
      const box = document.getElementById(window.__absenMandiriBoxId || 'qrCheckinBox');
      const teacher = window.__qrCheckinTeacher;
      const teacherId = teacher?.id;
      const tipeLabel = tipe === 'pulang' ? 'Pulang' : 'Datang';

      if (!currentUser || !teacherId) {
        showToast('❌ Sesi login tidak valid, silakan scan ulang QR', 'error');
        return;
      }

      box.innerHTML = `<div style="text-align:center;padding:30px;"><div class="loading-spinner" style="width:36px;height:36px;border-width:4px;margin:0 auto;"></div><p style="margin-top:12px;color:#6b7280;font-size:13px;">Memproses absen...</p></div>`;

      try {
        const [sessionSnap, lokasiSnap] = await Promise.all([
          db.ref('qr_sessions/guru/permanent').once('value'),
          db.ref('settings/lokasi_sekolah').once('value')
        ]);
        const session = sessionSnap.val();
        if (!session || session.token !== token) {
          box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">⚠️</div><h3 style="font-weight:700;">QR Tidak Valid</h3><p style="color:#6b7280;font-size:13px;">QR ini sudah tidak berlaku. Minta admin cetak ulang QR, lalu scan kembali.</p></div>`;
          return;
        }

        const lokasi = lokasiSnap.val();
        const lokasiWajib = !!(lokasi && lokasi.lat && lokasi.lng);
        let posCoords = null;

        if (lokasiWajib) {
          // Admin SUDAH mengaktifkan validasi lokasi -> lokasi HP wajib & jarak divalidasi.
          if (!navigator.geolocation) {
            box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">📍</div><h3 style="font-weight:700;">Lokasi Tidak Tersedia</h3><p style="color:#6b7280;font-size:13px;">Admin mengaktifkan validasi lokasi, tapi browser/perangkat ini tidak mendukung deteksi lokasi. Gunakan browser lain atau pakai Absen Manual.</p></div>`;
            return;
          }
          try {
            posCoords = await getCurrentPositionPromise();
          } catch (geoErr) {
            console.error('Geolocation error at checkin:', geoErr);
            box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">📍</div><h3 style="font-weight:700;">Izin Lokasi Diperlukan</h3><p style="color:#6b7280;font-size:13px;">Aktifkan izin lokasi di HP Anda lalu scan ulang QR untuk absen.</p></div>`;
            return;
          }
          const jarak = hitungJarakMeter(posCoords.lat, posCoords.lng, lokasi.lat, lokasi.lng);
          if (jarak > (lokasi.radius || 150)) {
            box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">📍</div><h3 style="font-weight:700;">Di Luar Area Sekolah</h3><p style="color:#6b7280;font-size:13px;">Anda berjarak sekitar ${Math.round(jarak)} meter dari sekolah. Absen hanya bisa dilakukan di area sekolah.</p></div>`;
            return;
          }
        } else if (navigator.geolocation) {
          // Admin BELUM mengatur lokasi sekolah -> absen tetap diizinkan (tidak diblokir).
          // Lokasi HP tetap dicoba dicatat kalau tersedia, hanya sebagai catatan, bukan syarat.
          try { posCoords = await getCurrentPositionPromise({ enableHighAccuracy: false, timeout: 5000 }); }
          catch (e) { /* lokasi tidak tersedia/ditolak - lanjutkan tanpa lokasi, tidak masalah */ }
        }

        if (tipe === 'pulang') {
          const datangSnap = await db.ref(`teacher_attendance/${tanggal}/${teacherId}/datang`).once('value');
          if (!datangSnap.val()) {
            box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">⚠️</div><h3 style="font-weight:700;">Belum Absen Datang</h3><p style="color:#6b7280;font-size:13px;">Absen datang dulu sebelum absen pulang.</p></div>`;
            return;
          }
        }

        // Tentukan otomatis Telat (kalau absen Datang lewat jam masuk) atau
        // Pulang Awal (kalau absen Pulang sebelum jam pulang standar) — guru
        // tidak perlu pilih/isi apa pun, sistem yang membaca dari jam HP saat ini.
        const menitSekarang = getMenitSekarangWIB();
        const isTelat = tipe === 'datang' && menitSekarang > JAM_MASUK_BATAS_MENIT;
        const telatMenit = isTelat ? (menitSekarang - JAM_MASUK_BATAS_MENIT) : 0;
        const isPulangAwal = tipe === 'pulang' && menitSekarang < JAM_PULANG_BATAS_MENIT;

        // Transaction: cegah absen dobel walau tombol di-tap berkali-kali/koneksi lambat.
        const result = await db.ref(`teacher_attendance/${tanggal}/${teacherId}/${tipe}`).transaction(current => {
          if (current) return; // sudah tercatat -> batalkan
          const record = {
            status: isTelat ? 'telat' : 'hadir', metode: 'qr', timestamp: firebase.database.ServerValue.TIMESTAMP,
            by: currentUser?.nama || teacher?.nama || teacherId, by_role: 'guru (self check-in QR - login)', guruKey: currentUser?.id || null
          };
          if (tipe === 'datang' && isTelat) record.telatMenit = telatMenit;
          if (tipe === 'pulang' && isPulangAwal) record.pulang_awal = true;
          if (posCoords) record.lokasi = posCoords;
          return record;
        });

        if (!result.committed) {
          const existing = result.snapshot.val();
          box.innerHTML = `<div style="text-align:center;padding:10px;"><div style="font-size:48px;">ℹ️</div><h3 style="font-weight:700;">${escapeHtml(teacher?.nama || '')} sudah absen ${tipeLabel}</h3><p style="color:#6b7280;font-size:13px;">Pukul ${formatTime(existing?.timestamp)}</p></div>`;
          return;
        }

        try {
          await db.ref('logs').push({
            action: `Absen QR mandiri (${tipeLabel}): ${teacher?.nama || teacherId} (${tanggal})`,
            user: currentUser?.nama || teacher?.nama || teacherId, role: 'guru (self check-in QR - login)',
            guruKey: currentUser?.id || null,
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
        } catch (logErr) { console.error('Gagal mencatat log QR checkin:', logErr); }

        // Perbarui state lokal & tampilkan sukses, lalu balik ke layar absen
        // (supaya kalau guru buka lagi nanti untuk absen Pulang, tombolnya
        // sudah sesuai tanpa perlu scan ulang QR dari awal).
        window.__qrCheckinAttendance = window.__qrCheckinAttendance || {};
        window.__qrCheckinAttendance[teacherId] = {
          ...(window.__qrCheckinAttendance[teacherId] || {}),
          [tipe]: {
            timestamp: Date.now(),
            ...(tipe === 'datang' && isTelat ? { telat: true, telatMenit } : {}),
            ...(tipe === 'pulang' && isPulangAwal ? { pulang_awal: true } : {})
          }
        };

        const keteranganStatus = tipe === 'datang' && isTelat
          ? `<p style="color:#dc2626;font-size:13px;font-weight:600;margin-top:4px;">⏰ Telat ${telatMenit} menit</p>`
          : tipe === 'pulang' && isPulangAwal
          ? `<p style="color:#d97706;font-size:13px;font-weight:600;margin-top:4px;">⏰ Pulang Awal</p>`
          : '';
        box.innerHTML = `<div style="text-align:center;padding:14px;"><div style="font-size:56px;">✅</div><h3 style="font-weight:700;margin-top:8px;">Absen ${tipeLabel} Berhasil!</h3><p style="margin-top:4px;">${escapeHtml(teacher?.nama || '')}</p>${keteranganStatus}<p style="color:#6b7280;font-size:13px;margin-top:4px;">Terima kasih, selamat bertugas 🙏</p></div>`;
        setTimeout(renderAbsenMandiriCard, 1500);
      } catch (error) {
        console.error('Error submit QR checkin:', error);
        box.innerHTML = `<div style="text-align:center;padding:10px;color:#dc2626;">Gagal menyimpan absen. Coba scan ulang QR.</div>`;
      }
    }

