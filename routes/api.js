const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticatedAPI, ensureAdminAPI } = require('../middleware/auth');

// Tahminleri Getir
router.get('/tahminler', async (req, res) => {
    try {
        const { kategori, durum = 'aktif', limit = 20, offset = 0 } = req.query;
        
        let sql = `
            SELECT t.*, k.ad as kategori_adi, k.ikon as kategori_ikon, k.renk as kategori_renk
            FROM tahminler t
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE t.durum = ?
        `;
        const params = [durum];

        if (kategori) {
            sql += ' AND k.slug = ?';
            params.push(kategori);
        }

        sql += ' ORDER BY t.olusturma_tarihi DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const tahminler = await db.getAll(sql, params);

        res.json({ success: true, data: tahminler });
    } catch (err) {
        console.error('API tahminler hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Tek Tahmin Getir
router.get('/tahminler/:id', async (req, res) => {
    try {
        const tahmin = await db.getOne(`
            SELECT t.*, k.ad as kategori_adi, k.ikon as kategori_ikon
            FROM tahminler t
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE t.id = ?
        `, [req.params.id]);

        if (!tahmin) {
            return res.status(404).json({ success: false, message: 'Tahmin bulunamadı' });
        }

        res.json({ success: true, data: tahmin });
    } catch (err) {
        console.error('API tek tahmin hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Tahmin Yap
router.post('/tahminler/:id/tahmin-yap', ensureAuthenticatedAPI, async (req, res) => {
    try {
        const tahminId = req.params.id;
        const kullaniciId = req.user.id;
        const { secim } = req.body;

        if (!secim || !['evet', 'hayir'].includes(secim.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Geçersiz seçim' });
        }

        // Tahmin kontrolü
        const tahmin = await db.getOne('SELECT * FROM tahminler WHERE id = ? AND durum = "aktif"', [tahminId]);
        if (!tahmin) {
            return res.status(404).json({ success: false, message: 'Aktif tahmin bulunamadı' });
        }

        // Daha önce tahmin yapılmış mı?
        const mevcutTahmin = await db.getOne(
            'SELECT id FROM kullanici_tahminleri WHERE kullanici_id = ? AND tahmin_id = ?',
            [kullaniciId, tahminId]
        );
        if (mevcutTahmin) {
            return res.status(400).json({ success: false, message: 'Bu tahmin için zaten oy kullandınız' });
        }

        // Tahmin yap
        await db.insert(
            'INSERT INTO kullanici_tahminleri (kullanici_id, tahmin_id, secim) VALUES (?, ?, ?)',
            [kullaniciId, tahminId, secim.toLowerCase()]
        );

        // Katılım sayısını güncelle
        await db.execute('UPDATE tahminler SET katilim_sayisi = katilim_sayisi + 1 WHERE id = ?', [tahminId]);

        // Kullanıcının toplam tahminini güncelle
        await db.execute('UPDATE kullanicilar SET toplam_tahmin = toplam_tahmin + 1 WHERE id = ?', [kullaniciId]);

        // Oranları güncelle
        const oranlar = await db.getOne(`
            SELECT 
                COUNT(CASE WHEN secim = 'evet' THEN 1 END) as evet_count,
                COUNT(CASE WHEN secim = 'hayir' THEN 1 END) as hayir_count,
                COUNT(*) as total
            FROM kullanici_tahminleri
            WHERE tahmin_id = ?
        `, [tahminId]);

        const evetOrani = ((oranlar.evet_count / oranlar.total) * 100).toFixed(2);
        const hayirOrani = ((oranlar.hayir_count / oranlar.total) * 100).toFixed(2);

        await db.execute(
            'UPDATE tahminler SET evet_orani = ?, hayir_orani = ? WHERE id = ?',
            [evetOrani, hayirOrani, tahminId]
        );

        res.json({ 
            success: true, 
            message: 'Tahmininiz kaydedildi',
            data: {
                evet_orani: parseFloat(evetOrani),
                hayir_orani: parseFloat(hayirOrani),
                katilim_sayisi: oranlar.total
            }
        });
    } catch (err) {
        console.error('API tahmin yap hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Kategorileri Getir
router.get('/kategoriler', async (req, res) => {
    try {
        const kategoriler = await db.getAll('SELECT * FROM kategoriler WHERE aktif_mi = 1 ORDER BY sira');
        res.json({ success: true, data: kategoriler });
    } catch (err) {
        console.error('API kategoriler hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Sıralamayı Getir
router.get('/siralama', async (req, res) => {
    try {
        const { limit = 100 } = req.query;

        const kullanicilar = await db.getAll(`
            SELECT id, ad_soyad, kullanici_adi, avatar, bi_coin, seviye, 
                   toplam_tahmin, dogru_tahmin, seri, premium_mi
            FROM kullanicilar
            WHERE banlandi_mi = 0
            ORDER BY bi_coin DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({ success: true, data: kullanicilar });
    } catch (err) {
        console.error('API sıralama hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Kullanıcı Bilgisi
router.get('/profil', ensureAuthenticatedAPI, async (req, res) => {
    try {
        const kullanici = await db.getOne(`
            SELECT id, ad_soyad, kullanici_adi, email, avatar, bio, rol, bi_coin, seviye, xp,
                   toplam_tahmin, dogru_tahmin, seri, max_seri, premium_mi, dogrulanmis_mi,
                   olusturma_tarihi
            FROM kullanicilar
            WHERE id = ?
        `, [req.user.id]);

        // Sıralama
        const siralama = await db.getOne(`
            SELECT COUNT(*) + 1 as siralama
            FROM kullanicilar
            WHERE bi_coin > ? AND banlandi_mi = 0
        `, [kullanici.bi_coin]);

        kullanici.siralama = siralama?.siralama || 0;
        kullanici.dogruluk_orani = kullanici.toplam_tahmin > 0 
            ? Math.round((kullanici.dogru_tahmin / kullanici.toplam_tahmin) * 100) 
            : 0;

        res.json({ success: true, data: kullanici });
    } catch (err) {
        console.error('API profil hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Bildirimleri Getir
router.get('/bildirimler', ensureAuthenticatedAPI, async (req, res) => {
    try {
        const bildirimler = await db.getAll(`
            SELECT * FROM bildirimler
            WHERE kullanici_id = ?
            ORDER BY olusturma_tarihi DESC
            LIMIT 20
        `, [req.user.id]);

        const okunmamisCount = await db.getOne(`
            SELECT COUNT(*) as count FROM bildirimler
            WHERE kullanici_id = ? AND okundu_mu = 0
        `, [req.user.id]);

        res.json({ 
            success: true, 
            data: bildirimler,
            okunmamis: okunmamisCount?.count || 0
        });
    } catch (err) {
        console.error('API bildirimler hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Bildirimi Okundu İşaretle
router.post('/bildirimler/:id/okundu', ensureAuthenticatedAPI, async (req, res) => {
    try {
        await db.execute(
            'UPDATE bildirimler SET okundu_mu = 1 WHERE id = ? AND kullanici_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('API bildirim okundu hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Tüm Bildirimleri Okundu İşaretle
router.post('/bildirimler/tumunu-oku', ensureAuthenticatedAPI, async (req, res) => {
    try {
        await db.execute(
            'UPDATE bildirimler SET okundu_mu = 1 WHERE kullanici_id = ?',
            [req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('API tüm bildirimleri oku hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Tahmin Yap (Alternatif endpoint)
router.post('/tahmin-yap', ensureAuthenticatedAPI, async (req, res) => {
    try {
        const kullaniciId = req.user.id;
        const { tahmin_id, secim } = req.body;

        if (!tahmin_id || !secim || !['evet', 'hayir'].includes(secim.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Gecersiz istek' });
        }

        // Tahmin kontrolu
        const tahmin = await db.getOne('SELECT * FROM tahminler WHERE id = ? AND durum = "aktif"', [tahmin_id]);
        if (!tahmin) {
            return res.status(404).json({ success: false, message: 'Aktif tahmin bulunamadi' });
        }

        // Daha once tahmin yapilmis mi?
        const mevcutTahmin = await db.getOne(
            'SELECT id FROM kullanici_tahminleri WHERE kullanici_id = ? AND tahmin_id = ?',
            [kullaniciId, tahmin_id]
        );
        if (mevcutTahmin) {
            return res.status(400).json({ success: false, message: 'Bu tahmin icin zaten oy kullandiniz' });
        }

        // Tahmin yap
        await db.insert(
            'INSERT INTO kullanici_tahminleri (kullanici_id, tahmin_id, secim) VALUES (?, ?, ?)',
            [kullaniciId, tahmin_id, secim.toLowerCase()]
        );

        // Katilim sayisini guncelle
        await db.execute('UPDATE tahminler SET katilim_sayisi = katilim_sayisi + 1 WHERE id = ?', [tahmin_id]);

        // Kullanicinin toplam tahminini guncelle
        await db.execute('UPDATE kullanicilar SET toplam_tahmin = toplam_tahmin + 1 WHERE id = ?', [kullaniciId]);

        // Oranlari guncelle
        const oranlar = await db.getOne(`
            SELECT
                COUNT(CASE WHEN secim = 'evet' THEN 1 END) as evet_count,
                COUNT(CASE WHEN secim = 'hayir' THEN 1 END) as hayir_count,
                COUNT(*) as total
            FROM kullanici_tahminleri
            WHERE tahmin_id = ?
        `, [tahmin_id]);

        const evetOrani = ((oranlar.evet_count / oranlar.total) * 100).toFixed(2);
        const hayirOrani = ((oranlar.hayir_count / oranlar.total) * 100).toFixed(2);

        await db.execute(
            'UPDATE tahminler SET evet_orani = ?, hayir_orani = ? WHERE id = ?',
            [evetOrani, hayirOrani, tahmin_id]
        );

        // Socket.io ile canli guncelleme
        if (global.emitPredictionUpdate) {
            global.emitPredictionUpdate({
                tahmin_id: tahmin_id,
                evet_orani: parseFloat(evetOrani),
                hayir_orani: parseFloat(hayirOrani),
                katilim_sayisi: oranlar.total
            });
        }

        res.json({
            success: true,
            message: 'Tahmininiz kaydedildi',
            data: {
                evet_orani: parseFloat(evetOrani),
                hayir_orani: parseFloat(hayirOrani),
                katilim_sayisi: oranlar.total
            }
        });
    } catch (err) {
        console.error('API tahmin yap hatasi:', err);
        res.status(500).json({ success: false, message: 'Bir hata olustu' });
    }
});

// Bi Coin Guncelle (Admin)
router.post('/admin/bicoin-guncelle', ensureAdminAPI, async (req, res) => {
    try {
        const { kullanici_id, miktar, tip, aciklama } = req.body;

        // Kullanici kontrolu
        const kullanici = await db.getOne('SELECT bi_coin FROM kullanicilar WHERE id = ?', [kullanici_id]);
        if (!kullanici) {
            return res.status(404).json({ success: false, message: 'Kullanici bulunamadi' });
        }

        let yeniBakiye = kullanici.bi_coin;
        if (tip === 'ekle') {
            yeniBakiye += parseInt(miktar);
        } else if (tip === 'cikar') {
            yeniBakiye -= parseInt(miktar);
            if (yeniBakiye < 0) yeniBakiye = 0;
        } else {
            yeniBakiye = parseInt(miktar);
        }

        await db.execute('UPDATE kullanicilar SET bi_coin = ? WHERE id = ?', [yeniBakiye, kullanici_id]);

        // Islem kaydi
        await db.insert(`
            INSERT INTO bi_islemleri (kullanici_id, miktar, tip, aciklama, bakiye_sonrasi)
            VALUES (?, ?, ?, ?, ?)
        `, [kullanici_id, miktar, tip === 'ekle' ? 'bonus' : 'harcama', aciklama || 'Admin islemi', yeniBakiye]);

        // Socket.io ile canli guncelleme
        if (global.emitBiCoinUpdate) {
            global.emitBiCoinUpdate(kullanici_id, yeniBakiye);
        }

        res.json({ success: true, message: 'Bakiye guncellendi', yeni_bakiye: yeniBakiye });
    } catch (err) {
        console.error('Bi coin guncelleme hatasi:', err);
        res.status(500).json({ success: false, message: 'Bir hata olustu' });
    }
});

// Admin: Istatistikler
router.get('/admin/istatistikler', ensureAdminAPI, async (req, res) => {
    try {
        const stats = {};

        const userCount = await db.getOne('SELECT COUNT(*) as total FROM kullanicilar');
        stats.toplamKullanici = userCount?.total || 0;

        const todayUsers = await db.getOne(`
            SELECT COUNT(*) as total FROM kullanicilar 
            WHERE DATE(olusturma_tarihi) = CURDATE()
        `);
        stats.bugunKayit = todayUsers?.total || 0;

        const activePredictions = await db.getOne('SELECT COUNT(*) as total FROM tahminler WHERE durum = "aktif"');
        stats.aktifTahmin = activePredictions?.total || 0;

        const totalVotes = await db.getOne('SELECT COUNT(*) as total FROM kullanici_tahminleri');
        stats.toplamOy = totalVotes?.total || 0;

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('API admin istatistikler hatası:', err);
        res.status(500).json({ success: false, message: 'Bir hata oluştu' });
    }
});

module.exports = router;
