// Giriş yapmış kullanıcı kontrolü
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        if (req.user.banlandi_mi) {
            req.logout((err) => {
                if (err) console.error(err);
                req.flash('error_msg', 'Hesabınız askıya alınmıştır. Sebep: ' + (req.user.ban_sebebi || 'Belirtilmemiş'));
                res.redirect('/auth/giris');
            });
            return;
        }
        return next();
    }
    req.flash('error_msg', 'Bu sayfayı görüntülemek için giriş yapmalısınız');
    res.redirect('/auth/giris');
};

// Giriş yapmamış kullanıcı kontrolü
const ensureGuest = (req, res, next) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dashboard');
    }
    next();
};

// Admin kontrolü
const ensureAdmin = (req, res, next) => {
    if (req.isAuthenticated() && ['admin', 'superadmin'].includes(req.user.rol)) {
        return next();
    }
    req.flash('error_msg', 'Bu sayfaya erişim yetkiniz yok');
    res.redirect('/dashboard');
};

// Moderator kontrolü
const ensureModerator = (req, res, next) => {
    if (req.isAuthenticated() && ['moderator', 'admin', 'superadmin'].includes(req.user.rol)) {
        return next();
    }
    req.flash('error_msg', 'Bu sayfaya erişim yetkiniz yok');
    res.redirect('/dashboard');
};

// SuperAdmin kontrolü
const ensureSuperAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.rol === 'superadmin') {
        return next();
    }
    req.flash('error_msg', 'Bu sayfaya erişim yetkiniz yok');
    res.redirect('/dashboard');
};

// Premium kontrolü
const ensurePremium = (req, res, next) => {
    if (req.isAuthenticated()) {
        if (req.user.premium_mi && (!req.user.premium_bitis || new Date(req.user.premium_bitis) > new Date())) {
            return next();
        }
        req.flash('error_msg', 'Bu özellik sadece Premium üyeler içindir');
        res.redirect('/dashboard');
        return;
    }
    req.flash('error_msg', 'Giriş yapmalısınız');
    res.redirect('/auth/giris');
};

// API için auth kontrolü
const ensureAuthenticatedAPI = (req, res, next) => {
    if (req.isAuthenticated()) {
        if (req.user.banlandi_mi) {
            return res.status(403).json({ success: false, message: 'Hesabınız askıya alınmıştır' });
        }
        return next();
    }
    res.status(401).json({ success: false, message: 'Oturum açmanız gerekiyor' });
};

// API için admin kontrolü
const ensureAdminAPI = (req, res, next) => {
    if (req.isAuthenticated() && ['admin', 'superadmin'].includes(req.user.rol)) {
        return next();
    }
    res.status(403).json({ success: false, message: 'Yetkiniz yok' });
};

module.exports = {
    ensureAuthenticated,
    ensureGuest,
    ensureAdmin,
    ensureModerator,
    ensureSuperAdmin,
    ensurePremium,
    ensureAuthenticatedAPI,
    ensureAdminAPI
};
