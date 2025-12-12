const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureAuthenticated } = require('../middleware/auth');

// Dashboard Ana Sayfa
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const kullaniciId = req.user.id;

        // Aktif tahminleri getir
        const aktifTahminler = await db.getAll(`
            SELECT kt.*, t.baslik, t.gorsel, t.bitis_tarihi, t.bi_odul, t.evet_orani, t.hayir_orani,
                   k.ad as kategori_adi, k.ikon as kategori_ikon
            FROM kullanici_tahminleri kt
            JOIN tahminler t ON kt.tahmin_id = t.id
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE kt.kullanici_id = ? AND t.durum = 'aktif'
            ORDER BY t.bitis_tarihi ASC
            LIMIT 5
        `, [kullaniciId]);

        // Görevleri getir
        const gorevler = await db.getAll(`
            SELECT g.*, COALESCE(kg.ilerleme, 0) as ilerleme, COALESCE(kg.tamamlandi_mi, 0) as tamamlandi_mi
            FROM gorevler g
            LEFT JOIN kullanici_gorevleri kg ON g.id = kg.gorev_id AND kg.kullanici_id = ?
            WHERE g.aktif_mi = 1 AND g.tip = 'gunluk'
            ORDER BY kg.tamamlandi_mi ASC, g.id ASC
            LIMIT 4
        `, [kullaniciId]);

        // Rozetleri getir
        const rozetler = await db.getAll(`
            SELECT r.*, IF(kr.id IS NOT NULL, 1, 0) as kazanildi
            FROM rozetler r
            LEFT JOIN kullanici_rozetleri kr ON r.id = kr.rozet_id AND kr.kullanici_id = ?
            ORDER BY kazanildi DESC, r.id ASC
            LIMIT 8
        `, [kullaniciId]);

        // Tahmin geçmişi
        const gecmis = await db.getAll(`
            SELECT kt.*, t.baslik, t.gorsel, k.ad as kategori_adi
            FROM kullanici_tahminleri kt
            JOIN tahminler t ON kt.tahmin_id = t.id
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE kt.kullanici_id = ? AND t.durum = 'sonuclandi'
            ORDER BY kt.olusturma_tarihi DESC
            LIMIT 5
        `, [kullaniciId]);

        // Bildirimler
        const bildirimler = await db.getAll(`
            SELECT * FROM bildirimler
            WHERE kullanici_id = ?
            ORDER BY olusturma_tarihi DESC
            LIMIT 5
        `, [kullaniciId]);

        // Sıralama pozisyonu
        const siralamaResult = await db.getOne(`
            SELECT COUNT(*) + 1 as siralama
            FROM kullanicilar
            WHERE bi_coin > ? AND banlandi_mi = 0
        `, [req.user.bi_coin]);

        res.render('user/dashboard', {
            title: 'Profilim - Bilemezsin',
            layout: 'layouts/user',
            aktifTahminler,
            gorevler,
            rozetler,
            gecmis,
            bildirimler,
            siralama: siralamaResult?.siralama || 0
        });
    } catch (err) {
        console.error('Dashboard hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/');
    }
});

// Profil Düzenleme Sayfası
router.get('/profil', ensureAuthenticated, (req, res) => {
    res.render('user/profil', {
        title: 'Profil Düzenle - Bilemezsin',
        layout: 'layouts/user'
    });
});

// Profil Güncelleme
router.post('/profil', ensureAuthenticated, async (req, res) => {
    try {
        const { ad_soyad, bio } = req.body;
        
        await db.execute(
            'UPDATE kullanicilar SET ad_soyad = ?, bio = ? WHERE id = ?',
            [ad_soyad, bio, req.user.id]
        );

        req.flash('success_msg', 'Profil güncellendi');
        res.redirect('/dashboard/profil');
    } catch (err) {
        console.error('Profil güncelleme hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard/profil');
    }
});

// Tahminlerim
router.get('/tahminlerim', ensureAuthenticated, async (req, res) => {
    try {
        const tahminler = await db.getAll(`
            SELECT kt.*, t.baslik, t.gorsel, t.bitis_tarihi, t.bi_odul, t.durum,
                   k.ad as kategori_adi, k.ikon as kategori_ikon
            FROM kullanici_tahminleri kt
            JOIN tahminler t ON kt.tahmin_id = t.id
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE kt.kullanici_id = ?
            ORDER BY kt.olusturma_tarihi DESC
        `, [req.user.id]);

        res.render('user/tahminlerim', {
            title: 'Tahminlerim - Bilemezsin',
            layout: 'layouts/user',
            tahminler
        });
    } catch (err) {
        console.error('Tahminlerim hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard');
    }
});

