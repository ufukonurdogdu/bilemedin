const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAdmin } = require('../middleware/auth');

// Admin Dashboard
router.get('/', ensureAdmin, async (req, res) => {
    try {
        // İstatistikler
        const stats = {};
        
        const userCount = await db.getOne('SELECT COUNT(*) as total FROM kullanicilar');
        stats.toplamKullanici = userCount?.total || 0;

        const activeUserCount = await db.getOne(`
            SELECT COUNT(*) as total FROM kullanicilar 
            WHERE son_giris >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);
        stats.aktifKullanici = activeUserCount?.total || 0;

        const predictionCount = await db.getOne('SELECT COUNT(*) as total FROM tahminler WHERE durum = "aktif"');
        stats.aktifTahmin = predictionCount?.total || 0;

        const totalBiCount = await db.getOne('SELECT SUM(bi_coin) as total FROM kullanicilar');
        stats.toplamBiCoin = totalBiCount?.total || 0;

        // Son tahminler
        const sonTahminler = await db.getAll(`
            SELECT t.*, k.ad as kategori_adi
            FROM tahminler t
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            ORDER BY t.olusturma_tarihi DESC
            LIMIT 10
        `);

        // Son aktiviteler
        const aktiviteler = await db.getAll(`
            (SELECT 'kullanici' as tip, ad_soyad as baslik, 'Yeni kayıt' as aciklama, olusturma_tarihi 
             FROM kullanicilar ORDER BY olusturma_tarihi DESC LIMIT 5)
            UNION ALL
            (SELECT 'tahmin' as tip, baslik, 'Yeni tahmin' as aciklama, olusturma_tarihi 
             FROM tahminler ORDER BY olusturma_tarihi DESC LIMIT 5)
            ORDER BY olusturma_tarihi DESC
            LIMIT 10
        `);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Bilemezsin',
            layout: 'layouts/admin',
            stats,
            sonTahminler,
            aktiviteler
        });
    } catch (err) {
        console.error('Admin dashboard hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/');
    }
});

// Kullanıcılar Listesi
router.get('/kullanicilar', ensureAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.sayfa) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const kullanicilar = await db.getAll(`
            SELECT * FROM kullanicilar
            ORDER BY olusturma_tarihi DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const totalCount = await db.getOne('SELECT COUNT(*) as total FROM kullanicilar');
        const totalPages = Math.ceil(totalCount.total / limit);

        res.render('admin/kullanicilar', {
            title: 'Kullanıcılar - Admin',
            layout: 'layouts/admin',
            kullanicilar,
            currentPage: page,
            totalPages
        });
    } catch (err) {
        console.error('Kullanıcılar listesi hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin');
    }
});

// Kullanıcı Detay
router.get('/kullanicilar/:id', ensureAdmin, async (req, res) => {
    try {
        const kullanici = await db.getOne(
            'SELECT * FROM kullanicilar WHERE id = ?',
            [req.params.id]
        );

        if (!kullanici) {
            req.flash('error_msg', 'Kullanıcı bulunamadı');
            return res.redirect('/admin/kullanicilar');
        }

        const tahminler = await db.getAll(`
            SELECT kt.*, t.baslik
            FROM kullanici_tahminleri kt
            JOIN tahminler t ON kt.tahmin_id = t.id
            WHERE kt.kullanici_id = ?
            ORDER BY kt.olusturma_tarihi DESC
            LIMIT 20
        `, [req.params.id]);

        res.render('admin/kullanici-detay', {
            title: 'Kullanıcı Detay - Admin',
            layout: 'layouts/admin',
            kullanici,
            tahminler
        });
    } catch (err) {
        console.error('Kullanıcı detay hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/kullanicilar');
    }
});

// Kullanıcı Banla/Ban Kaldır
router.post('/kullanicilar/:id/ban', ensureAdmin, async (req, res) => {
    try {
        const kullanici = await db.getOne('SELECT * FROM kullanicilar WHERE id = ?', [req.params.id]);
        
        if (!kullanici) {
            req.flash('error_msg', 'Kullanıcı bulunamadı');
            return res.redirect('/admin/kullanicilar');
        }

        const { ban_sebebi } = req.body;
        const yeniDurum = !kullanici.banlandi_mi;

        await db.execute(
            'UPDATE kullanicilar SET banlandi_mi = ?, ban_sebebi = ? WHERE id = ?',
            [yeniDurum, yeniDurum ? ban_sebebi : null, req.params.id]
        );

        req.flash('success_msg', yeniDurum ? 'Kullanıcı banlandı' : 'Ban kaldırıldı');
        res.redirect('/admin/kullanicilar/' + req.params.id);
    } catch (err) {
        console.error('Ban işlemi hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/kullanicilar');
    }
});

// Tahminler Listesi
router.get('/tahminler', ensureAdmin, async (req, res) => {
    try {
        const durum = req.query.durum || 'aktif';
        
        const tahminler = await db.getAll(`
            SELECT t.*, k.ad as kategori_adi, u.ad_soyad as olusturan
            FROM tahminler t
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            LEFT JOIN kullanicilar u ON t.olusturan_id = u.id
            WHERE t.durum = ?
            ORDER BY t.olusturma_tarihi DESC
        `, [durum]);

        const kategoriler = await db.getAll('SELECT * FROM kategoriler WHERE aktif_mi = 1');

        res.render('admin/tahminler', {
            title: 'Tahminler - Admin',
            layout: 'layouts/admin',
            tahminler,
            kategoriler,
            currentDurum: durum
        });
    } catch (err) {
        console.error('Tahminler listesi hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin');
    }
});

// Yeni Tahmin Sayfası
router.get('/tahminler/yeni', ensureAdmin, async (req, res) => {
    try {
        const kategoriler = await db.getAll('SELECT * FROM kategoriler WHERE aktif_mi = 1');

        res.render('admin/tahmin-ekle', {
            title: 'Yeni Tahmin - Admin',
            layout: 'layouts/admin',
            kategoriler
        });
    } catch (err) {
        console.error('Yeni tahmin sayfası hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler');
    }
});

// Yeni Tahmin Ekle
router.post('/tahminler/yeni', ensureAdmin, async (req, res) => {
    try {
        const { baslik, aciklama, kategori_id, gorsel, bi_odul, bitis_tarihi, sponsorlu_mu, sponsor_adi } = req.body;

        await db.insert(`
            INSERT INTO tahminler (baslik, aciklama, kategori_id, gorsel, bi_odul, bitis_tarihi, sponsorlu_mu, sponsor_adi, olusturan_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [baslik, aciklama, kategori_id, gorsel, bi_odul || 100, bitis_tarihi, sponsorlu_mu ? 1 : 0, sponsor_adi, req.user.id]);

        req.flash('success_msg', 'Tahmin eklendi');
        res.redirect('/admin/tahminler');
    } catch (err) {
        console.error('Tahmin ekleme hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler/yeni');
    }
});

// Tahmin Düzenle Sayfası
router.get('/tahminler/:id/duzenle', ensureAdmin, async (req, res) => {
    try {
        const tahmin = await db.getOne('SELECT * FROM tahminler WHERE id = ?', [req.params.id]);
        
        if (!tahmin) {
            req.flash('error_msg', 'Tahmin bulunamadı');
            return res.redirect('/admin/tahminler');
        }

        const kategoriler = await db.getAll('SELECT * FROM kategoriler WHERE aktif_mi = 1');

        res.render('admin/tahmin-duzenle', {
            title: 'Tahmin Düzenle - Admin',
            layout: 'layouts/admin',
            tahmin,
            kategoriler
        });
    } catch (err) {
        console.error('Tahmin düzenle sayfası hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler');
    }
});

// Tahmin Güncelle
router.post('/tahminler/:id/duzenle', ensureAdmin, async (req, res) => {
    try {
        const { baslik, aciklama, kategori_id, gorsel, bi_odul, bitis_tarihi, durum, sponsorlu_mu, sponsor_adi } = req.body;

        await db.execute(`
            UPDATE tahminler 
            SET baslik = ?, aciklama = ?, kategori_id = ?, gorsel = ?, bi_odul = ?, 
                bitis_tarihi = ?, durum = ?, sponsorlu_mu = ?, sponsor_adi = ?
            WHERE id = ?
        `, [baslik, aciklama, kategori_id, gorsel, bi_odul, bitis_tarihi, durum, sponsorlu_mu ? 1 : 0, sponsor_adi, req.params.id]);

        req.flash('success_msg', 'Tahmin güncellendi');
        res.redirect('/admin/tahminler');
    } catch (err) {
        console.error('Tahmin güncelleme hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler/' + req.params.id + '/duzenle');
    }
});

// Tahmin Sonuçlandır
router.post('/tahminler/:id/sonuclandir', ensureAdmin, async (req, res) => {
    try {
        const { dogru_cevap } = req.body;
        const tahminId = req.params.id;

        // Tahmini sonuçlandır
        await db.execute(`
            UPDATE tahminler 
            SET durum = 'sonuclandi', dogru_cevap = ?, sonuclanma_tarihi = NOW()
            WHERE id = ?
        `, [dogru_cevap, tahminId]);

        // Doğru tahmin yapanları güncelle
        const tahmin = await db.getOne('SELECT bi_odul FROM tahminler WHERE id = ?', [tahminId]);

        // Kullanıcı tahminlerini güncelle
        await db.execute(`
            UPDATE kullanici_tahminleri 
            SET dogru_mu = (secim = ?), kazanilan_bi = IF(secim = ?, ?, 0)
            WHERE tahmin_id = ?
        `, [dogru_cevap, dogru_cevap, tahmin.bi_odul, tahminId]);

        // Doğru tahmin yapanların bi! coin'lerini güncelle
        await db.execute(`
            UPDATE kullanicilar k
            JOIN kullanici_tahminleri kt ON k.id = kt.kullanici_id
            SET k.bi_coin = k.bi_coin + ?, k.dogru_tahmin = k.dogru_tahmin + 1
            WHERE kt.tahmin_id = ? AND kt.secim = ?
        `, [tahmin.bi_odul, tahminId, dogru_cevap]);

        req.flash('success_msg', 'Tahmin sonuçlandırıldı');
        res.redirect('/admin/tahminler');
    } catch (err) {
        console.error('Tahmin sonuçlandırma hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler');
    }
});

// Tahmin Sil
router.post('/tahminler/:id/sil', ensureAdmin, async (req, res) => {
    try {
        await db.execute('DELETE FROM tahminler WHERE id = ?', [req.params.id]);
        req.flash('success_msg', 'Tahmin silindi');
        res.redirect('/admin/tahminler');
    } catch (err) {
        console.error('Tahmin silme hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin/tahminler');
    }
});

// Kategoriler
router.get('/kategoriler', ensureAdmin, async (req, res) => {
    try {
        const kategoriler = await db.getAll('SELECT * FROM kategoriler ORDER BY sira');

        res.render('admin/kategoriler', {
            title: 'Kategoriler - Admin',
            layout: 'layouts/admin',
            kategoriler
        });
    } catch (err) {
        console.error('Kategoriler hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin');
    }
});

// Reklamlar
router.get('/reklamlar', ensureAdmin, async (req, res) => {
    try {
        const reklamlar = await db.getAll('SELECT * FROM reklamlar ORDER BY olusturma_tarihi DESC');

        res.render('admin/reklamlar', {
            title: 'Reklamlar - Admin',
            layout: 'layouts/admin',
            reklamlar
        });
    } catch (err) {
        console.error('Reklamlar hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/admin');
    }
});

// Ayarlar
router.get('/ayarlar', ensureAdmin, (req, res) => {
    res.render('admin/ayarlar', {
        title: 'Ayarlar - Admin',
        layout: 'layouts/admin'
    });
});

module.exports = router;
