    // ============================================================
    // 7 KEBIASAAN ANAK INDONESIA HEBAT (7KAIH) - PAUD/RA
    // Acuan: Panduan 7KAIH PAUD (Kemendikdasmen). Pencatatan harian per anak,
    // rekap bulanan & semester, status "Sudah terbiasa" bila >= 2/3 dari hari yang dicatat.
    // Data disimpan di settings/kebiasaan/{idSiswa}/{YYYY-MM}/{tanggal} = angka bit:
    //   bit 0..6 = 7 kebiasaan (1 = dilakukan), bit 7 (128) = "hari ini sudah dicatat".
    // (Memakai node 'settings' yang sudah ada di Rules, jadi TIDAK perlu mengubah Rules.)
    // ============================================================
    const KEBIASAAN_7 = [
      { ikon: '🌅', nama: 'Bangun Pagi', pendek: 'Bangun' },
      { ikon: '🕌', nama: 'Beribadah', pendek: 'Ibadah' },
      { ikon: '🏃', nama: 'Berolahraga', pendek: 'Olahraga' },
      { ikon: '🥗', nama: 'Makan Sehat dan Bergizi', pendek: 'Makan' },
      { ikon: '📚', nama: 'Gemar Belajar', pendek: 'Belajar' },
      { ikon: '🤝', nama: 'Bermasyarakat', pendek: 'Sosial' },
      { ikon: '😴', nama: 'Tidur Cepat', pendek: 'Tidur' }
    ];
    const KB_NODE = 'settings/kebiasaan';
    const KB_BIT_CATAT = 128;
    const KB_AMBANG = 2 / 3;
    let kbSiswa = {};      // {id: {nama, kelas}}
    let kbData = {};       // settings/kebiasaan (seluruhnya)
    let kbTab = 'harian';
    let kbHasilRekap = null;
    let kbSudahPasangEvent = false;

    function kbKelasTersedia(myKelas) { return (myKelas && myKelas.length) ? myKelas : (typeof KELAS_LIST !== 'undefined' ? KELAS_LIST : []); }

    async function loadKebiasaan() {
      showLoading(true, 'Memuat 7 Kebiasaan...');
      try {
        const myKelas = await getMyKelasDiampu();
        const [sSnap, dSnap] = await Promise.all([db.ref('students').once('value'), db.ref(KB_NODE).once('value')]);
        let siswa = sSnap.val() || {};
        if (myKelas) siswa = Object.fromEntries(Object.entries(siswa).filter(([, s]) => myKelas.includes(s.kelas)));
        kbSiswa = siswa;
        kbData = dSnap.val() || {};
        const kelasOpsi = kbKelasTersedia(myKelas).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join('');
        ['kbKelas', 'kbRekapKelas'].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const lama = el.value;
          el.innerHTML = (myKelas ? '' : '<option value="">Semua Kelas</option>') + kelasOpsi;
          if (lama) el.value = lama;
        });
        const tgl = document.getElementById('kbTanggal');
        if (tgl && !tgl.value) tgl.value = getToday();
        const bln = document.getElementById('kbRekapBulan');
        if (bln && !bln.value) bln.value = getToday().slice(0, 7);
        kbPasangEvent();
        kbGantiTab(kbTab);
      } catch (e) {
        console.error('Error memuat 7 kebiasaan:', e);
        showToast('❌ Gagal memuat data 7 Kebiasaan', 'error');
      }
      showLoading(false);
    }

    function kbPasangEvent() {
      if (kbSudahPasangEvent) return;
      kbSudahPasangEvent = true;
      document.getElementById('kbHarianList')?.addEventListener('click', e => {
        const chip = e.target.closest('.kb-chip');
        if (chip) kbToggle(chip.dataset.sid, parseInt(chip.dataset.i, 10));
      });
      document.getElementById('kbSemuaBar')?.addEventListener('click', e => {
        const b = e.target.closest('[data-all]');
        if (b) kbToggleSemua(parseInt(b.dataset.all, 10));
      });
    }

    function kbGantiTab(tab) {
      kbTab = tab;
      document.getElementById('kbPanelHarian').style.display = tab === 'harian' ? 'block' : 'none';
      document.getElementById('kbPanelRekap').style.display = tab === 'rekap' ? 'block' : 'none';
      document.getElementById('kbTabHarian').classList.toggle('btn-primary', tab === 'harian');
      document.getElementById('kbTabHarian').classList.toggle('btn-soft', tab !== 'harian');
      document.getElementById('kbTabRekap').classList.toggle('btn-primary', tab === 'rekap');
      document.getElementById('kbTabRekap').classList.toggle('btn-soft', tab !== 'rekap');
      if (tab === 'harian') kbRenderHarian(); else kbHitungRekap();
    }

    function kbKunci() {
      const t = document.getElementById('kbTanggal')?.value || getToday();
      return { ym: t.slice(0, 7), d: String(parseInt(t.slice(8, 10), 10)) };
    }
    function kbNilai(sid, ym, d) { return kbData?.[sid]?.[ym]?.[d]; }

    function kbDaftarSiswa(kelas, cari) {
      const q = (cari || '').trim().toLowerCase();
      return Object.entries(kbSiswa)
        .filter(([, s]) => !kelas || s.kelas === kelas)
        .filter(([, s]) => !q || (s.nama || '').toLowerCase().includes(q))
        .sort((a, b) => (a[1].nama || '').localeCompare(b[1].nama || '', 'id'));
    }

    function kbRenderHarian() {
      const wadah = document.getElementById('kbHarianList');
      if (!wadah) return;
      const kelas = document.getElementById('kbKelas')?.value || '';
      const cari = document.getElementById('kbCari')?.value || '';
      const { ym, d } = kbKunci();
      const daftar = kbDaftarSiswa(kelas, cari);
      document.getElementById('kbSemuaBar').innerHTML =
        `<span class="kb-semua-label">Centang semua:</span>` +
        KEBIASAAN_7.map((k, i) => `<button type="button" class="kb-chip kb-semua" data-all="${i}" title="Centang semua anak: ${k.nama}"><span>${k.ikon}</span><small>${k.pendek}</small></button>`).join('');
      if (daftar.length === 0) { wadah.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280;">Tidak ada siswa.</div>'; kbRingkasHarian(daftar, ym, d); return; }
      wadah.innerHTML = daftar.map(([sid, s]) => {
        const v = kbNilai(sid, ym, d);
        const tercatat = v !== undefined && v !== null && (v & KB_BIT_CATAT);
        return `<div class="kb-row ${tercatat ? 'tercatat' : ''}" data-row="${escapeHtml(sid)}">
          <div class="kb-nama"><strong>${escapeHtml(s.nama || '-')}</strong><span>${escapeHtml(s.kelas || '')}${tercatat ? ' • ✔ tercatat' : ''}</span></div>
          <div class="kb-chips">${KEBIASAAN_7.map((k, i) => {
            const on = tercatat && (v & (1 << i));
            return `<button type="button" class="kb-chip ${on ? 'on' : ''}" data-sid="${escapeHtml(sid)}" data-i="${i}" aria-pressed="${on ? 'true' : 'false'}" title="${k.nama}"><span>${k.ikon}</span><small>${k.pendek}</small></button>`;
          }).join('')}</div></div>`;
      }).join('');
      kbRingkasHarian(daftar, ym, d);
    }

    function kbRingkasHarian(daftar, ym, d) {
      const el = document.getElementById('kbRingkasHarian');
      if (!el) return;
      const n = daftar.filter(([sid]) => { const v = kbNilai(sid, ym, d); return v !== undefined && v !== null && (v & KB_BIT_CATAT); }).length;
      el.textContent = `📊 Tercatat hari ini: ${n} dari ${daftar.length} anak`;
    }

    async function kbToggle(sid, i) {
      const { ym, d } = kbKunci();
      const lama = kbNilai(sid, ym, d);
      const mask = (lama !== undefined && lama !== null) ? (lama & 127) : 0;
      const baru = ((mask ^ (1 << i)) | KB_BIT_CATAT);
      kbSet(sid, ym, d, baru);
      kbRenderHarian();
      try { await db.ref(`${KB_NODE}/${sid}/${ym}/${d}`).set(baru); }
      catch (e) {
        console.error('Gagal simpan kebiasaan:', e);
        kbSet(sid, ym, d, lama === undefined ? null : lama);
        kbRenderHarian();
        showToast('❌ Gagal menyimpan. Periksa koneksi internet.', 'error');
      }
    }

    function kbSet(sid, ym, d, nilai) {
      kbData[sid] = kbData[sid] || {};
      kbData[sid][ym] = kbData[sid][ym] || {};
      if (nilai === null || nilai === undefined) delete kbData[sid][ym][d]; else kbData[sid][ym][d] = nilai;
    }

    async function kbToggleSemua(i) {
      const kelas = document.getElementById('kbKelas')?.value || '';
      const cari = document.getElementById('kbCari')?.value || '';
      const { ym, d } = kbKunci();
      const daftar = kbDaftarSiswa(kelas, cari);
      if (daftar.length === 0) return;
      const semuaOn = daftar.every(([sid]) => { const v = kbNilai(sid, ym, d); return v && (v & KB_BIT_CATAT) && (v & (1 << i)); });
      const update = {}, cadangan = {};
      daftar.forEach(([sid]) => {
        const lama = kbNilai(sid, ym, d);
        cadangan[sid] = lama;
        const mask = (lama !== undefined && lama !== null) ? (lama & 127) : 0;
        const baru = (semuaOn ? (mask & ~(1 << i)) : (mask | (1 << i))) | KB_BIT_CATAT;
        kbSet(sid, ym, d, baru);
        update[`${sid}/${ym}/${d}`] = baru;
      });
      kbRenderHarian();
      try { await db.ref(KB_NODE).update(update); showToast(`${semuaOn ? '↩️ Dibatalkan' : '✅ Dicentang'}: ${KEBIASAAN_7[i].nama} (${daftar.length} anak)`, 'success'); }
      catch (e) {
        console.error('Gagal simpan massal kebiasaan:', e);
        daftar.forEach(([sid]) => kbSet(sid, ym, d, cadangan[sid] === undefined ? null : cadangan[sid]));
        kbRenderHarian();
        showToast('❌ Gagal menyimpan. Periksa koneksi internet.', 'error');
      }
    }

    // ---------------- REKAP ----------------
    function kbDaftarBulan() {
      const mode = document.getElementById('kbRekapMode')?.value || 'bulan';
      const bln = document.getElementById('kbRekapBulan')?.value || getToday().slice(0, 7);
      if (mode === 'bulan') return { bulan: [bln], label: new Date(`${bln}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) };
      const ta = (document.getElementById('tahunAjaranSelect')?.value || '').match(/^(\d{4})\/(\d{4})$/);
      const y1 = ta ? parseInt(ta[1], 10) : new Date().getFullYear();
      const y2 = ta ? parseInt(ta[2], 10) : y1 + 1;
      if (mode === 'smt1') return { bulan: ['07', '08', '09', '10', '11', '12'].map(m => `${y1}-${m}`), label: `Semester 1 (Ganjil) ${y1}/${y2}` };
      return { bulan: ['01', '02', '03', '04', '05', '06'].map(m => `${y2}-${m}`), label: `Semester 2 (Genap) ${y1}/${y2}` };
    }

    function kbHitungSiswa(sid, bulanList) {
      let n = 0; const c = [0, 0, 0, 0, 0, 0, 0];
      bulanList.forEach(ym => {
        const hari = kbData?.[sid]?.[ym] || {};
        Object.values(hari).forEach(v => {
          if (!(v & KB_BIT_CATAT)) return;
          n++;
          for (let i = 0; i < 7; i++) if (v & (1 << i)) c[i]++;
        });
      });
      return { n, c, terbiasa: c.map(x => n > 0 && (x / n) >= KB_AMBANG - 1e-9) };
    }

    function kbHitungRekap() {
      const kelas = document.getElementById('kbRekapKelas')?.value || '';
      const { bulan, label } = kbDaftarBulan();
      const mode = document.getElementById('kbRekapMode')?.value || 'bulan';
      const wb = document.getElementById('kbRekapBulanWrap'); if (wb) wb.style.display = mode === 'bulan' ? '' : 'none';
      const daftar = kbDaftarSiswa(kelas, '');
      const baris = daftar.map(([sid, s]) => ({ sid, nama: s.nama || '-', kelas: s.kelas || '', ...kbHitungSiswa(sid, bulan) }));
      kbHasilRekap = { baris, label, kelas };
      const el = document.getElementById('kbRekapHasil');
      if (!el) return;
      if (baris.length === 0) { el.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280;">Tidak ada siswa.</div>'; return; }
      el.innerHTML = `<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">${escapeHtml(label)}${kelas ? ' • Kelas ' + escapeHtml(kelas) : ''} • Angka = jumlah hari kebiasaan dilakukan dari hari yang dicatat. <span class="kb-hijau">Hijau</span> = sudah terbiasa (≥ 2/3).</div>
        <div style="overflow-x:auto;"><table class="kb-tabel"><thead><tr><th style="text-align:left;">Nama</th><th>Hari</th>${KEBIASAAN_7.map(k => `<th title="${k.nama}">${k.ikon}</th>`).join('')}<th>Terbiasa</th></tr></thead><tbody>
        ${baris.map(r => `<tr><td style="text-align:left;">${escapeHtml(r.nama)}</td><td>${r.n}</td>${r.c.map((x, i) => `<td class="${r.n === 0 ? '' : (r.terbiasa[i] ? 'kb-hijau' : 'kb-merah')}">${r.n === 0 ? '-' : x}</td>`).join('')}<td><strong>${r.terbiasa.filter(Boolean).length}/7</strong></td></tr>`).join('')}
        </tbody></table></div>`;
    }

    function kbCetakRekapPDF() {
      if (!kbHasilRekap || kbHasilRekap.baris.length === 0) { showToast('⚠️ Tidak ada data untuk dicetak', 'warning'); return; }
      try {
        const { baris, label, kelas } = kbHasilRekap;
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pw = doc.internal.pageSize.getWidth(), mx = 12;
        const namaSekolah = window.__profilSekolah?.nama || 'RA Mambaul Ulum';
        doc.setFont(undefined, 'bold'); doc.setFontSize(14); doc.text(namaSekolah.toUpperCase(), pw / 2, 14, { align: 'center' });
        doc.setFontSize(11); doc.text('REKAP 7 KEBIASAAN ANAK INDONESIA HEBAT', pw / 2, 20, { align: 'center' });
        doc.setFont(undefined, 'normal'); doc.setFontSize(10);
        doc.text(`${label}${kelas ? '  |  Kelas ' + kelas : ''}`, pw / 2, 25, { align: 'center' });
        doc.setLineWidth(0.4); doc.line(mx, 28, pw - mx, 28);
        const head = [['No', 'Nama', 'Hari\nTercatat', ...KEBIASAAN_7.map(k => k.nama), 'Sudah\nTerbiasa']];
        const body = baris.map((r, i) => [i + 1, r.nama, r.n, ...r.c.map(x => r.n === 0 ? '-' : `${x} (${Math.round(x / r.n * 100)}%)`), `${r.terbiasa.filter(Boolean).length} dari 7`]);
        doc.autoTable({
          startY: 32, margin: { left: mx, right: mx }, head, body, theme: 'grid',
          styles: { fontSize: 8, cellPadding: 1.8, valign: 'middle', halign: 'center', lineColor: [120, 120, 120], lineWidth: 0.2 },
          headStyles: { fillColor: [15, 59, 44], textColor: 255, fontSize: 7.5 },
          columnStyles: { 0: { cellWidth: 8 }, 1: { halign: 'left', cellWidth: 44 } },
          didParseCell: d => {
            if (d.section === 'body' && d.column.index >= 3 && d.column.index <= 9) {
              const r = baris[d.row.index];
              if (r.n > 0) d.cell.styles.fillColor = r.terbiasa[d.column.index - 3] ? [220, 252, 231] : [254, 226, 226];
            }
          }
        });
        let y = doc.lastAutoTable.finalY + 5;
        const ph = doc.internal.pageSize.getHeight();
        if (y + 40 > ph - 6) { doc.addPage(); y = 20; }
        doc.setFontSize(8); doc.setTextColor(90, 90, 90);
        doc.text('Keterangan: "Sudah terbiasa" bila anak melakukan kebiasaan pada minimal 2/3 dari hari yang dicatat (mengacu Panduan 7KAIH PAUD). Hijau = sudah terbiasa, merah = belum terbiasa.', mx, y);
        doc.setTextColor(0, 0, 0); doc.setFontSize(10);
        y += 8;
        const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const kolR = pw - mx - 70;
        doc.text(`Tanggal: ${tgl}`, kolR, y); y += 4.5;
        doc.text('Mengetahui,', mx + 10, y); doc.text('Guru Kelas,', kolR, y); y += 4;
        doc.text('Kepala Madrasah', mx + 10, y); y += 17;
        doc.text('( ______________________ )', mx + 10, y); doc.text('( ______________________ )', kolR, y);
        doc.save(`Rekap_7Kebiasaan_${label.replace(/[^A-Za-z0-9]+/g, '_')}${kelas ? '_' + kelas : ''}.pdf`);
        showToast('✅ Rekap 7 Kebiasaan berhasil dibuat!', 'success');
      } catch (e) {
        console.error('Error cetak rekap kebiasaan:', e);
        showToast('❌ Gagal membuat PDF: ' + e.message, 'error');
      }
    }
