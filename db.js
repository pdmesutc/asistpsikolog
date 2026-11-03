/**
 * AsistPsikolog - Merkezi Veritabanı, Yetkilendirme ve Senkronizasyon Motoru (db.js)
 * Şube, Oda, Uzman, Firma, Rol Bazlı Oturum (AsistAuth) ve ID Tabanlı İlişkisel Mimari
 */

const ASIST_DB_KEY = 'ASIST_PSIKOLOG_CENTRAL_DB_V2';
const ASIST_SESSION_KEY = 'ASIST_PSIKOLOG_AUTH_SESSION_V1';
const ASIST_GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const ASIST_VARSAYILAN_SAATLER = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

function asistTarihISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Başlangıç verisindeki örnek seanslar için tarih: bugün (Pazar ise ertesi gün)
function asistSeedTarihi() {
    let d = new Date();
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return asistTarihISO(d);
}

function asistVarsayilanTakvim() {
    return ASIST_GUNLER.map(g => ({
        gun: g,
        tatil: g === "Pazar",
        seciliSaatler: g === "Pazar" ? [] : ASIST_VARSAYILAN_SAATLER.slice()
    }));
}

// 12 haneli (90...) veya 11 haneli (0...) numaraları 10 haneye indirger
function asistTel10(raw) {
    let digits = String(raw === null || raw === undefined ? '' : raw).replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits;
}

function asistTelGorunum(tel10) {
    return tel10.length === 10
        ? `0(${tel10.slice(0, 3)}) ${tel10.slice(3, 6)} ${tel10.slice(6, 8)} ${tel10.slice(8, 10)}`
        : tel10;
}

const SEED_TARIHI = asistSeedTarihi();

