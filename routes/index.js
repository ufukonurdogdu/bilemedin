const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Ana Sayfa
router.get('/', async (req, res) => {
    try {
        // Aktif tahminleri getir
        const tahminler = await db.getAll(`
            SELECT t.*, k.ad as kategori_adi, k.ikon as kategori_ikon, k.renk as kategori_renk
            FROM tahminler t
            LEFT JOIN kategoriler k ON t.kategori_id = k.id
            WHERE t.durum = 'aktif'
            ORDER BY t.olusturma_tarihi DESC
            LIMIT 10
        `);

        // Kategorileri getir
        const kategoriler = await db.getAll(
            'SELECT * FROM kategoriler WHERE aktif_mi = 1 ORDER BY sira'
        );

        res.render('index', {
            title: 'Bilemezsin - Tahmin Platformu',
            layout: 'layouts/main',
            tahminler,
            kategoriler
        });
    } catch (err) {
        console.error('Ana sayfa hatası:', err);
        res.render('index', {
            title: 'Bilemezsin - Tahmin Platformu',
            layout: 'layouts/main',
            tahminler: [],
            kategoriler: []
        });
    }
});

// Sıralama
router.get('/siralama', async (req, res) => {
    try {
        const kullanicilar = await db.getAll(`
            SELECT id, ad_soyad, kullanici_adi, avatar, bi_coin, seviye, 
                   toplam_tahmin, dogru_tahmin, seri, premium_mi,
                   ROUND((dogru_tahmin / NULLIF(toplam_tahmin, 0)) * 100, 1) as dogruluk_orani
            FROM kullanicilar
            WHERE banlandi_mi = 0
            ORDER BY bi_coin DESC
            LIMIT 100
        `);

        res.render('pages/siralama', {
            title: 'Sıralama - Bilemezsin',
            layout: 'layouts/main',
            kullanicilar
        });
    } catch (err) {
        console.error('Sıralama hatası:', err);
        res.render('pages/siralama', {
            title: 'Sıralama - Bilemezsin',
            layout: 'layouts/main',
            kullanicilar: []
        });
    }
});

// Hakkımızda
router.get('/hakkimizda', (req, res) => {
    res.render('pages/hakkimizda', {
        title: 'Hakkımızda - Bilemezsin',
        layout: 'layouts/main'
    });
});

// İletişim
router.get('/iletisim', (req, res) => {
    res.render('pages/iletisim', {
        title: 'İletişim - Bilemezsin',
        layout: 'layouts/main'
    });
});

// Gizlilik Politikası
router.get('/gizlilik', (req, res) => {
    res.render('pages/gizlilik', {
        title: 'Gizlilik Politikası - Bilemezsin',
        layout: 'layouts/main'
    });
});

// Kullanim Sartlari
router.get('/kullanim-sartlari', (req, res) => {
    res.render('pages/kullanim-sartlari', {
        title: 'Kullanim Sartlari - Bilemezsin',
        layout: 'layouts/main'
    });
});

// Tahminler Sayfasi
router.get('/tahminler', async (req, res) => {
    try {
        const kategoriId = req.query.kategori;

        let tahminler;
        if (kategoriId) {
            tahminler = await db.getAll(`
                SELECT t.*, k.ad as kategori_adi, k.ikon as kategori_ikon, k.renk as kategori_renk
                FROM tahminler t
                LEFT JOIN kategoriler k ON t.kategori_id = k.id
                WHERE t.durum = 'aktif' AND t.kategori_id = ?
                ORDER BY t.olusturma_tarihi DESC
            `, [kategoriId]);
        } else {
            tahminler = await db.getAll(`
                SELECT t.*, k.ad as kategori_adi, k.ikon as kategori_ikon, k.renk as kategori_renk
                FROM tahminler t
                LEFT JOIN kategoriler k ON t.kategori_id = k.id
                WHERE t.durum = 'aktif'
                ORDER BY t.olusturma_tarihi DESC
            `);
        }

        const kategoriler = await db.getAll('SELECT * FROM kategoriler WHERE aktif_mi = 1 ORDER BY sira');

        res.render('pages/tahminler', {
            title: 'Tahminler - Bilemezsin',
            layout: 'layouts/main',
            tahminler,
            kategoriler,
            seciliKategori: kategoriId
        });
    } catch (err) {
        console.error('Tahminler sayfasi hatasi:', err);
        res.render('pages/tahminler', {
            title: 'Tahminler - Bilemezsin',
            layout: 'layouts/main',
            tahminler: [],
            kategoriler: [],
            seciliKategori: null
        });
    }
});

// Magaza Sayfasi
router.get('/magaza', async (req, res) => {
    try {
        const urunler = await db.getAll(`
            SELECT * FROM magaza_urunleri
            WHERE aktif_mi = 1
            ORDER BY olusturma_tarihi DESC
        `);

        res.render('pages/magaza', {
            title: 'Magaza - Bilemezsin',
            layout: 'layouts/main',
            urunler
        });
    } catch (err) {
        console.error('Magaza sayfasi hatasi:', err);
        res.render('pages/magaza', {
            title: 'Magaza - Bilemezsin',
            layout: 'layouts/main',
            urunler: []
        });
    }
});

// Gorevler Sayfasi (Public)
router.get('/gorevler', async (req, res) => {
    try {
        const gorevler = await db.getAll(`
            SELECT * FROM gorevler
            WHERE aktif_mi = 1
            ORDER BY tip, id
        `);

        res.render('pages/gorevler', {
            title: 'Gorevler - Bilemezsin',
            layout: 'layouts/main',
            gorevler
        });
    } catch (err) {
        console.error('Gorevler sayfasi hatasi:', err);
        res.render('pages/gorevler', {
            title: 'Gorevler - Bilemezsin',
            layout: 'layouts/main',
            gorevler: []
        });
    }
});

module.exports = router;