// Rozetlerim
router.get('/rozetlerim', ensureAuthenticated, async (req, res) => {
    try {
        const rozetler = await db.getAll(`
            SELECT r.*, IF(kr.id IS NOT NULL, 1, 0) as kazanildi, kr.kazanilma_tarihi
            FROM rozetler r
            LEFT JOIN kullanici_rozetleri kr ON r.id = kr.rozet_id AND kr.kullanici_id = ?
            ORDER BY kazanildi DESC, r.id ASC
        `, [req.user.id]);

        res.render('user/rozetlerim', {
            title: 'Rozetlerim - Bilemezsin',
            layout: 'layouts/user',
            rozetler
        });
    } catch (err) {
        console.error('Rozetlerim hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard');
    }
});

// Görevlerim
router.get('/gorevlerim', ensureAuthenticated, async (req, res) => {
    try {
        const gorevler = await db.getAll(`
            SELECT g.*, COALESCE(kg.ilerleme, 0) as ilerleme, COALESCE(kg.tamamlandi_mi, 0) as tamamlandi_mi
            FROM gorevler g
            LEFT JOIN kullanici_gorevleri kg ON g.id = kg.gorev_id AND kg.kullanici_id = ?
            WHERE g.aktif_mi = 1
            ORDER BY g.tip, kg.tamamlandi_mi ASC, g.id ASC
        `, [req.user.id]);

        res.render('user/gorevlerim', {
            title: 'Görevlerim - Bilemezsin',
            layout: 'layouts/user',
            gorevler
        });
    } catch (err) {
        console.error('Görevlerim hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard');
    }
});

// bi! Coin Geçmişi
router.get('/bi-gecmisi', ensureAuthenticated, async (req, res) => {
    try {
        const islemler = await db.getAll(`
            SELECT * FROM bi_islemleri
            WHERE kullanici_id = ?
            ORDER BY olusturma_tarihi DESC
            LIMIT 50
        `, [req.user.id]);

        res.render('user/bi-gecmisi', {
            title: 'bi! Geçmişi - Bilemezsin',
            layout: 'layouts/user',
            islemler
        });
    } catch (err) {
        console.error('bi! Geçmişi hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard');
    }
});

// Bildirimler
router.get('/bildirimler', ensureAuthenticated, async (req, res) => {
    try {
        const bildirimler = await db.getAll(`
            SELECT * FROM bildirimler
            WHERE kullanici_id = ?
            ORDER BY olusturma_tarihi DESC
            LIMIT 50
        `, [req.user.id]);

        // Tüm bildirimleri okundu yap
        await db.execute(
            'UPDATE bildirimler SET okundu_mu = 1 WHERE kullanici_id = ?',
            [req.user.id]
        );

        res.render('user/bildirimler', {
            title: 'Bildirimler - Bilemezsin',
            layout: 'layouts/user',
            bildirimler
        });
    } catch (err) {
        console.error('Bildirimler hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard');
    }
});

// Ayarlar
router.get('/ayarlar', ensureAuthenticated, (req, res) => {
    res.render('user/ayarlar', {
        title: 'Ayarlar - Bilemezsin',
        layout: 'layouts/user'
    });
});

// Ayarları Kaydet
router.post('/ayarlar', ensureAuthenticated, async (req, res) => {
    try {
        const { tema, bildirimler, email_bildirimleri } = req.body;
        
        const ayarlar = {
            tema: tema || 'auto',
            bildirimler: bildirimler === 'on',
            email_bildirimleri: email_bildirimleri === 'on',
            dil: 'tr'
        };

        await db.execute(
            'UPDATE kullanicilar SET ayarlar = ? WHERE id = ?',
            [JSON.stringify(ayarlar), req.user.id]
        );

        req.flash('success_msg', 'Ayarlar kaydedildi');
        res.redirect('/dashboard/ayarlar');
    } catch (err) {
        console.error('Ayarlar hatası:', err);
        req.flash('error_msg', 'Bir hata oluştu');
        res.redirect('/dashboard/ayarlar');
    }
});

module.exports = router;