const DEFAULT_ASIST_DB = {
    yoneticiler: [
        { id: 1, ad: "Klinik Psk. Mesut ÇAKIR", tel: "5321110009", telGorunum: "0(532) 111 00 09", mail: "mesut@herapsikoloji.com", sifre: "123456", durum: "aktif" },
        { id: 2, ad: "Klinik Psk. İshak BÜYÜKYILDIRIM", tel: "5321110008", telGorunum: "0(532) 111 00 08", mail: "ishak@herapsikoloji.com", sifre: "123456", durum: "aktif" }
    ],
    subeler: [
        { 
            id: 1, 
            adi: "Pendik Merkez Şube", 
            adres: "Batı Mah. Erol Kaya Cad. No: 12", 
            saatBaslangic: "09:00", 
            saatBitis: "21:00", 
            durum: "aktif", 
            odalar: [
                { id: "pnd_oda_1", adi: "1. Yetişkin Odası", tip: "yetiskin" },
                { id: "pnd_oda_2", adi: "2. Yetişkin Odası", tip: "yetiskin" },
                { id: "pnd_oda_3", adi: "1. Oyun Odası", tip: "cocuk" }
            ] 
        },
        { 
            id: 2, 
            adi: "Kartal Şube", 
            adres: "Merkez Mah. Ankara Cad.", 
            saatBaslangic: "09:00", 
            saatBitis: "20:00", 
            durum: "aktif", 
            odalar: [
                { id: "krtl_oda_1", adi: "1. Yetişkin Odası", tip: "yetiskin" },
                { id: "krtl_oda_2", adi: "2. Oyun Odası", tip: "cocuk" }
            ] 
        }
    ],
    asistanlar: [
        { id: 1, ad: "Pendik Asistan", tel: "5076012945", telGorunum: "0(507) 601 29 45", mail: "herapendik@asistpsikolog.com", sifre: "123456", subeId: 1, durum: "aktif" },
        { id: 2, ad: "Nilüfer Akpınar", tel: "5347758745", telGorunum: "0(534) 775 87 45", mail: "herakartal@asistpsikolog.com", sifre: "123456", subeId: 2, durum: "aktif" }
    ],
    psikologlar: [
        { id: 1, ad: "Uzm. Psk. Nurperi HASTÜRK", tel: "5059283434", telGorunum: "0(505) 928 34 34", mail: "nurperi@herapsikoloji.com", sifre: "123456", subeIds: [1, 2], alanlar: ["Çocuk", "Ergen"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true },
        { id: 2, ad: "Psk. Ayşegül CAMCI", tel: "5321110002", telGorunum: "0(532) 111 00 02", mail: "aysegul@herapsikoloji.com", sifre: "123456", subeIds: [1, 2], alanlar: ["Çocuk", "Ergen", "Yetişkin"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true },
        { id: 3, ad: "Psk. Rabia GEDİK", tel: "5321110003", telGorunum: "0(532) 111 00 03", mail: "rabia@herapsikoloji.com", sifre: "123456", subeIds: [1, 2], alanlar: ["Çocuk", "Ergen"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: false },
        { id: 4, ad: "Psk. Selin AKYÜREK", tel: "5321110004", telGorunum: "0(532) 111 00 04", mail: "selin@herapsikoloji.com", sifre: "123456", subeIds: [1], alanlar: ["Çocuk", "Ergen"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: false },
        { id: 5, ad: "Uzm. Psk. Sümeyye Nur TÜRKOĞLU", tel: "5321110005", telGorunum: "0(532) 111 00 05", mail: "sumeyye@herapsikoloji.com", sifre: "123456", subeIds: [1], alanlar: ["Çocuk", "Ergen", "Yetişkin"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true },
        { id: 6, ad: "Psk. Beyzanur KARATAŞ", tel: "5321110006", telGorunum: "0(532) 111 00 06", mail: "beyzanur@herapsikoloji.com", sifre: "123456", subeIds: [2], alanlar: ["Çocuk", "Ergen"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: false },
        { id: 7, ad: "Uzm. Psk. Betül MATUR", tel: "5321110007", telGorunum: "0(532) 111 00 07", mail: "betul@herapsikoloji.com", sifre: "123456", subeIds: [2], alanlar: ["Ergen", "Yetişkin"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true },
        { id: 8, ad: "Klinik Psk. İshak BÜYÜKYILDIRIM", tel: "5321110008", telGorunum: "0(532) 111 00 08", mail: "ishak@herapsikoloji.com", sifre: "123456", subeIds: [1, 2], alanlar: ["Çocuk", "Ergen", "Yetişkin", "Çift"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true },
        { id: 9, ad: "Klinik Psk. Mesut ÇAKIR", tel: "5321110009", telGorunum: "0(532) 111 00 09", mail: "mesut@herapsikoloji.com", sifre: "123456", subeIds: [2], alanlar: ["Ergen", "Yetişkin"], oranKendi: 30, oranYonlendirme: 50, durum: "aktif", sms: true, telGor: true }
    ],
    firmalar: [
        { id: 1, adi: "Goodyear Sakarya Fabrikası", subeIds: [1, 2], uzmanIds: [8, 1], tumUzmanlar: false, durum: "aktif" },
        { id: 2, adi: "Pendik Belediyesi İştirak", subeIds: [1], uzmanIds: [], tumUzmanlar: true, durum: "aktif" }
    ],
    danisanlar: [
        { id: 8, ad: "Tuğba UYSAL", tel: "5377851727", subeId: 1, firmaId: null },
        { id: 9, ad: "Emir", tel: "5348858666", subeId: 1, firmaId: null },
        { id: 11, ad: "Ali Tayyar ÖZKUL", tel: "5530022612", subeId: 1, firmaId: null },
        { id: 60, ad: "Kayra Umut Aslan", tel: "5058336492", subeId: 1, firmaId: 1 },
        { id: 34, ad: "Merve Erkan", tel: "5387268488", subeId: 1, firmaId: null }
    ],
    seanslar: [
        { id: 1, subeId: 1, tarih: SEED_TARIHI, saat: "10:00", danisanId: 8, basvuruTuru: "ofis", firmaId: null, hizmet: "Yetişkin", uzmanId: 8, odaId: "pnd_oda_1", ucret: 1500, ofisOranSnapshot: 50, durum: "odendi", odemeTipi: "nakit", iptalSebebi: "" },
        { id: 2, subeId: 1, tarih: SEED_TARIHI, saat: "11:00", danisanId: 11, basvuruTuru: "ofis", firmaId: null, hizmet: "Yetişkin", uzmanId: 8, odaId: "pnd_oda_1", ucret: 1500, ofisOranSnapshot: 50, durum: "bekliyor", odemeTipi: "", iptalSebebi: "" },
        { id: 3, subeId: 1, tarih: SEED_TARIHI, saat: "14:00", danisanId: 60, basvuruTuru: "firma", firmaId: 1, hizmet: "Çocuk", uzmanId: 1, odaId: "pnd_oda_3", ucret: 0, ofisOranSnapshot: 0, durum: "odendi", odemeTipi: "firma_cari", iptalSebebi: "" },
        { id: 4, subeId: 1, tarih: SEED_TARIHI, saat: "16:00", danisanId: 34, basvuruTuru: "kendi", firmaId: null, hizmet: "Yetişkin", uzmanId: 2, odaId: "pnd_oda_2", ucret: 1500, ofisOranSnapshot: 30, durum: "iptal", odemeTipi: "", iptalSebebi: "İş yoğunluğu nedeniyle gelemedi" }
    ],
    uzmanCalismaSaatleri: {
        "8_1": [
            { gun: "Pazartesi", tatil: false, seciliSaatler: ["10:00", "11:00", "12:00", "13:00", "14:00"] },
            { gun: "Salı", tatil: false, seciliSaatler: ["10:00", "11:00", "14:00", "15:00"] },
            { gun: "Çarşamba", tatil: false, seciliSaatler: ["10:00", "11:00", "14:00", "15:00", "16:00"] },
            { gun: "Perşembe", tatil: false, seciliSaatler: ["10:00", "11:00", "14:00", "15:00"] },
            { gun: "Cuma", tatil: false, seciliSaatler: ["10:00", "11:00", "14:00", "15:00"] },
            { gun: "Cumartesi", tatil: false, seciliSaatler: ["10:00", "11:00", "12:00", "13:00", "14:00"] },
            { gun: "Pazar", tatil: true, seciliSaatler: [] }
        ]
    }
};

function asistNormalizeDb(db) {
    let degisti = false;
    ['subeler', 'asistanlar', 'psikologlar', 'firmalar', 'danisanlar', 'seanslar'].forEach(k => {
        if (!Array.isArray(db[k])) { db[k] = []; degisti = true; }
    });
    if (!Array.isArray(db.yoneticiler) || db.yoneticiler.length === 0) {
        db.yoneticiler = JSON.parse(JSON.stringify(DEFAULT_ASIST_DB.yoneticiler));
        degisti = true;
    }
    if (!db.uzmanCalismaSaatleri || typeof db.uzmanCalismaSaatleri !== 'object') {
        db.uzmanCalismaSaatleri = {}; degisti = true;
    }

    db.subeler.forEach(s => {
        if (!Array.isArray(s.odalar)) { s.odalar = []; degisti = true; }
        if (!s.saatBaslangic) { s.saatBaslangic = "09:00"; degisti = true; }
        if (!s.saatBitis) { s.saatBitis = "21:00"; degisti = true; }
        if (!s.durum) { s.durum = "aktif"; degisti = true; }
        s.odalar.forEach(o => {
            if (!o.tip) { o.tip = /oyun|çocuk|cocuk/i.test(o.adi || '') ? 'cocuk' : 'yetiskin'; degisti = true; }
        });
    });

    db.asistanlar.forEach(a => {
        if (!a.durum) { a.durum = "aktif"; degisti = true; }
        if (!a.sifre) { a.sifre = "123456"; degisti = true; }
    });

    db.psikologlar.forEach(p => {
        if (!p.durum) { p.durum = "aktif"; degisti = true; }
        if (!p.sifre) { p.sifre = "123456"; degisti = true; }
        if (!Array.isArray(p.subeIds)) { p.subeIds = []; degisti = true; }
        if (!Array.isArray(p.alanlar)) { p.alanlar = []; degisti = true; }
        p.subeIds.forEach(sid => {
            let key = `${p.id}_${sid}`;
            if (!db.uzmanCalismaSaatleri[key]) {
                db.uzmanCalismaSaatleri[key] = asistVarsayilanTakvim();
                degisti = true;
            }
        });
    });

    db.firmalar.forEach(f => {
        if (!f.durum) { f.durum = "aktif"; degisti = true; }
        if (!Array.isArray(f.subeIds)) { f.subeIds = []; degisti = true; }
        if (!Array.isArray(f.uzmanIds)) { f.uzmanIds = []; degisti = true; }
        if (typeof f.tumUzmanlar !== 'boolean') { f.tumUzmanlar = true; degisti = true; }
    });

    [db.yoneticiler, db.asistanlar, db.psikologlar, db.danisanlar].forEach(liste => {
        liste.forEach(k => {
            let t = asistTel10(k.tel);
            if (t.length === 10 && t !== k.tel) { k.tel = t; degisti = true; }
            if (('telGorunum' in k) && t.length === 10 && k.telGorunum !== asistTelGorunum(t)) {
                k.telGorunum = asistTelGorunum(t); degisti = true;
            }
        });
    });

    return degisti;
}

asistNormalizeDb(DEFAULT_ASIST_DB);

const AsistDB = {
    _klon: function(obj) {
        return (typeof structuredClone === 'function') ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
    },

    _yaz: function(db) {
        try {
            localStorage.setItem(ASIST_DB_KEY, JSON.stringify(db));
            return true;
        } catch (e) {
            console.error("DB yazma hatası:", e);
            return false;
        }
    },

    yeniId: function() {
        return Date.now() * 1000 + Math.floor(Math.random() * 1000);
    },

    normalizeTel: asistTel10,

    get: function() {
        const raw = localStorage.getItem(ASIST_DB_KEY);
        if (!raw) {
            const varsayilan = this._klon(DEFAULT_ASIST_DB);
            this._yaz(varsayilan);
            return varsayilan;
        }
        try {
            const db = JSON.parse(raw);
            if (!db || typeof db !== 'object') throw new Error("Geçersiz veri yapısı");
            if (asistNormalizeDb(db)) this._yaz(db);
            return db;
        } catch (e) {
            console.error("DB Parse Hatası, varsayılana dönülüyor:", e);
            try { localStorage.setItem(ASIST_DB_KEY + '_BOZUK_YEDEK', raw); } catch (e2) {}
            const varsayilan = this._klon(DEFAULT_ASIST_DB);
            this._yaz(varsayilan);
            return varsayilan;
        }
    },

    save: function(data) {
        asistNormalizeDb(data);
        if (!this._yaz(data)) {
            alert("⚠️ Veriler kaydedilemedi (tarayıcı depolama alanı dolu veya erişilemiyor). Lütfen işlemi tekrar deneyin.");
            return false;
        }
        window.dispatchEvent(new CustomEvent('asist-db-updated', { detail: data }));
        return true;
    },

    reset: function() {
        const varsayilan = this._klon(DEFAULT_ASIST_DB);
        this._yaz(varsayilan);
        window.dispatchEvent(new CustomEvent('asist-db-updated', { detail: varsayilan }));
    },

    resolveSeans: function(seans, dbInstance = null) {
        let db = dbInstance || this.get();
        let sube = db.subeler.find(s => s.id === seans.subeId);
        let danisan = db.danisanlar.find(d => d.id === seans.danisanId);
        let uzman = db.psikologlar.find(p => p.id === seans.uzmanId);
        let oda = sube ? sube.odalar.find(o => o.id === seans.odaId) : null;
        let firma = seans.firmaId ? db.firmalar.find(f => f.id === seans.firmaId) : null;

        return {
            ...seans,
            subeAdi: sube ? sube.adi : "Silinmiş Şube",
            danisanAdi: danisan ? danisan.ad : "Silinmiş Danışan",
            danisanTel: danisan ? danisan.tel : "",
            uzmanAdi: uzman ? uzman.ad : "Silinmiş Uzman",
            odaAdi: oda ? oda.adi : "Silinmiş Oda",
            firmaAdi: firma ? firma.adi : ""
        };
    }
};

// ==========================================
// ROL BAZLI OTURUM VE YETKİLENDİRME MOTORU
// ==========================================
const AsistAuth = {
    getSession: function() {
        try {
            const raw = localStorage.getItem(ASIST_SESSION_KEY);
            if (!raw) return null;
            const sess = JSON.parse(raw);
            if (!sess || !sess.rol || !sess.userId) return null;
            return sess;
        } catch (e) {
            return null;
        }
    },

    hedefSayfa: function(session) {
        if (!session) return 'giris.html';
        if (session.rol === 'yonetici') return 'yonetici-paneli.html';
        if (session.rol === 'asistan') return `asistan-paneli.html?subeId=${session.subeId || 1}`;
        if (session.rol === 'psikolog') return `psikolog-paneli.html?uzmanId=${session.userId}`;
        return 'index.html';
    },

    login: function(kimlik, sifre, rol) {
        const db = AsistDB.get();
        const kTemiz = String(kimlik || '').trim().toLowerCase();
        const kTel = asistTel10(kimlik);
        const sTemiz = String(sifre || '').trim();

        if (!kTemiz || !sTemiz) {
            return { basarili: false, mesaj: "Lütfen kullanıcı bilgisi (e-posta/telefon) ve şifrenizi giriniz." };
        }

        let liste = [];
        if (rol === 'yonetici') liste = db.yoneticiler || [];
        else if (rol === 'asistan') liste = db.asistanlar || [];
        else if (rol === 'psikolog') liste = db.psikologlar || [];
        else return { basarili: false, mesaj: "Geçersiz giriş rolü seçildi." };

        const kullanici = liste.find(u => {
            const mailEslesme = u.mail && String(u.mail).trim().toLowerCase() === kTemiz;
            const telEslesme = kTel.length === 10 && asistTel10(u.tel) === kTel;
            return mailEslesme || telEslesme;
        });

        if (!kullanici) {
            return { basarili: false, mesaj: "Bu rol için girilen e-posta veya telefon numarasıyla kayıtlı kullanıcı bulunamadı." };
        }

        if (kullanici.durum === 'pasif') {
            return { basarili: false, mesaj: "Bu kullanıcı hesabı pasif (arşiv) durumdadır. Lütfen yönetici ile iletişime geçiniz." };
        }

        const kayitliSifre = String(kullanici.sifre || '123456');
        if (kayitliSifre !== sTemiz) {
            return { basarili: false, mesaj: "Girdiğiniz şifre hatalıdır. Lütfen kontrol edip tekrar deneyiniz." };
        }

        const session = {
            rol: rol,
            userId: kullanici.id,
            ad: kullanici.ad,
            mail: kullanici.mail || '',
            tel: kullanici.tel || '',
            subeId: kullanici.subeId || null,
            subeIds: Array.isArray(kullanici.subeIds) ? kullanici.subeIds : (kullanici.subeId ? [kullanici.subeId] : []),
            girisZamani: new Date().toISOString()
        };

        try {
            localStorage.setItem(ASIST_SESSION_KEY, JSON.stringify(session));
        } catch (e) {
            return { basarili: false, mesaj: "Oturum kaydedilemedi (Tarayıcı depolama alanı kapalı)." };
        }

        return {
            basarili: true,
            session: session,
            hedefUrl: this.hedefSayfa(session)
        };
    },

    logout: function(yonlendirUrl = 'giris.html') {
        try {
            localStorage.removeItem(ASIST_SESSION_KEY);
        } catch (e) {}
        if (yonlendirUrl) {
            window.location.href = yonlendirUrl;
        }
    },

    requireAuth: function(izinliRoller = []) {
        const sess = this.getSession();
        if (!sess) {
            const istenenRol = izinliRoller.length === 1 ? izinliRoller[0] : (izinliRoller.find(r => r !== 'yonetici') || 'asistan');
            window.location.replace(`giris.html?rol=${istenenRol}`);
            return null;
        }
        if (Array.isArray(izinliRoller) && izinliRoller.length > 0 && !izinliRoller.includes(sess.rol)) {
            window.location.replace(this.hedefSayfa(sess));
            return null;
        }
        return sess;
    }
};