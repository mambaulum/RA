    // HONOR
    async function loadHonor() {
      try {
        const periode = document.getElementById('honorPeriode');
        if (periode && !periode.value) periode.value = getMonth();
        const [teachersSnap, settingSnap, potonganSnap, bonusSnap] = await Promise.all([
          db.ref('teachers').once('value'), db.ref('settings/honor_default_harian').once('value'),
          db.ref('settings/honor_potongan').once('value'), db.ref('settings/honor_bonus_terajin').once('value')
        ]);
        const teachers = teachersSnap.val() || {};
        const select = document.getElementById('honorGuru');
        if (select) {
          select.innerHTML = '<option value="">Semua Guru</option>' +
            Object.entries(teachers).map(([id, t]) =>
              `<option value="${escapeHtml(id)}">${escapeHtml(t.nama || '-')}</option>`
            ).join('');
        }
        const defaultInput = document.getElementById('honorDefaultHarian');
        if (defaultInput) defaultInput.value = settingSnap.val() || 50000;
        const potongan = potonganSnap.val() || {};
        const telatInput = document.getElementById('honorPotonganTelat');
        if (telatInput) telatInput.value = potongan.telat || 0;
        const pulangAwalInput = document.getElementById('honorPotonganPulangAwal');
        if (pulangAwalInput) pulangAwalInput.value = potongan.pulang_awal || 0;
        const bonusInput = document.getElementById('honorBonusTerajin');
        if (bonusInput) bonusInput.value = bonusSnap.val() || 0;
      } catch (error) { console.error('Error loading honor:', error); }
    }

    async function saveHonorDefault() {
      const nominal = parseInt(document.getElementById('honorDefaultHarian')?.value, 10);
      if (isNaN(nominal) || nominal < 0) { showToast('Isi nominal honor default yang valid!', 'warning'); return; }
      try {
        await db.ref('settings/honor_default_harian').set(nominal);
        logActivity(`Mengubah honor per hari default menjadi Rp ${nominal.toLocaleString('id-ID')}`);
        showToast('✅ Honor default berhasil disimpan!', 'success');
      } catch (error) { console.error('Error saving honor default:', error); showToast('❌ Gagal menyimpan honor default', 'error'); }
    }

    async function saveHonorPotongan() {
      const telat = parseInt(document.getElementById('honorPotonganTelat')?.value, 10) || 0;
      const pulangAwal = parseInt(document.getElementById('honorPotonganPulangAwal')?.value, 10) || 0;
      if (telat < 0 || pulangAwal < 0) { showToast('Nominal potongan tidak boleh minus!', 'warning'); return; }
      try {
        await db.ref('settings/honor_potongan').set({ telat, pulang_awal: pulangAwal });
        logActivity(`Mengubah potongan honor: Telat Rp ${telat.toLocaleString('id-ID')}/hari, Pulang Awal Rp ${pulangAwal.toLocaleString('id-ID')}/hari`);
        showToast('✅ Aturan potongan honor berhasil disimpan!', 'success');
      } catch (error) { console.error('Error saving honor potongan:', error); showToast('❌ Gagal menyimpan potongan honor', 'error'); }
    }

    async function saveHonorBonusTerajin() {
      const nominal = parseInt(document.getElementById('honorBonusTerajin')?.value, 10) || 0;
      if (nominal < 0) { showToast('Nominal bonus tidak boleh minus!', 'warning'); return; }
      try {
        await db.ref('settings/honor_bonus_terajin').set(nominal);
        logActivity(`Mengubah bonus Guru Terajin menjadi Rp ${nominal.toLocaleString('id-ID')}/bulan`);
        showToast('✅ Bonus Guru Terajin berhasil disimpan!', 'success');
      } catch (error) { console.error('Error saving honor bonus terajin:', error); showToast('❌ Gagal menyimpan bonus', 'error'); }
    }

    async function hitungHonor() {
      const periode = document.getElementById('honorPeriode').value || getMonth();
      const guruId = document.getElementById('honorGuru').value;
      showLoading(true, 'Menghitung honor...');
      try {
        const [teachersSnap, attendanceSnap, settingSnap, potonganSnap, bonusSnap] = await Promise.all([
          db.ref('teachers').once('value'),
          db.ref('teacher_attendance').orderByKey().startAt(`${periode}-01`).endAt(`${periode}-31`).once('value'), // cuma bulan terpilih
          db.ref('settings/honor_default_harian').once('value'),
          db.ref('settings/honor_potongan').once('value'),
          db.ref('settings/honor_bonus_terajin').once('value')
        ]);
        const teachers = teachersSnap.val() || {};
        const attendance = attendanceSnap.val() || {};
        const honorDefault = settingSnap.val() || 50000;
        const potonganSetting = potonganSnap.val() || {};
        const potonganTelatHarian = potonganSetting.telat || 0;
        const potonganPulangAwalHarian = potonganSetting.pulang_awal || 0;
        const bonusTerajinNominal = bonusSnap.val() || 0;
        const container = document.getElementById('honorResult');
        if (!container) { showLoading(false); return; }
        const monthAttendance = {};
        for (const [date, records] of Object.entries(attendance)) {
          if (date.startsWith(periode)) monthAttendance[date] = records;
        }
        const tercatat = Object.keys(monthAttendance).length;

        // Hitung data lengkap (hadir/telat/pulangAwal/persen) untuk SEMUA guru
        // dulu (bukan cuma yang difilter) supaya penentuan Guru Terajin tetap
        // adil berdasarkan seluruh guru, baru difilter untuk ditampilkan.
        const semuaData = {};
        for (const [id, teacher] of Object.entries(teachers)) {
          let hadir = 0, telat = 0, pulangAwal = 0;
          for (const [date, records] of Object.entries(monthAttendance)) {
            if (records[id]?.datang) { hadir++; if (records[id].datang.telat) telat++; }
            if (records[id]?.pulang?.pulang_awal) pulangAwal++;
          }
          const persen = tercatat > 0 ? (hadir / tercatat) * 100 : 0;
          // Honor bulanan tetap (mis. Kepala): tidak dihitung dari daftar hadir
          const bulanan = parseInt(teacher.honor_bulanan, 10) > 0 ? parseInt(teacher.honor_bulanan, 10) : 0;
          const kepala = teacher.jabatan === 'kepala';
          semuaData[id] = { nama: teacher.nama || '-', hadir, telat, pulangAwal, persen, bulanan, kepala, tetap: kepala || bulanan > 0 };
        }

        // Tentukan Guru Terajin: % kehadiran tertinggi; kalau seri, yang
        // jumlah hari hadirnya lebih banyak menang; kalau masih seri, urut nama.
        let terajinId = null;
        if (bonusTerajinNominal > 0 && tercatat > 0) {
          const kandidat = Object.entries(semuaData).filter(([, d]) => d.hadir > 0 && !d.tetap); // honor bulanan tetap tidak ikut Guru Terajin
          if (kandidat.length > 0) {
            kandidat.sort((a, b) => b[1].persen - a[1].persen || b[1].hadir - a[1].hadir || a[1].nama.localeCompare(b[1].nama));
            terajinId = kandidat[0][0];
          }
        }

        const entries = Object.entries(teachers).filter(([id]) => !guruId || id === guruId);
        if (entries.length === 0) {
          container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Tidak ada data guru</div>';
          showLoading(false); return;
        }
        const adaPotongan = potonganTelatHarian > 0 || potonganPulangAwalHarian > 0;
        const adaBonus = bonusTerajinNominal > 0;

        let banner = '';
        if (terajinId) {
          banner = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-bottom:16px;">🏆 <strong>Guru Terajin bulan ini: ${escapeHtml(semuaData[terajinId].nama)}</strong> — ${semuaData[terajinId].persen.toFixed(0)}% kehadiran, dapat bonus Rp ${bonusTerajinNominal.toLocaleString('id-ID')}</div>`;
        } else if (adaBonus) {
          banner = `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:16px;color:#6b7280;font-size:13px;">Belum ada data kehadiran cukup di periode ini untuk menentukan Guru Terajin.</div>`;
        }

        let html = banner + `<div style="overflow-x:auto;"><table><thead><tr><th>No</th><th>Nama Guru</th><th>Mapel</th><th>Hadir</th><th>Honor/Hari</th><th>Honor Kotor</th>${adaPotongan ? '<th>Telat</th><th>Pulang Awal</th><th>Potongan</th>' : ''}${adaBonus ? '<th>Bonus 🏆</th>' : ''}<th>Honor Bersih</th><th>Aksi</th></tr></thead><tbody>`;
        let no = 1, grandTotalKotor = 0, grandTotalPotongan = 0, grandTotalBonus = 0, grandTotalBersih = 0;
        const dataUntukSlip = [];
        for (const [id, teacher] of entries) {
          const d = semuaData[id];
          const tetap = d.tetap;
          const honorPerHari = tetap ? 0 : (teacher.honor_harian ? parseInt(teacher.honor_harian) : honorDefault);
          const totalKotor = tetap ? d.bulanan : d.hadir * honorPerHari;
          const potongan = tetap ? 0 : (d.telat * potonganTelatHarian) + (d.pulangAwal * potonganPulangAwalHarian);
          const bonus = (!tetap && id === terajinId) ? bonusTerajinNominal : 0;
          const totalBersih = Math.max(0, totalKotor - potongan) + bonus;
          grandTotalKotor += totalKotor; grandTotalPotongan += potongan; grandTotalBonus += bonus; grandTotalBersih += totalBersih;
          dataUntukSlip.push({
            id, hp: teacher.no_hp || '', nama: teacher.nama || '-', mapel: teacher.mapel || '-', nip: teacher.nip || '-', kepala: d.kepala,
            hadir: d.hadir, honorPerHari, totalKotor, telat: d.telat, pulangAwal: d.pulangAwal,
            potonganTelatHarian, potonganPulangAwalHarian, potongan, isTerajin: id === terajinId, bonus, totalBersih, tetap
          });
          html += `<tr${id === terajinId ? ' style="background:#f0fdf4;"' : ''}><td>${no++}</td><td>${escapeHtml(teacher.nama||'-')}${id === terajinId ? ' 🏆' : ''}${d.kepala ? ' 👑' : ''}</td><td>${escapeHtml(teacher.mapel||'-')}</td><td>${tetap ? '<span style="color:#9ca3af;">—</span>' : d.hadir}</td><td>${tetap ? '<span style="font-size:11px;background:#e0f2fe;color:#075985;padding:2px 8px;border-radius:10px;">Bulanan tetap</span>' + (d.bulanan > 0 ? '' : ' <span style="font-size:10px;color:#dc2626;">belum ditetapkan</span>') : 'Rp ' + honorPerHari.toLocaleString('id-ID') + (!teacher.honor_harian ? ' <span style="font-size:10px;color:#9ca3af;">(default)</span>' : '')}</td><td>Rp ${totalKotor.toLocaleString('id-ID')}</td>`;
          if (adaPotongan && tetap) {
            html += '<td>—</td><td>—</td><td>—</td>';
          } else if (adaPotongan) {
            html += `<td style="${d.telat > 0 ? 'color:#dc2626;' : ''}">${d.telat}</td><td style="${d.pulangAwal > 0 ? 'color:#d97706;' : ''}">${d.pulangAwal}</td><td style="color:#dc2626;">${potongan > 0 ? '-Rp ' + potongan.toLocaleString('id-ID') : '-'}</td>`;
          }
          if (adaBonus) {
            html += `<td style="color:#059669;">${bonus > 0 ? '+Rp ' + bonus.toLocaleString('id-ID') : '-'}</td>`;
          }
          html += `<td><strong>Rp ${totalBersih.toLocaleString('id-ID')}</strong></td>`;
          html += `<td style="white-space:nowrap;"><button class="btn btn-soft" style="padding:4px 8px;min-height:32px;font-size:12px;" onclick="exportSlipHonorPDF('${escapeJs(id)}','share')" title="Kirim slip lewat WhatsApp">📲</button></td></tr>`;
        }
        const kepalaEntry = Object.values(semuaData).find(d => d.kepala);
        window.__honorData = { periode, rows: dataUntukSlip, adaPotongan, adaBonus, kepalaNama: kepalaEntry ? kepalaEntry.nama : '' };
        const kolomSebelum = 6 + (adaPotongan ? 3 : 0) + (adaBonus ? 1 : 0);
        html += `</tbody><tfoot><tr style="font-weight:700;background:#f3f4f6;"><td colspan="${kolomSebelum}" style="text-align:right;">Total:</td><td>Rp ${grandTotalBersih.toLocaleString('id-ID')}</td><td></td></tr></tfoot></table></div>`;
        const catatan = [];
        if (adaPotongan) catatan.push(`Potongan: Rp ${potonganTelatHarian.toLocaleString('id-ID')}/hari telat, Rp ${potonganPulangAwalHarian.toLocaleString('id-ID')}/hari pulang awal`);
        if (adaBonus) catatan.push(`Bonus Terajin: Rp ${bonusTerajinNominal.toLocaleString('id-ID')}`);
        html += `<div style="margin-top:12px;text-align:right;font-size:12px;color:#6b7280;">Periode: ${escapeHtml(periode)}${catatan.length ? ' — ' + catatan.join(' | ') : ''}</div>`;
        container.innerHTML = html;
        showLoading(false);
      } catch (error) {
        console.error('Error calculating honor:', error);
        showToast('Gagal menghitung honor', 'error');
        showLoading(false);
      }
    }

    async function exportSlipHonorPDF(onlyId, mode) {
      if (!window.__honorData || window.__honorData.rows.length === 0) {
        showToast('⚠️ Klik "Hitung Honor" dulu sebelum export slip!', 'warning');
        return;
      }
      showLoading(true, 'Membuat slip honor PDF...');
      try {
        const { periode, rows: semuaRows } = window.__honorData;
        const rows = onlyId ? semuaRows.filter(r => r.id === onlyId) : semuaRows;
        if (rows.length === 0) { showToast('⚠️ Data guru tidak ditemukan', 'warning'); showLoading(false); return; }
        const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginX = 14;

        rows.forEach((r, idx) => {
          if (idx > 0) doc.addPage();
          let y = 16;
          doc.setFontSize(13); doc.setFont(undefined, 'bold');
          doc.text(namaSekolah, pageWidth / 2, y, { align: 'center' }); y += 6;
          doc.setFontSize(11); doc.setFont(undefined, 'normal');
          doc.text('SLIP HONOR GURU', pageWidth / 2, y, { align: 'center' }); y += 5;
          doc.setFontSize(9);
          doc.text(`Periode: ${namaBulan}`, pageWidth / 2, y, { align: 'center' }); y += 3;
          doc.setLineWidth(0.3); doc.line(marginX, y, pageWidth - marginX, y); y += 7;

          doc.setFontSize(10);
          doc.text(`Nama`, marginX, y); doc.text(`: ${r.nama}`, marginX + 22, y); y += 5.5;
          doc.text(`Mapel`, marginX, y); doc.text(`: ${r.mapel}`, marginX + 22, y); y += 5.5;
          if (r.kepala) { doc.text(`Jabatan`, marginX, y); doc.text(`: Kepala Madrasah`, marginX + 22, y); y += 5.5; }
          if (r.nip && r.nip !== '-') { doc.text(`NIP`, marginX, y); doc.text(`: ${r.nip}`, marginX + 22, y); y += 5.5; }
          if (r.isTerajin) { doc.setTextColor(5, 150, 105); doc.text(`🏆 Guru Terajin bulan ini`, marginX, y); doc.setTextColor(0, 0, 0); y += 5.5; }
          y += 3;

          const rincian = r.tetap
            ? [['Honor Bulanan Tetap', `Rp ${r.totalKotor.toLocaleString('id-ID')}`]]
            : [['Hari Hadir', `${r.hadir} hari`], ['Honor per Hari', `Rp ${r.honorPerHari.toLocaleString('id-ID')}`], ['Honor Kotor', `Rp ${r.totalKotor.toLocaleString('id-ID')}`]];
          if (r.telat > 0) rincian.push([`Potongan Telat (${r.telat} hari x Rp ${r.potonganTelatHarian.toLocaleString('id-ID')})`, `-Rp ${(r.telat * r.potonganTelatHarian).toLocaleString('id-ID')}`]);
          if (r.pulangAwal > 0) rincian.push([`Potongan Pulang Awal (${r.pulangAwal} hari x Rp ${r.potonganPulangAwalHarian.toLocaleString('id-ID')})`, `-Rp ${(r.pulangAwal * r.potonganPulangAwalHarian).toLocaleString('id-ID')}`]);
          if (r.bonus > 0) rincian.push(['Bonus Guru Terajin 🏆', `+Rp ${r.bonus.toLocaleString('id-ID')}`]);

          doc.autoTable({
            startY: y, margin: { left: marginX, right: marginX }, tableWidth: pageWidth - marginX * 2,
            head: [], body: rincian, theme: 'plain',
            styles: { fontSize: 9.5, cellPadding: 1.4 },
            columnStyles: { 0: { cellWidth: (pageWidth - marginX * 2) * 0.62 }, 1: { halign: 'right' } }
          });
          y = doc.lastAutoTable.finalY + 3;
          doc.setLineWidth(0.2); doc.line(marginX, y, pageWidth - marginX, y); y += 6;

          doc.setFontSize(11); doc.setFont(undefined, 'bold');
          doc.text('Honor Diterima', marginX, y);
          doc.text(`Rp ${r.totalBersih.toLocaleString('id-ID')}`, pageWidth - marginX, y, { align: 'right' });
          doc.setFont(undefined, 'normal'); y += 16;

          const kolTtd = (pageWidth - marginX * 2) / 2;
          doc.setFontSize(9);
          doc.text('Diserahkan oleh,', marginX, y);
          doc.text('Diterima oleh,', marginX + kolTtd, y);
          y += 16;
          doc.text('( _________________ )', marginX, y);
          doc.text('( _________________ )', marginX + kolTtd, y);
          y += 4;
          doc.setFontSize(8); doc.setTextColor(107, 114, 128);
          doc.text('Bendahara / Admin', marginX, y);
          doc.text(r.nama, marginX + kolTtd, y);
          doc.setTextColor(0, 0, 0);
        });

        if (mode === 'share') {
          const r0 = rows[0];
          await bagikanPDFHonor(doc, `Slip_Honor_${periode}_${(r0.nama || 'guru').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`,
            `Slip honor ${namaBulan} - ${r0.nama}: Rp ${r0.totalBersih.toLocaleString('id-ID')}. Terima kasih. - ${namaSekolah}`, r0.hp);
        } else {
          doc.save(`Slip_Honor_${periode}.pdf`);
          showToast(`✅ Slip honor untuk ${rows.length} guru berhasil dibuat! (1 PDF, ${rows.length} halaman)`, 'success');
        }
      } catch (error) {
        console.error('Error exporting slip honor PDF:', error);
        showToast('❌ Gagal membuat slip honor: ' + error.message, 'error');
      }
      showLoading(false);
    }

    // Bagikan PDF: di HP membuka lembar bagikan (pilih WhatsApp, file PDF ikut terlampir).
    // Kalau perangkat tidak mendukung, PDF diunduh lalu WhatsApp dibuka dengan teks ringkas.
    async function bagikanPDFHonor(doc, namaFile, teks, noHp) {
      const blob = doc.output('blob');
      const file = new File([blob], namaFile, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: teks, title: namaFile });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return; // pengguna menutup lembar bagikan
          console.warn('share gagal, pakai cadangan', e);
        }
      }
      doc.save(namaFile);
      let hp = String(noHp || '').replace(/\D/g, '');
      if (hp.startsWith('0')) hp = '62' + hp.slice(1);
      const url = `https://wa.me/${hp}?text=${encodeURIComponent(teks)}`;
      window.open(url, '_blank', 'noopener');
      showToast('📎 PDF terunduh. Lampirkan file itu di WhatsApp yang terbuka.', 'info');
    }


    // Rekap honor 1 tabel (A4 landscape) dengan kolom Tanda Tangan penerima,
    // untuk bukti serah-terima honor. Data dari hasil "Hitung Honor".
    async function exportRekapHonorPDF(mode) {
      if (!window.__honorData || window.__honorData.rows.length === 0) {
        showToast('⚠️ Klik "Hitung Honor" dulu sebelum export rekap!', 'warning');
        return;
      }
      showLoading(true, 'Membuat rekap honor PDF...');
      try {
        const { periode, rows, adaPotongan, adaBonus, kepalaNama } = window.__honorData;
        const rp = n => 'Rp ' + (n || 0).toLocaleString('id-ID');
        const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
        const mx = 12;

        doc.setFont(undefined, 'bold'); doc.setFontSize(14);
        doc.text(namaSekolah.toUpperCase(), pw / 2, 14, { align: 'center' });
        doc.setFontSize(11);
        doc.text('REKAP HONOR GURU', pw / 2, 20, { align: 'center' });
        doc.setFont(undefined, 'normal'); doc.setFontSize(10);
        doc.text(`Periode: ${namaBulan}`, pw / 2, 25, { align: 'center' });
        doc.setLineWidth(0.4); doc.line(mx, 28, pw - mx, 28);

        const head = ['No', 'Nama Guru', 'Mapel/Jabatan', 'Hadir', 'Honor/Hari', 'Honor Kotor'];
        if (adaPotongan) head.push('Potongan');
        if (adaBonus) head.push('Bonus');
        head.push('Honor Diterima', 'Tanda Tangan');
        const body = rows.map((r, i) => {
          const line = [
            i + 1,
            r.nama,
            r.kepala ? 'Kepala Madrasah' : (r.mapel || '-'),
            r.tetap ? '-' : `${r.hadir} hari`,
            r.tetap ? 'Bulanan tetap' : rp(r.honorPerHari),
            rp(r.totalKotor)
          ];
          if (adaPotongan) line.push(r.potongan > 0 ? '-' + rp(r.potongan) : '-');
          if (adaBonus) line.push(r.bonus > 0 ? '+' + rp(r.bonus) : '-');
          line.push(rp(r.totalBersih), '');
          return line;
        });
        const total = rows.reduce((a, r) => a + r.totalBersih, 0);
        const ttdIdx = head.length - 1, bersihIdx = head.length - 2;
        const foot = new Array(head.length).fill('');
        foot[0] = { content: 'TOTAL', colSpan: bersihIdx, styles: { halign: 'right' } };
        foot[bersihIdx] = rp(total);
        // jsPDF-AutoTable: colSpan menggantikan sel di sebelahnya
        const footRow = [foot[0], foot[bersihIdx], ''];

        const colStyles = { 0: { cellWidth: 10, halign: 'center' }, 3: { halign: 'center' } };
        colStyles[bersihIdx] = { halign: 'right', fontStyle: 'bold' };
        colStyles[ttdIdx] = { cellWidth: 48 };
        for (let c = 4; c < bersihIdx; c++) colStyles[c] = Object.assign({ halign: 'right' }, colStyles[c] || {});

        doc.autoTable({
          startY: 32, margin: { left: mx, right: mx }, head: [head], body, foot: [footRow],
          theme: 'grid', showFoot: 'lastPage',
          styles: { fontSize: 9, cellPadding: 2, valign: 'middle', minCellHeight: 12, lineColor: [120, 120, 120], lineWidth: 0.2 },
          headStyles: { fillColor: [15, 59, 44], textColor: 255, halign: 'center', minCellHeight: 9 },
          footStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', minCellHeight: 9 },
          columnStyles: colStyles,
          // nomor di kolom tanda tangan (ganjil kiri, genap kanan) - gaya daftar hadir
          didDrawCell: (d) => {
            if (d.section === 'body' && d.column.index === ttdIdx) {
              const n = d.row.index + 1;
              doc.setFontSize(8); doc.setTextColor(120, 120, 120);
              const x = n % 2 === 1 ? d.cell.x + 2 : d.cell.x + d.cell.width / 2 + 2;
              doc.text(`${n}.`, x, d.cell.y + 4.5);
              doc.setTextColor(0, 0, 0);
            }
          }
        });

        let y = doc.lastAutoTable.finalY + 6;
        if (y + 32 > ph - 6) { doc.addPage(); y = 20; }
        const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const kolR = pw - mx - 70;
        doc.setFontSize(10);
        doc.text(`Tanggal: ${tgl}`, kolR, y);
        y += 4.5;
        doc.text('Mengetahui,', mx + 10, y);
        doc.text('Bendahara / Admin,', kolR, y);
        y += 4;
        doc.text('Kepala Madrasah', mx + 10, y);
        y += 17;
        doc.text(kepalaNama ? `( ${kepalaNama} )` : '( ______________________ )', mx + 10, y);
        doc.text('( ______________________ )', kolR, y);

        if (mode === 'share') {
          await bagikanPDFHonor(doc, `Rekap_Honor_${periode}.pdf`, `Rekap honor guru ${namaBulan} - ${namaSekolah}. Total: Rp ${total.toLocaleString('id-ID')}.`, '');
        } else {
          doc.save(`Rekap_Honor_${periode}.pdf`);
          showToast('✅ Rekap honor berhasil dibuat!', 'success');
        }
      } catch (error) {
        console.error('Error exporting rekap honor PDF:', error);
        showToast('❌ Gagal membuat rekap honor: ' + error.message, 'error');
      }
      showLoading(false);
    }

    function cetakLaporanInfaq() {
      if (!requireInfaqAccess()) return;
      if (!infaqCache || infaqCache.length === 0) { showToast('Belum ada data untuk dicetak!', 'warning'); return; }
      const periode = infaqCurrentPeriode || getMonth();
      const namaBulan = new Date(`${periode}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';

      // Urut per Kelas lalu Nama supaya enak dibaca & dicocokkan pas rekap manual.
      const rows = [...infaqCache].sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));

      let weekThs = '';
      for (let w = 1; w <= infaqWeeksCount; w++) weekThs += `<th>Mgu ${w}</th>`;

      let grandTotal = 0;
      const baris = rows.map((r, idx) => {
        grandTotal += r.totalSetor;
        const kategoriLabel = r.kategoriInfaq === 'yatim' ? 'Yatim' : r.kategoriInfaq === 'bersaudara' ? 'Bersaudara' : '-';
        const weekTds = r.weekStatus.map(paid => `<td style="text-align:center;">${paid ? '✔' : '-'}</td>`).join('');
        const statusLabel = infaqWeeksCount > 0 && r.weeksPaid >= infaqWeeksCount ? 'Lunas' : `${r.weeksPaid}/${infaqWeeksCount}`;
        return `<tr>
          <td style="text-align:center;">${idx + 1}</td><td>${escapeHtml(r.nama)}</td><td style="text-align:center;">${escapeHtml(r.kelas)}</td><td style="text-align:center;">${kategoriLabel}</td>
          ${weekTds}
          <td style="text-align:right;">Rp ${r.totalSetor.toLocaleString('id-ID')}</td><td style="text-align:center;">${statusLabel}</td>
        </tr>`;
      }).join('');

      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Laporan Infaq - ${namaBulan}</title>
        <style>
          body { font-family:Arial,sans-serif; font-size:12px; padding:24px; color:#111827; }
          h1 { text-align:center; font-size:16px; margin-bottom:2px; }
          h2 { text-align:center; font-size:13px; font-weight:normal; margin-top:0; margin-bottom:20px; color:#374151; }
          table { border-collapse:collapse; width:100%; margin-top:12px; }
          th, td { border:1px solid #9ca3af; padding:5px 6px; font-size:10.5px; }
          th { background:#f3f4f6; text-align:center; }
          tfoot td { font-weight:700; background:#f3f4f6; }
          .ttd { margin-top:50px; display:flex; justify-content:flex-end; }
          .ttd div { text-align:center; width:220px; }
          .ttd .garis { margin-top:60px; border-top:1px solid #111827; padding-top:4px; }
          @media print { body { padding:10px; } }
        </style></head><body>
          <h1>${escapeHtml(namaSekolah)}</h1>
          <h2>Laporan Infaq Siswa — ${namaBulan}</h2>
          <table>
            <thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Kategori</th>${weekThs}<th>Total Setor</th><th>Status</th></tr></thead>
            <tbody>${baris}</tbody>
            <tfoot><tr><td colspan="${4 + infaqWeeksCount}" style="text-align:right;">Total Terkumpul:</td><td colspan="2" style="text-align:right;">Rp ${grandTotal.toLocaleString('id-ID')}</td></tr></tfoot>
          </table>
          <div class="ttd">
            <div>
              <p>Mengetahui,<br>Bendahara / Petugas Infaq</p>
              <p class="garis">(________________________)</p>
            </div>
          </div>
        </body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    // SURAT
    function loadSurat() {
      document.getElementById('suratTanggal').value = getToday();
    }

    // Penomoran surat otomatis: format {nomor urut}/RA-MU/{bulan romawi}/{tahun}.
    // Pakai Firebase transaction supaya nomor tidak pernah dobel walau 2 surat
    // dibuat hampir bersamaan.
    const BULAN_ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

    async function generateNomorSurat() {
      const now = new Date();
      const tahun = now.getFullYear();
      const result = await db.ref(`surat_counter/${tahun}`).transaction(current => (current || 0) + 1);
      const nomorUrut = result.snapshot.val();
      const bulanRomawi = BULAN_ROMAWI[now.getMonth()];
      return `${String(nomorUrut).padStart(3, '0')}/RA-MU/${bulanRomawi}/${tahun}`;
    }

    async function generateSurat() {
      const jenis = document.getElementById('suratJenis').value;
      const nama = document.getElementById('suratNama').value.trim();
      const kelas = document.getElementById('suratKelas').value;
      const tanggal = document.getElementById('suratTanggal').value;
      const keterangan = document.getElementById('suratKeterangan').value.trim();
      if (!nama) { showToast('Masukkan nama siswa!', 'warning'); return; }
      const jenisLabel = { ijin: 'Surat Ijin', sakit: 'Surat Sakit', keterangan: 'Surat Keterangan', dispensasi: 'Surat Dispensasi' };
      const preview = document.getElementById('suratPreview');
      const todayFormatted = formatDate(tanggal || getToday());
      if (!preview) return;

      showLoading(true, 'Membuat nomor surat...');
      try {
        const nomorSurat = await generateNomorSurat();
        preview.innerHTML = `
          <div class="kop-surat">
            <div class="logo-kop">
              <div class="logo-kop-placeholder">📚</div>
              <div>
                <div class="nama-sekolah">RA MAMBAAUL ULUM</div>
                <div class="alamat-sekolah">Jl. Pendidikan No. 123, Kota Pendidikan</div>
              </div>
            </div>
            <div class="judul-surat">${jenisLabel[jenis] || 'Surat Keterangan'}</div>
            <div style="font-size:13px;margin-top:4px;">Nomor: ${escapeHtml(nomorSurat)}</div>
          </div>
          <div style="margin-top:16px;">
            <p>Yang bertanda tangan di bawah ini, Kepala RA Mambaul Ulum, menerangkan bahwa:</p>
            <table style="width:100%;margin:12px 0;border-collapse:collapse;">
              <tr><td style="padding:4px 8px;width:120px;">Nama</td><td style="padding:4px 8px;">: ${escapeHtml(nama)}</td></tr>
              <tr><td style="padding:4px 8px;">Kelas</td><td style="padding:4px 8px;">: ${escapeHtml(kelas)}</td></tr>
              <tr><td style="padding:4px 8px;">Tanggal</td><td style="padding:4px 8px;">: ${todayFormatted}</td></tr>
            </table>
            <p style="margin-top:12px;">${escapeHtml(keterangan || `Telah ${jenis === 'ijin' ? 'mengajukan ijin' : jenis === 'sakit' ? 'sakit' : jenis === 'dispensasi' ? 'mendapat dispensasi' : 'diberikan surat keterangan'} pada tanggal ${todayFormatted}.`)}</p>
            <p style="margin-top:12px;">Demikian surat ini dibuat untuk digunakan sebagaimana mestinya.</p>
          </div>
          <div class="footer"><div style="text-align:center;margin-top:30px;"><p>Kota Pendidikan, ${todayFormatted}</p><p style="margin-top:30px;">Kepala RA Mambaul Ulum</p><p style="margin-top:50px;font-weight:700;text-decoration:underline;">___________________</p></div></div>
        `;

        // Simpan riwayat surat (untuk audit & supaya nomor bisa ditelusuri ulang).
        await db.ref('surat_riwayat').push({
          nomor: nomorSurat, jenis: sanitizeInput(jenis), nama_siswa: sanitizeInput(nama),
          kelas: sanitizeInput(kelas), tanggal: tanggal || getToday(), keterangan: sanitizeInput(keterangan || ''),
          dibuat_oleh: currentUser?.nama || 'Sistem', guruKey: currentUser?.id || null,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        logActivity(`Membuat ${jenisLabel[jenis] || 'surat'} No. ${nomorSurat} untuk ${nama}`);
        showLoading(false);
      } catch (error) {
        console.error('Error generating surat:', error);
        showToast('❌ Gagal membuat nomor surat otomatis', 'error');
        showLoading(false);
      }
    }

    function cetakSurat() {
      const preview = document.getElementById('suratPreview');
      if (!preview || !preview.querySelector('.kop-surat')) {
        showToast('Generate surat dulu sebelum mencetak!', 'warning');
        return;
      }
      const win = window.open('', '_blank');
      if (!win) { showToast('❌ Popup diblokir browser, izinkan popup untuk mencetak', 'error'); return; }
      win.document.write(`
        <!doctype html><html lang="id"><head><meta charset="UTF-8"><title>Cetak Surat</title>
        <style>
          body { font-family:'Times New Roman',serif; font-size:14px; line-height:1.8; padding:30px; }
          .kop-surat { text-align:center; padding:20px 0 10px 0; border-bottom:3px double #1a3a5c; margin-bottom:20px; }
          .kop-surat .logo-kop { display:flex; align-items:center; justify-content:center; gap:20px; margin-bottom:6px; }
          .kop-surat .logo-kop-placeholder { width:60px; height:60px; border-radius:50%; background:#0f3b2c; display:flex; align-items:center; justify-content:center; font-size:28px; color:white; }
          .kop-surat .nama-sekolah { font-size:20px; font-weight:700; color:#1a3a5c; letter-spacing:2px; }
          .kop-surat .judul-surat { font-size:16px; font-weight:700; text-decoration:underline; margin-top:12px; letter-spacing:1px; }
          table { border-collapse:collapse; }
          @media print { body { padding:10px; } }
        </style></head><body>${preview.innerHTML}</body></html>
      `);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }

    // JADWAL
    async function loadJadwal() {
      showLoading(true, 'Memuat jadwal...');
      try {
        const snapshot = await db.ref('jadwal').once('value');
        const data = snapshot.val() || {};
        const container = document.getElementById('jadwalTableBody');
        const entries = Object.entries(data);
        if (!container) { showLoading(false); return; }
        if (entries.length === 0) {
          container.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#6b7280;">Belum ada jadwal</td></tr>';
          showLoading(false); return;
        }
        container.innerHTML = entries.map(([id, val]) => `
          <tr>
            <td>${escapeHtml(val.hari||'-')}</td>
            <td>${escapeHtml(val.kelas||'-')}</td>
            <td>${escapeHtml(val.mapel||'-')}</td>
            <td>${escapeHtml(val.guru||'-')}</td>
            <td class="jadwal-actions">
              <button class="btn btn-danger" style="padding:2px 10px;font-size:11px;" onclick="deleteJadwal('${escapeJs(id)}')">🗑️</button>
            </td>
          </tr>
        `).join('');
        showLoading(false);
      } catch (error) {
        console.error('Error loading jadwal:', error);
        showToast('Gagal memuat jadwal', 'error');
        showLoading(false);
      }
    }

    async function simpanJadwal() {
      const hari = document.getElementById('jadwalHari').value;
      const kelas = document.getElementById('jadwalKelas').value;
      const mapel = document.getElementById('jadwalMapel').value.trim();
      const guru = document.getElementById('jadwalGuru').value.trim();
      if (!mapel) { showToast('Masukkan mata pelajaran!', 'warning'); return; }
      try {
        await db.ref('jadwal').push({
          hari: sanitizeInput(hari), kelas: sanitizeInput(kelas), mapel: sanitizeInput(mapel),
          guru: sanitizeInput(guru || '-'), guruKey: currentUser?.id || null,
          created_at: firebase.database.ServerValue.TIMESTAMP
        });
        showToast('Jadwal berhasil disimpan!', 'success');
        document.getElementById('jadwalMapel').value = '';
        document.getElementById('jadwalGuru').value = '';
        loadJadwal();
      } catch (error) { console.error('Error saving jadwal:', error); showToast('Gagal menyimpan jadwal', 'error'); }
    }

    async function deleteJadwal(id) {
      if (!confirm('Yakin ingin menghapus jadwal ini?')) return;
      try { await db.ref(`jadwal/${id}`).remove(); showToast('Jadwal berhasil dihapus!', 'success'); loadJadwal(); }
      catch (error) { console.error('Error deleting jadwal:', error); showToast('Gagal menghapus jadwal', 'error'); }
    }

