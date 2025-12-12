require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

// Database
const db = require('./config/database');

// Passport Config
require('./config/passport')(passport);

const app = express();

// EJS Setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Body Parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

// Flash Messages
app.use(flash());

// Global Variables
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.user || null;
    res.locals.baseUrl = process.env.BASE_URL;
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// 404 Handler
app.use((req, res) => {
    res.status(404).render('errors/404', { 
        title: 'Sayfa Bulunamadı',
        layout: 'layouts/main'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/500', { 
        title: 'Sunucu Hatası',
        layout: 'layouts/main'
    });
});

const PORT = process.env.PORT || 3000;

// Veritabanı tablolarını oluştur ve sunucuyu başlat
const initializeApp = async () => {
    try {
        await db.createTables();
        console.log('✅ Veritabanı tabloları hazır');
        
        app.listen(PORT, () => {
            console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
            console.log(`🌐 ${process.env.BASE_URL}`);
        });
    } catch (err) {
        console.error('❌ Başlatma hatası:', err);
        process.exit(1);
    }
};

initializeApp();

module.exports = app;
