const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { ensureGuest, ensureAuthenticated } = require('../middleware/auth');

// Giriş Sayfası
router.get('/giris', ensureGuest, (req, res) => {
    res.render('auth/giris', {
        title: 'Giriş Yap - Bilemezsin',
        layout: 'layouts/auth'
    });
});

// Kayıt Sayfası
router.get('/kayit', ensureGuest, (req, res) => {
    res.render('auth/kayit', {
        title: 'Kayıt Ol - Bilemezsin',
        layout: 'layouts/auth'
    });
});

// Local Login POST
router.post('/giris', ensureGuest, (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/auth/giris',
        failureFlash: true
    })(req, res, next);
});

// Local Register POST
router.post('/kayit', ensureGuest, [
    body('ad_soyad')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('İsim 2-50 karakter arasında olmalıdır'),
    body('kullanici_adi')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Kullanıcı adı 3-20 karakter arasında olmalıdır')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Geçerli bir e-posta adresi giriniz'),
    body('sifre')
        .isLength({ min: 6 })
        .withMessage('Şifre en az 6 karakter olmalıdır'),
    body('sifre_tekrar')
        .custom((value, { req }) => {
            if (value !== req.body.sifre) {
                throw new Error('Şifreler eşleşmiyor');
            }
            return true;
        })
], async (req, res) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.render('auth/kayit', {
            title: 'Kayıt Ol - Bilemezsin',
            layout: 'layouts/auth',
            errors: errors.array(),
            ad_soyad: req.body.ad_soyad,
            kullanici_adi: req.body.kullanici_adi,
            email: req.body.email
        });
    }

    const { ad_soyad, kullanici_adi, email, sifre } = req.body;

    try {
        // E-posta kontrolü
        let user = await db.getOne('SELECT id FROM kullanicilar WHERE email = ?', [email.toLowerCase()]);
        if (user) {
            return res.render('auth/kayit', {
                title: 'Kayıt Ol - Bilemezsin',
                layout: 'layouts/auth',
                errors: [{ msg: 'Bu e-posta adresi zaten kayıtlı' }],
                ad_soyad,
                kullanici_adi,
                email
            });
        }

        // Kullanıcı adı kontrolü
        user = await db.getOne('SELECT id FROM kullanicilar WHERE kullanici_adi = ?', [kullanici_adi.toLowerCase()]);
        if (user) {
            return res.render('auth/kayit', {
                title: 'Kayıt Ol - Bilemezsin',
                layout: 'layouts/auth',
                errors: [{ msg: 'Bu kullanıcı adı zaten alınmış' }],
                ad_soyad,
                kullanici_adi,
                email
            });
        }

        // Şifreyi hashle
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(sifre, salt);

        // Yeni kullanıcı oluştur
        await db.insert(
            `INSERT INTO kullanicilar (ad_soyad, kullanici_adi, email, sifre, giris_yontemi)
             VALUES (?, ?, ?, ?, 'local')`,
            [ad_soyad, kullanici_adi.toLowerCase(), email.toLowerCase(), hashedPassword]
        );

        req.flash('success_msg', 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
        res.redirect('/auth/giris');

    } catch (err) {
        console.error('Kayıt Hatası:', err);
        res.render('auth/kayit', {
            title: 'Kayıt Ol - Bilemezsin',
            layout: 'layouts/auth',
            errors: [{ msg: 'Bir hata oluştu, lütfen tekrar deneyin' }],
            ad_soyad,
            kullanici_adi,
            email
        });
    }
});

// Google Auth
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

// Google Callback
router.get('/google/callback', passport.authenticate('google', {
    failureRedirect: '/auth/giris',
    failureFlash: true
}), (req, res) => {
    req.flash('success_msg', 'Google ile giriş başarılı!');
    res.redirect('/dashboard');
});

// Facebook Auth
router.get('/facebook', passport.authenticate('facebook', {
    scope: ['email']
}));

// Facebook Callback
router.get('/facebook/callback', passport.authenticate('facebook', {
    failureRedirect: '/auth/giris',
    failureFlash: true
}), (req, res) => {
    req.flash('success_msg', 'Facebook ile giriş başarılı!');
    res.redirect('/dashboard');
});

// Çıkış
router.get('/cikis', ensureAuthenticated, (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Çıkış hatası:', err);
            return res.redirect('/dashboard');
        }
        req.flash('success_msg', 'Başarıyla çıkış yaptınız');
        res.redirect('/auth/giris');
    });
});

// Şifremi Unuttum Sayfası
router.get('/sifremi-unuttum', ensureGuest, (req, res) => {
    res.render('auth/sifremi-unuttum', {
        title: 'Şifremi Unuttum - Bilemezsin',
        layout: 'layouts/auth'
    });
});

module.exports = router;
