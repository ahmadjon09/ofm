// ============================================================================
// SERVER.JS — Ombor va Savdo Boshqaruv Tizimi Backend API
// Node.js + Express.js + MongoDB (Mongoose) — Single File Architecture
// Bu fayl kelajakda models/, routes/, controllers/, middleware/, utils/
// papkalariga bo'linishga tayyor tarzda, aniq bo'limlarga ajratilgan holda yozilgan.
// ============================================================================

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import 'express-async-errors';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import axios from 'axios'
// import { startBot } from './bot.js';

// ============================================================================
// SECTION: ENVIRONMENT VALIDATION
// (future: utils/validateEnv.js)
// ============================================================================

const REQUIRED_ENV_VARS = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'PORT'];

function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`\x1b[31m[XATOLIK] Quyidagi .env o'zgaruvchilari topilmadi: ${missing.join(', ')}\x1b[0m`);
        process.exit(1);
    }
}

validateEnv();

const config = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
};

// ============================================================================
// SECTION: CONSOLE COLORS & STARTUP BANNER
// (future: utils/logger.js)
// ============================================================================

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
};

function printBanner() {
    console.log(`${colors.cyan}
 ██████╗ ███╗   ███╗██████╗  ██████╗ ██████╗
██╔═══██╗████╗ ████║██╔══██╗██╔═══██╗██╔══██╗
██║   ██║██╔████╔██║██████╔╝██║   ██║██████╔╝
██║   ██║██║╚██╔╝██║██╔══██╗██║   ██║██╔══██╗
╚██████╔╝██║ ╚═╝ ██║██████╔╝╚██████╔╝██║  ██║
 ╚═════╝ ╚═╝     ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝
${colors.reset}${colors.green}  Ombor va Savdo Boshqaruv Tizimi API${colors.reset}
${colors.yellow}  Muhit: ${config.nodeEnv} | Port: ${config.port}${colors.reset}
`);
}

// ============================================================================
// SECTION: DATABASE CONNECTION
// (future: config/database.js)
// ============================================================================

mongoose.set('strictQuery', true);

async function connectDatabase() {
    try {
        await mongoose.connect(config.mongoUri, {
            maxPoolSize: 20,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log(`${colors.green}[MongoDB] Ulanish muvaffaqiyatli o'rnatildi.${colors.reset}`);
    } catch (err) {
        console.error(`${colors.red}[MongoDB] Ulanishda xatolik: ${err.message}${colors.reset}`);
        process.exit(1);
    }
}

// Reconnect handling
mongoose.connection.on('disconnected', () => {
    console.warn(`${colors.yellow}[MongoDB] Ulanish uzildi. Qayta ulanishga urinilmoqda...${colors.reset}`);
});

mongoose.connection.on('reconnected', () => {
    console.log(`${colors.green}[MongoDB] Qayta ulandi.${colors.reset}`);
});

mongoose.connection.on('error', (err) => {
    console.error(`${colors.red}[MongoDB] Ulanish xatosi: ${err.message}${colors.reset}`);
});

// ============================================================================
// SECTION: CUSTOM ERROR CLASS & RESPONSE HELPERS
// (future: utils/ApiError.js, utils/response.js)
// ============================================================================

class ApiError extends Error {
    constructor(statusCode, message, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

function sendSuccess(res, statusCode, message, data = {}, meta = null) {
    const payload = { success: true, message, data };
    if (meta) payload.meta = meta;
    return res.status(statusCode).json(payload);
}

function sendError(res, statusCode, message, error = null) {
    return res.status(statusCode).json({ success: false, message, error });
}

// ============================================================================
// SECTION: VALIDATION HELPERS
// (future: utils/validators.js)
// ============================================================================

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function isValidPhone(phone) {
    // Uzbek phone format: +998XXXXXXXXX or 998XXXXXXXXX or 9-digit local
    return validator.isMobilePhone(String(phone).replace(/\s/g, ''), 'any') ||
        /^(\+?998)?[0-9]{9}$/.test(String(phone).replace(/\s/g, ''));
}

function requireFields(obj, fields) {
    const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
    return missing;
}

function parsePagination(query) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function buildMeta(total, page, limit) {
    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
    };
}

// ============================================================================
// SECTION: MODEL — Kassa (Kassa balansi + tranzaksiyalar tarixi)
// (future: models/Kassa.js, models/KassaTransaction.js)
// ============================================================================

// Kassaning har bir kirim/chiqim amali uchun tarix yozuvi (alohida kolleksiyada
// saqlanadi, shunda kassa hujjati o'zi yengil bo'lib qoladi va tarix cheksiz o'sishi mumkin).
const kassaTransactionSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, enum: ['KIRIM', 'CHIQIM'] },
        amount: { type: Number, required: true, min: 0.01 },
        // CHIQIM uchun: nimaga olingani. KIRIM uchun: izoh (masalan qarz to'lovi).
        reason: { type: String, default: '', trim: true },
        // Agar kirim mijoz to'lovidan bo'lsa — mijozga bog'lanadi.
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
        clientName: { type: String, default: null },
        // Amalni bajargan foydalanuvchi (kim bergani / kim olgani).
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        // Ushbu amaldan keyingi kassa balansi (tez ko'rish uchun keshlanadi).
        balanceAfter: { type: Number, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

kassaTransactionSchema.index({ createdAt: -1 });
kassaTransactionSchema.index({ type: 1 });
kassaTransactionSchema.index({ client: 1 });

const KassaTransaction = mongoose.model('KassaTransaction', kassaTransactionSchema);

// Kassa — bitta (singleton) hujjat, joriy balansni saqlaydi.
const kassaSchema = new mongoose.Schema(
    {
        balance: { type: Number, default: 0 },
    },
    { timestamps: true, versionKey: 'version' }
);

const Kassa = mongoose.model('Kassa', kassaSchema);

/**
 * Yagona kassa hujjatini qaytaradi, mavjud bo'lmasa yaratadi.
 */
async function getKassaDoc(session = null) {
    let kassa = await Kassa.findOne().session(session);
    if (!kassa) {
        const created = await Kassa.create([{ balance: 0 }], session ? { session } : undefined);
        kassa = created[0];
    }
    return kassa;
}

/**
 * Kassaga kirim (pul kelishi) qo'shadi — masalan mijoz qarzini to'lasa.
 * Kim (mijoz) qancha pul berganini tarixga yozadi.
 */
async function kassaAddIncome(amount, { client = null, clientName = null, note = '', user = null } = {}, session = null) {
    const kassa = await getKassaDoc(session);
    kassa.balance = (kassa.balance || 0) + amount;
    await kassa.save(session ? { session } : undefined);
    await KassaTransaction.create(
        [{ type: 'KIRIM', amount, reason: note, client, clientName, user, balanceAfter: kassa.balance }],
        session ? { session } : undefined
    );
    return kassa;
}

/**
 * Kassadan chiqim (pul chiqishi) qiladi — nimaga va necha pul olinganini tarixga yozadi.
 */
async function kassaAddExpense(amount, { reason = '', user = null } = {}, session = null) {
    const kassa = await getKassaDoc(session);
    kassa.balance = (kassa.balance || 0) - amount;
    await kassa.save(session ? { session } : undefined);
    await KassaTransaction.create(
        [{ type: 'CHIQIM', amount, reason, user, balanceAfter: kassa.balance }],
        session ? { session } : undefined
    );
    return kassa;
}

// ============================================================================
// SECTION: MODEL — User
// (future: models/User.js)
// ============================================================================

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, unique: true, trim: true },
        password: { type: String, required: true, minlength: 6, select: false },
        role: { type: String, enum: ['admin', 'manager', 'worker'], default: 'worker' },
        isActive: { type: Boolean, default: true },
        // Telegram bot orqali "raqamni ulashish" bosilgach shu yerga yoziladi.
        // Shu maydon orqali bot foydalanuvchini keyingi safar avtomatik tanib oladi.
        telegramId: { type: Number, default: null, index: true, sparse: true, unique: true },
        telegramLinkedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: 'version' }
);

userSchema.pre('save', async function hashPassword(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

const User = mongoose.model('User', userSchema);

// ============================================================================
// SECTION: MODEL — Product
// (future: models/Product.js)
// ============================================================================

const productSizeSchema = new mongoose.Schema(
    {
        size: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        boxes: { type: Number, required: true, min: 0, default: 0 },
        box_kg: { type: Number, required: true, min: 0 },
        total: { type: Number, default: 0 }, // auto = boxes * box_kg
    },
    { _id: true }
);

// Recalculate each size's total before validation runs
productSizeSchema.pre('validate', function calcSizeTotal(next) {
    this.total = (this.boxes || 0) * (this.box_kg || 0);
    next();
});

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        sizes: {
            type: [productSizeSchema],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length > 0,
                message: "Kamida bitta o'lcham (size) kiritilishi shart.",
            },
        },
    },
    { timestamps: true, versionKey: 'version', toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });

// Recalculate every size's total before saving the parent document
productSchema.pre('save', function calcAllTotals(next) {
    this.sizes.forEach((s) => {
        s.total = (s.boxes || 0) * (s.box_kg || 0);
    });
    next();
});

// total = sum of all size.total (total kg across all sizes)
productSchema.virtual('total').get(function getTotalKg() {
    return (this.sizes || []).reduce((sum, s) => sum + (s.total || 0), 0);
});

// totalPrice = sum(size.total * size.price)
productSchema.virtual('totalPrice').get(function getTotalPrice() {
    return (this.sizes || []).reduce((sum, s) => sum + (s.total || 0) * (s.price || 0), 0);
});

const Product = mongoose.model('Product', productSchema);

// ============================================================================
// SECTION: MODEL — Client
// (future: models/Client.js)
// ============================================================================

const paymentHistorySchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        note: { type: String, default: '' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { _id: true }
);

const clientSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        debt: { type: Number, default: 0 },
        orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
        paymentHistory: [paymentHistorySchema],
    },
    { timestamps: true, versionKey: 'version', toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

clientSchema.index({ phone: 1 });
clientSchema.index({ name: 1 });

clientSchema.virtual('totalOrders').get(function getTotalOrders() {
    return (this.orders || []).length;
});

clientSchema.virtual('totalPaid').get(function getTotalPaid() {
    return (this.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
});

// remainingDebt mirrors the stored debt field (kept non-negative at all times)
clientSchema.virtual('remainingDebt').get(function getRemainingDebt() {
    return Math.max(this.debt || 0, 0);
});

/**
 * To'lov qo'shish va qarzni kamaytirish uchun instance method.
 * Qarz hech qachon manfiy bo'lmasligi ta'minlanadi.
 */
clientSchema.methods.addPayment = async function addPayment(amount, note, userId) {
    this.paymentHistory.push({ amount, note, user: userId, date: new Date() });
    this.debt = (this.debt || 0) - amount;
    await this.save();
    return this;
};

const Client = mongoose.model('Client', clientSchema);

// ============================================================================
// SECTION: MODEL — Order
// (future: models/Order.js)
// ============================================================================

const orderItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        productCategory: { type: String },
        size: { type: Number, required: true },
        quantityBoxes: { type: Number, required: true, min: 1 }, // qutilar (karobka) soni
        boxKg: { type: Number, required: true, min: 0 }, // bitta quti necha kg (savdo vaqtidagi qiymat)
        quantityKg: { type: Number, required: true, min: 0.01 },
        pricePerKg: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, default: 0 }, // auto = quantityKg * pricePerKg
    },
    { _id: true }
);

orderItemSchema.pre('validate', function calcSubtotal(next) {
    this.subtotal = (this.quantityKg || 0) * (this.pricePerKg || 0);
    next();
});

const orderSchema = new mongoose.Schema(
    {
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
        items: {
            type: [orderItemSchema],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length > 0,
                message: "Buyurtmada kamida bitta mahsulot bo'lishi shart.",
            },
        },
        orderTotal: { type: Number, default: 0 },
        // Jami ko'rsatkichlar — items massividan avtomatik hisoblanadi (pre('save') hook'da),
        // shunda har safar frontendda/hisobotda qayta yig'indi chiqarishga hojat qolmaydi.
        totalKg: { type: Number, default: 0 },       // barcha itemlar bo'yicha jami kg
        totalBoxes: { type: Number, default: 0 },    // barcha itemlar bo'yicha jami quti (karobka) soni
        status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, versionKey: 'version' }
);

orderSchema.index({ client: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

orderSchema.pre('save', function calcOrderTotal(next) {
    this.items.forEach((item) => {
        item.subtotal = (item.quantityKg || 0) * (item.pricePerKg || 0);
    });
    this.orderTotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
    this.totalKg = this.items.reduce((sum, item) => sum + (item.quantityKg || 0), 0);
    this.totalBoxes = this.items.reduce((sum, item) => sum + (item.quantityBoxes || 0), 0);
    next();
});

const Order = mongoose.model('Order', orderSchema);

// ============================================================================
// SECTION: MIDDLEWARE — Authentication & Authorization
// (future: middleware/auth.js)
// ============================================================================

function signAccessToken(user) {
    return jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function signRefreshToken(user) {
    return jwt.sign({ id: user._id }, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });
}

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(401, "Avtorizatsiya talab qilinadi.");
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            throw new ApiError(401, "Token muddati tugagan.");
        }
        throw new ApiError(401, "Token yaroqsiz.");
    }

    const user = await User.findById(decoded.id).select('name phone role isActive');
    if (!user) throw new ApiError(401, "Foydalanuvchi topilmadi.");
    if (!user.isActive) throw new ApiError(403, "Foydalanuvchi bloklangan.");

    req.user = user;
    next();
}

function authorize(...roles) {
    return function authorizeMiddleware(req, res, next) {
        if (!req.user) throw new ApiError(401, "Avtorizatsiya talab qilinadi.");
        if (!roles.includes(req.user.role)) {
            throw new ApiError(403, "Ushbu amal uchun ruxsatingiz yo'q.");
        }
        next();
    };
}

// ============================================================================
// SECTION: MIDDLEWARE — Rate Limiters (DDoS Protection)
// (future: middleware/rateLimiters.js)
// ============================================================================

const rateLimitHandler = (req, res) => {
    sendError(res, 429, "Juda ko'p so'rov yuborildi. Iltimos, birozdan so'ng qayta urinib ko'ring.");
};

const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});

const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
});
const authController = {
    async register(req, res) {
        const { name, phone, password, role } = req.body;

        const missing = requireFields(req.body, ['name', 'phone', 'password']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
        if (password.length < 6) throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak.");

        const existing = await User.findOne({ phone });
        if (existing) throw new ApiError(409, "Bu telefon raqami allaqachon ro'yxatdan o'tgan.");

        const user = await User.create({ name, phone, password, role: role || 'worker' });
        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        return sendSuccess(res, 201, "Muvaffaqiyatli ro'yxatdan o'tdingiz.", {
            user: user.toSafeObject(),
            accessToken,
            refreshToken,
        });
    },

    async login(req, res) {
        const { phone, password } = req.body;
        const missing = requireFields(req.body, ['phone', 'password']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);

        const user = await User.findOne({ phone }).select('+password name phone role isActive');
        if (!user) throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri.");
        if (!user.isActive) throw new ApiError(403, "Foydalanuvchi bloklangan.");

        const isMatch = await user.comparePassword(password);
        if (!isMatch) throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri.");

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        return sendSuccess(res, 200, "Muvaffaqiyatli tizimga kirdingiz.", {
            user: user.toSafeObject(),
            accessToken,
            refreshToken,
        });
    },

    async me(req, res) {
        const user = await User.findById(req.user._id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");
        return sendSuccess(res, 200, "Foydalanuvchi ma'lumotlari.", { user: user.toSafeObject() });
    },
};

// ============================================================================
// SECTION: CONTROLLER — Users (Admin CRUD)
// (future: controllers/userController.js)
// ============================================================================

const userController = {
    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, role } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Foydalanuvchilar ro'yxati.", { users }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        return sendSuccess(res, 200, "Foydalanuvchi topildi.", { user: user.toSafeObject() });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, phone, role, isActive } = req.body;
        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        if (name) user.name = name;
        if (phone) {
            if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
            user.phone = phone;
        }
        if (role) user.role = role;
        if (typeof isActive === 'boolean') user.isActive = isActive;

        await user.save();


        return sendSuccess(res, 200, "Foydalanuvchi muvaffaqiyatli yangilandi.", { user: user.toSafeObject() });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        await User.findByIdAndDelete(id);

        return sendSuccess(res, 200, "Foydalanuvchi butunlay o'chirildi.");
    },
};

// ============================================================================
// SECTION: CONTROLLER — Products
// (future: controllers/productController.js)
// ============================================================================

const productController = {
    async create(req, res) {
        const { name, category, sizes } = req.body;
        const missing = requireFields(req.body, ['name', 'category', 'sizes']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!Array.isArray(sizes) || sizes.length === 0) {
            throw new ApiError(400, "Kamida bitta o'lcham (size) kiritilishi shart.");
        }

        const product = await Product.create({ name, category, sizes });


        return sendSuccess(res, 201, "Mahsulot muvaffaqiyatli yaratildi.", { product });
    },

    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, category, sort } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (search) filter.name = { $regex: search, $options: 'i' };

        const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { name: 1 } };
        const sortOption = sortMap[sort] || sortMap.newest;

        const [products, total] = await Promise.all([
            Product.find(filter).sort(sortOption).skip(skip).limit(limit).lean({ virtuals: true }),
            Product.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Mahsulotlar ro'yxati.", { products }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        return sendSuccess(res, 200, "Mahsulot topildi.", { product });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, category, sizes } = req.body;
        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        if (name) product.name = name;
        if (category) product.category = category;
        if (Array.isArray(sizes) && sizes.length > 0) product.sizes = sizes;

        await product.save();


        return sendSuccess(res, 200, "Mahsulot muvaffaqiyatli yangilandi.", { product });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        await Product.findByIdAndDelete(id);

        return sendSuccess(res, 200, "Mahsulot butunlay o'chirildi.");
    },
};

// ============================================================================
// SECTION: CONTROLLER — Clients
// (future: controllers/clientController.js)
// ============================================================================

const clientController = {
    async create(req, res) {
        const { name, phone, debt } = req.body;
        const missing = requireFields(req.body, ['name', 'phone']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");

        const client = await Client.create({ name, phone, debt });


        return sendSuccess(res, 201, "Mijoz muvaffaqiyatli yaratildi.", { client });
    },

    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search } = req.query;

        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const [clients, total] = await Promise.all([
            Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
            Client.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Mijozlar ro'yxati.", { clients }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id).populate('orders', 'orderTotal status createdAt');
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        return sendSuccess(res, 200, "Mijoz topildi.", { client });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, phone, debt } = req.body;
        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        if (name) client.name = name;
        if (phone) {
            if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
            client.phone = phone;
        }
        if (debt) client.debt = debt

        await client.save();

        return sendSuccess(res, 200, "Mijoz muvaffaqiyatli yangilandi.", { client });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        await Client.findByIdAndDelete(id);

        return sendSuccess(res, 200, "Mijoz butunlay o'chirildi.");
    },

    /**
     * Mijoz qarzini to'lashi: qarz kamayadi va to'langan summa avtomatik
     * ravishda kassaga kirim sifatida qo'shiladi (kim, qancha to'lagani
     * kassa tarixida ko'rinib turadi).
     */
    async addPayment(req, res) {
        const { id } = req.params;
        const { amount, note } = req.body;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (!amount || amount <= 0) throw new ApiError(400, "To'lov summasi noto'g'ri.");

        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        await client.addPayment(amount, note || '', req.user._id);
        const kassa = await kassaAddIncome(amount, {
            client: client._id,
            clientName: client.name,
            note: `${client.name}\n${note}` || `${client.name} tomonidan qarz to'lovi`,
            user: req.user._id,
        });
        return sendSuccess(res, 200, "Qarz muvaffaqiyatli to'landi.", { client, kassaBalance: kassa.balance });
    },

    async paymentHistory(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id).select('name paymentHistory').populate('paymentHistory.user', 'name');
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        return sendSuccess(res, 200, "To'lovlar tarixi.", { paymentHistory: client.paymentHistory });
    },
};

// ============================================================================
// SECTION: CONTROLLER — Orders
// (future: controllers/orderController.js)
// ============================================================================

const orderController = {

    /**
     * Buyurtma yaratish:
     * - Bir nechta mahsulot/o'lcham bo'lishi mumkin
     * - Har bir item uchun stock yetarliligini tekshiradi (quti soni bo‘yicha)
     * - Stockni kamaytiradi (qutilar sonini va total kg ni), mijoz qarzini oshiradi
     * - Yetarli bo'lmasa — MongoDB transaction orqali to'liq rollback
     */
    async create(req, res) {
        const { clientId, items, addToDebt } = req.body;

        const missing = requireFields(req.body, ['clientId', 'items']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidObjectId(clientId)) throw new ApiError(400, "Noto'g'ri mijoz ID.");
        if (!Array.isArray(items) || items.length === 0) {
            throw new ApiError(400, "Buyurtmada kamida bitta mahsulot bo'lishi shart.");
        }

        const session = await mongoose.startSession();
        let createdOrder;

        try {
            await session.withTransaction(async () => {
                const client = await Client.findById(clientId).session(session);
                if (!client) throw new ApiError(404, "Mijoz topilmadi.");

                const orderItems = [];

                for (const reqItem of items) {
                    const { productId, size, quantityBoxes, pricePerKg } = reqItem;
                    if (!isValidObjectId(productId)) throw new ApiError(400, "Noto'g'ri mahsulot ID.");
                    if (!Number.isInteger(quantityBoxes) || quantityBoxes <= 0) {
                        throw new ApiError(400, "Qutilar soni (quantityBoxes) musbat butun son bo'lishi kerak.");
                    }

                    const product = await Product.findById(productId).session(session);
                    if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

                    const sizeEntry = product.sizes.find((s) => s.size === Number(size));
                    if (!sizeEntry) throw new ApiError(404, `Ushbu mahsulotda ${size} o'lcham topilmadi.`);

                    if (sizeEntry.boxes < quantityBoxes) {
                        throw new ApiError(400, `Stok yetarli emas: ${product.name} (${size}). Mavjud qutilar: ${sizeEntry.boxes}.`);
                    }

                    // Hisob-kitob: buyurtma qilinayotgan kg miqdori
                    const quantityKg = quantityBoxes * sizeEntry.box_kg;

                    // Narx: agar frontdan yuborilgan bo'lsa, o'shani, aks holda o'lcham narxi
                    let finalPricePerKg = sizeEntry.price;
                    if (pricePerKg !== undefined && pricePerKg !== null && pricePerKg !== '') {
                        finalPricePerKg = Number(pricePerKg);
                        if (Number.isNaN(finalPricePerKg) || finalPricePerKg < 0) {
                            throw new ApiError(400, "Narx (pricePerKg) noto'g'ri.");
                        }
                    }

                    // Stokni qutilar soni bo‘yicha kamaytirish (total pre('save') hook'da qayta hisoblanadi)
                    sizeEntry.boxes -= quantityBoxes;
                    await product.save({ session });

                    orderItems.push({
                        product: product._id,
                        productName: product.name,
                        productCategory: product.category,
                        size: sizeEntry.size,
                        quantityBoxes,        // qutilar (karobka) soni — hisobotda KAR ustuni
                        boxKg: sizeEntry.box_kg, // bitta quti necha kg (savdo vaqtidagi qiymat)
                        quantityKg,          // saqlanadigan kg miqdori
                        pricePerKg: finalPricePerKg,
                    });
                }

                const [order] = await Order.create(
                    [
                        {
                            client: client._id,
                            items: orderItems,
                            createdBy: req.user._id,
                        },
                    ],
                    { session }
                );

                if (addToDebt !== false) {
                    client.debt = (client.debt || 0) + order.orderTotal;
                }
                client.orders.push(order._id);
                await client.save({ session });

                createdOrder = order;
            });
        } finally {
            session.endSession();
        }

        return sendSuccess(res, 201, "Buyurtma yaratildi.", { order: createdOrder });
    },

    /**
     * Buyurtmalar ro‘yxati (filtrlash va sahifalash bilan)
     */
    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { status, clientId, from, to } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (clientId && isValidObjectId(clientId)) filter.client = clientId;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate('client', 'name phone debt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Buyurtmalar ro'yxati.", { orders }, buildMeta(total, page, limit));
    },

    /**
     * Bitta buyurtmani ID bo‘yicha olish
     */
    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const order = await Order.findById(id)
            .populate('client', 'name phone')
            .populate('createdBy', 'name');
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        return sendSuccess(res, 200, "Buyurtma topildi.", { order });
    },

    /**
     * Buyurtma holatini yangilash (pending / completed / cancelled)
     * Eslatma: bekor qilishda stockni qaytarish hozircha qo‘shilmagan, kerak bo‘lsa qo‘shish mumkin.
     */
    async updateStatus(req, res) {
        const { id } = req.params;
        const { status } = req.body;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (!['pending', 'completed', 'cancelled'].includes(status)) {
            throw new ApiError(400, "Noto'g'ri holat qiymati.");
        }

        const order = await Order.findById(id);
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        order.status = status;
        await order.save();

        return sendSuccess(res, 200, "Buyurtma holati yangilandi.", { order });
    },

    /**
     * Buyurtmani butunlay o‘chirish (qaytarib bo‘lmaydi)
     */
    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const order = await Order.findById(id);
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        await Order.findByIdAndDelete(id);

        return sendSuccess(res, 200, "Buyurtma butunlay o'chirildi.");
    },
};

// ============================================================================
// SECTION: CONTROLLER — Kassa
// (future: controllers/kassaController.js)
// ============================================================================

const kassaController = {
    /**
     * Joriy kassa balansini qaytaradi (kassada nech pul borligi).
     */
    async get(req, res) {
        const kassa = await getKassaDoc();
        return sendSuccess(res, 200, "Kassa ma'lumotlari.", { balance: kassa.balance });
    },

    /**
     * Kassa tarixi: kim qancha pul bergani (KIRIM) va nimaga qancha
     * pul olingani (CHIQIM) — sahifalab ko'rsatiladi, eng yangisi birinchi.
     */
    async history(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, from, to } = req.query;

        const filter = {};
        if (type && ['KIRIM', 'CHIQIM'].includes(type)) filter.type = type;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const [history, total, kassa] = await Promise.all([
            KassaTransaction.find(filter)
                .populate('client', 'name phone')
                .populate('user', 'name role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            KassaTransaction.countDocuments(filter),
            getKassaDoc(),
        ]);

        return sendSuccess(
            res,
            200,
            "Kassa tarixi.",
            { history, balance: kassa.balance },
            buildMeta(total, page, limit)
        );
    },

    /**
     * Kassadan chiqim (pul olib chiqish): nimaga va necha pul
     * olinganini majburiy kiritish talab qilinadi.
     */
    async expense(req, res) {
        const { amount, reason } = req.body;
        if (!amount || amount <= 0) throw new ApiError(400, "Chiqim summasi noto'g'ri.");
        if (!reason || !String(reason).trim()) {
            throw new ApiError(400, "Chiqim sababi (nimaga olingani) kiritilishi shart.");
        }

        const kassa = await getKassaDoc();
        if (kassa.balance < amount) {
            throw new ApiError(400, `Kassada yetarli mablag' yo'q. Joriy balans: ${kassa.balance}.`);
        }

        const updated = await kassaAddExpense(amount, { reason: String(reason).trim(), user: req.user._id });

        return sendSuccess(res, 200, "Chiqim muvaffaqiyatli yozildi.", { balance: updated.balance });
    },

    async income(req, res) {
        const { amount, source } = req.body;

        // 1. Validatsiya
        if (!amount || amount <= 0) {
            throw new ApiError(400, "Kirim summasi musbat son bo‘lishi shart.");
        }
        if (!source || !String(source).trim()) {
            throw new ApiError(400, "Kirim manbasi (kimdan yoki nima uchun) kiritilishi shart.");
        }

        // 2. Kassani topib, balansni oshiramiz
        const kassa = await getKassaDoc();
        const updated = await kassaAddIncome(
            amount,
            {
                source: String(source).trim(),
                user: req.user._id,      // kim kiritgan
                // agar client (mijoz) bog‘lash kerak bo‘lsa, req.body.clientId ham qo‘shing
            }
        );

        // 3. Javob
        return sendSuccess(
            res,
            200,
            "Kirim muvaffaqiyatli yozildi.",
            { balance: updated.balance }
        );
    },
};

// ============================================================================
// SECTION: CONTROLLER — Dashboard Statistics
// (future: controllers/dashboardController.js)
// ============================================================================

const dashboardController = {
    async stats(req, res) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // Oxirgi 6 oy uchun boshlanish sanasi (grafik uchun)
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        // Oxirgi 30 kun uchun boshlanish sanasi
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

        const [
            totalProducts,
            totalClients,
            totalOrders,
            todaysOrders,
            monthlyOrders,
            lastMonthOrders,
            revenueAgg,
            lastMonthRevenueAgg,
            debtAgg,
            totalKgAgg,
            topProducts,
            latestOrders,
            monthlyTrend,
            dailyTrend,
            statusBreakdown,
            topClients,
        ] = await Promise.all([
            Product.countDocuments({}),
            Client.countDocuments({}),
            Order.countDocuments({}),
            Order.countDocuments({ createdAt: { $gte: startOfToday } }),
            Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
            Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ]),
            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
                    },
                },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ]),

            Client.aggregate([{ $group: { _id: null, total: { $sum: '$debt' } } }]),

            Product.aggregate([
                { $unwind: "$sizes" },
                {
                    $group: {
                        _id: null,
                        warehouseValue: {
                            $sum: {
                                $multiply: [
                                    { $ifNull: ["$sizes.total", 0] },
                                    { $ifNull: ["$sizes.price", 0] }
                                ]
                            }
                        },
                        warehouseKg: {
                            $sum: {
                                $ifNull: ["$sizes.total", 0]
                            }
                        }
                    }
                }
            ]),

            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.productName',
                        totalQuantityKg: { $sum: '$items.quantityKg' },
                        totalRevenue: { $sum: '$items.subtotal' },
                    },
                },
                { $sort: { totalQuantityKg: -1 } },
                { $limit: 5 },
            ]),

            Order.find({}).populate('client', 'name phone').sort({ createdAt: -1 }).limit(10).lean(),

            // 1) OYLIK TREND (oxirgi 6 oy) — Line/Bar chart uchun
            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: sixMonthsAgo },
                    },
                },
                {
                    $group: {
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                        revenue: { $sum: '$orderTotal' },
                        ordersCount: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),

            // 2) KUNLIK TREND (oxirgi 30 kun) — Line chart uchun
            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: thirtyDaysAgo },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' },
                        },
                        revenue: { $sum: '$orderTotal' },
                        ordersCount: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]),

            // 3) STATUS bo'yicha taqsimot — Pie/Donut chart uchun
            Order.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        total: { $sum: '$orderTotal' },
                    },
                },
            ]),

            // 4) Eng ko'p qarzdor / faol mijozlar TOP-5
            Client.find({})
                .sort({ debt: -1 })
                .limit(5)
                .select('name phone debt')
                .lean(),
        ]);

        // --- Yordamchi: oy nomlarini o'zbekchada chiqarish ---
        const monthNames = [
            'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
            'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
        ];

        // Oxirgi 6 oyning barcha oylarini (ma'lumot bo'lmasa ham 0 bilan) to'ldirish
        const monthlyTrendMap = new Map(
            monthlyTrend.map((m) => [`${m._id.year}-${m._id.month}`, m])
        );
        const monthlyRevenueTrend = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            const found = monthlyTrendMap.get(key);
            monthlyRevenueTrend.push({
                month: monthNames[d.getMonth()],
                year: d.getFullYear(),
                revenue: found?.revenue || 0,
                ordersCount: found?.ordersCount || 0,
            });
        }

        // Oxirgi 30 kunni kun-kun to'ldirish
        const dailyTrendMap = new Map(
            dailyTrend.map((d) => [`${d._id.year}-${d._id.month}-${d._id.day}`, d])
        );
        const dailyRevenueTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            const found = dailyTrendMap.get(key);
            dailyRevenueTrend.push({
                date: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
                revenue: found?.revenue || 0,
                ordersCount: found?.ordersCount || 0,
            });
        }

        // Status breakdown'ni chart uchun label/value ko'rinishiga o'tkazish
        const statusLabels = {
            pending: 'Kutilmoqda',
            processing: 'Jarayonda',
            completed: 'Bajarilgan',
            cancelled: 'Bekor qilingan',
        };
        const orderStatusChart = statusBreakdown.map((s) => ({
            status: s._id,
            label: statusLabels[s._id] || s._id,
            count: s.count,
            total: s.total,
        }));

        // TOP mahsulotlarni chart uchun label/value ko'rinishiga o'tkazish
        const topProductsChart = topProducts.map((p) => ({
            name: p._id,
            quantityKg: p.totalQuantityKg,
            revenue: p.totalRevenue,
        }));

        // O'sish foizini hisoblash (bu oy vs o'tgan oy)
        const currentRevenue = revenueAgg[0]?.total || 0;
        const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0
            ? Number((((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1))
            : (currentRevenue > 0 ? 100 : 0);

        const ordersGrowthPercent = lastMonthOrders > 0
            ? Number((((monthlyOrders - lastMonthOrders) / lastMonthOrders) * 100).toFixed(1))
            : (monthlyOrders > 0 ? 100 : 0);

        // FIX: warehouseValue va warehouseKg totalKgAgg massividan ajratib olinmagan edi
        const warehouseValue = totalKgAgg[0]?.warehouseValue || 0;
        const warehouseKg = totalKgAgg[0]?.warehouseKg || 0;

        return sendSuccess(res, 200, "Statistika ma'lumotlari.", {
            totalProducts,
            totalClients,
            totalOrders,
            todaysOrders,
            monthlyOrders,

            revenue: currentRevenue,

            totalDebt: debtAgg[0]?.total || 0,

            totalKg: warehouseKg,

            warehouseValue: warehouseValue,

            growth: {
                revenuePercent: revenueGrowthPercent,
                ordersPercent: ordersGrowthPercent,
                lastMonthRevenue,
                lastMonthOrders,
            },

            topProducts: topProductsChart,
            latestOrders,

            charts: {
                monthlyRevenueTrend,
                dailyRevenueTrend,
                orderStatusChart,
                topClientsByDebt: topClients,
            },
        });
    },
};


// ============================================================================
// SECTION: REPORTS — Oylik hisobotlar (Excel & PDF)
// (future: utils/reportHelpers.js, controllers/reportController.js)
// Bot orqali emas — to'g'ridan-to'g'ri API endpoint orqali ishlaydi:
//   GET /api/v1/reports/orders?month=iyul&year=2026&format=excel
//   GET /api/v1/reports/stock?format=pdf
//   GET /api/v1/reports/debts?format=excel
//   GET /api/v1/reports/summary?month=7&year=2026&format=pdf
// ============================================================================

const REPORT_COLORS = {
    headerBg: '1F4E78',
    tableHeaderBg: '2E75B6',
    stripeBg: 'F2F6FA',
    danger: 'C0392B',
};

const UZ_MONTHS = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const STATUS_LABELS_UZ = {
    pending: 'Kutilmoqda',
    completed: 'Bajarilgan',
    cancelled: 'Bekor qilingan',
};

/**
 * "iyul", "Iyul", "7", 7 kabi turli formatdagi oy qiymatini
 * 1-12 oraliqdagi raqamga aylantiradi. Berilmasa — joriy oy olinadi.
 */
function resolveMonthYear(query = {}) {
    const now = new Date();
    let m;

    if (query.month !== undefined && query.month !== null && String(query.month).trim() !== '') {
        const raw = String(query.month).trim().toLowerCase();
        if (/^\d+$/.test(raw)) {
            m = parseInt(raw, 10);
        } else {
            const idx = UZ_MONTHS.findIndex((name) => name === raw);
            if (idx === -1) {
                throw new ApiError(400, `Oy nomi tushunarsiz: "${query.month}". Masalan: iyul yoki 7.`);
            }
            m = idx + 1;
        }
    } else {
        m = now.getMonth() + 1;
    }

    if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw new ApiError(400, "Oy 1 dan 12 gacha (yoki oy nomi) bo'lishi kerak.");
    }

    let y = now.getFullYear();
    if (query.year !== undefined && query.year !== null && String(query.year).trim() !== '') {
        y = parseInt(query.year, 10);
        if (Number.isNaN(y)) throw new ApiError(400, "Yil noto'g'ri formatda.");
    }

    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const monthName = UZ_MONTHS[m - 1];

    return { month: m, year: y, monthName, start, end };
}

function resolveFormat(query = {}) {
    const format = String(query.format || 'excel').trim().toLowerCase();
    if (!['excel', 'xlsx', 'pdf'].includes(format)) {
        throw new ApiError(400, "format 'excel' yoki 'pdf' bo'lishi kerak.");
    }
    return format === 'xlsx' ? 'excel' : format;
}

function formatMoney(n) {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}

function setDownloadHeaders(res, filename, format) {
    const mime = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
}

// ---------------------------------------------------------------------------
// EXCEL: umumiy sarlavha stili (har bir sheet uchun bir xil ko'rinish)
// ---------------------------------------------------------------------------
function styleExcelTitle(sheet, title, subtitle, colSpan) {
    sheet.mergeCells(1, 1, 1, colSpan);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.headerBg}` } };
    sheet.getRow(1).height = 26;

    if (subtitle) {
        sheet.mergeCells(2, 1, 2, colSpan);
        const subCell = sheet.getCell(2, 1);
        subCell.value = subtitle;
        subCell.font = { italic: true, size: 10, color: { argb: 'FF555555' } };
        sheet.getRow(2).height = 18;
    }
}

function styleExcelHeaderRow(row) {
    row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.tableHeaderBg}` } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
}

function stripeExcelRow(row, index) {
    if (index % 2 === 0) {
        row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.stripeBg}` } };
        });
    }
}

// ---------------------------------------------------------------------------
// PDF: umumiy jadval chizuvchi yordamchi (pdfkit'da tayyor table yo'q)
// ---------------------------------------------------------------------------
function newPdfDoc() {
    return new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
}

function pdfHeader(doc, title, subtitle) {
    doc.rect(0, 0, doc.page.width, 68).fill(`#${REPORT_COLORS.headerBg}`);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17)
        .text(title, 40, 18, { width: doc.page.width - 80 });
    if (subtitle) {
        doc.font('Helvetica').fontSize(9)
            .text(subtitle, 40, 42, { width: doc.page.width - 80 });
    }
    doc.fillColor('#000000');
    doc.y = 86;
}

/**
 * columns: [{ key, label, width(0-1 nisbat), align }]
 * rows: [{ key: value, ... }]
 */
function drawPdfTable(doc, { columns, rows }) {
    const startX = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 20;
    let y = doc.y;

    function drawHeaderRow() {
        doc.rect(startX, y, tableWidth, rowHeight).fill(`#${REPORT_COLORS.tableHeaderBg}`);
        let x = startX;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
        columns.forEach((col) => {
            const w = tableWidth * col.width;
            doc.text(col.label, x + 4, y + 6, { width: w - 8, align: col.align || 'left' });
            x += w;
        });
        doc.fillColor('#000000');
        y += rowHeight;
    }

    drawHeaderRow();

    rows.forEach((row, idx) => {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
            doc.addPage();
            y = doc.page.margins.top;
            drawHeaderRow();
        }
        if (idx % 2 === 0) {
            doc.rect(startX, y, tableWidth, rowHeight).fill(`#${REPORT_COLORS.stripeBg}`);
        }
        doc.fillColor('#000000');
        let x = startX;
        doc.font('Helvetica').fontSize(8);
        columns.forEach((col) => {
            const w = tableWidth * col.width;
            const val = row[col.key] === undefined || row[col.key] === null ? '' : String(row[col.key]);
            doc.text(val, x + 4, y + 6, { width: w - 8, align: col.align || 'left' });
            x += w;
        });
        y += rowHeight;
    });

    doc.y = y + 14;
    return y;
}

function pdfSectionTitle(doc, text) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(`#${REPORT_COLORS.headerBg}`)
        .text(text, doc.page.margins.left, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.3);
}

function pdfSummaryLine(doc, text) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444444')
        .text(text, doc.page.margins.left, doc.y, { width: doc.page.width - 80 });
    doc.fillColor('#000000');
    doc.moveDown(0.6);
}

function pdfFooter(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7.5).fillColor('#999999').text(
            `Sahifa ${i + 1} / ${range.count}  •  Yaratilgan: ${new Date().toLocaleString('uz-UZ')}`,
            doc.page.margins.left,
            doc.page.height - 26,
            { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
    }
    doc.fillColor('#000000');
}

// ---------------------------------------------------------------------------
// MA'LUMOT YIG'UVCHI FUNKSIYALAR (data fetchers — barcha hisobotlar uchun umumiy)
// ---------------------------------------------------------------------------

async function fetchOrdersReportData({ start, end }) {
    const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
        .populate('client', 'name phone')
        .sort({ createdAt: 1 })
        .lean();

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + (o.orderTotal || 0), 0);
    const completed = orders.filter((o) => o.status === 'completed').length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const cancelled = orders.filter((o) => o.status === 'cancelled').length;
    const totalKg = orders.reduce(
        (s, o) => s + o.items.reduce((si, it) => si + (it.quantityKg || 0), 0),
        0
    );
    const totalBoxes = orders.reduce(
        (s, o) => s + o.items.reduce((si, it) => si + (it.quantityBoxes || 0), 0),
        0
    );

    return { orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes };
}

async function fetchStockReportData() {
    const products = await Product.find({}).sort({ category: 1, name: 1 }).lean({ virtuals: true });
    let totalKg = 0;
    let totalValue = 0;
    let totalBoxes = 0;
    const rows = [];

    products.forEach((p) => {
        (p.sizes || []).forEach((s) => {
            const value = (s.total || 0) * (s.price || 0);
            totalKg += s.total || 0;
            totalValue += value;
            totalBoxes += s.boxes || 0;
            rows.push({
                product: p.name,
                category: p.category,
                size: s.size,
                boxes: s.boxes,
                boxKg: s.box_kg,
                totalKg: s.total,
                price: s.price,
                value,
            });
        });
    });

    return { products, rows, totalKg, totalValue, totalBoxes };
}

async function fetchDebtsReportData() {
    const clients = await Client.find({}).sort({ debt: -1 }).lean({ virtuals: true });
    const totalDebt = clients.reduce((s, c) => s + (c.debt || 0), 0);
    const debtors = clients.filter((c) => (c.debt || 0) > 0);
    return { clients, debtors, totalDebt };
}

/**
 * Bitta mijozning barcha buyurtmalari + to'lov tarixini yig'ib, oylarga
 * guruhlaydi. Har oy: { key, monthName, year, items: [...], payments: [...] }.
 * items va payments createdAt/date bo'yicha xronologik tartiblangan.
 */
async function fetchClientLedgerData(clientId) {
    const client = await Client.findById(clientId).lean({ virtuals: true });
    if (!client) throw new ApiError(404, 'Mijoz topilmadi.');

    const orders = await Order.find({ client: clientId }).sort({ createdAt: 1 }).lean();

    const monthsMap = new Map(); // key "YYYY-MM" -> { year, month, monthName, items:[], payments:[] }

    function getBucket(date) {
        const y = date.getFullYear();
        const m = date.getMonth(); // 0-based
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (!monthsMap.has(key)) {
            monthsMap.set(key, { key, year: y, month: m + 1, monthName: UZ_MONTHS[m], items: [], payments: [] });
        }
        return monthsMap.get(key);
    }

    orders.forEach((order) => {
        const bucket = getBucket(new Date(order.createdAt));
        order.items.forEach((item) => {
            bucket.items.push({
                date: order.createdAt,
                productName: item.productName,
                size: item.size,
                quantityBoxes: item.quantityBoxes != null ? item.quantityBoxes : null,
                boxKg: item.boxKg != null ? item.boxKg : null,
                quantityKg: item.quantityKg,
                pricePerKg: item.pricePerKg,
                subtotal: item.subtotal,
            });
        });
    });

    (client.paymentHistory || []).forEach((p) => {
        const bucket = getBucket(new Date(p.date));
        bucket.payments.push({
            date: p.date,
            amount: p.amount,
            note: p.note || '',
        });
    });

    const months = Array.from(monthsMap.values()).sort((a, b) => (a.key < b.key ? -1 : 1));

    return { client, months };
}

// ---------------------------------------------------------------------------
// EXCEL GENERATORLARI
// ---------------------------------------------------------------------------

async function buildOrdersExcel({ month, year, monthName, orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`${monthName}_${year}`.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 4 }],
    });

    styleExcelTitle(
        sheet,
        `BUYURTMALAR HISOBOTI — ${monthName.toUpperCase()} ${year}`,
        `Jami buyurtmalar: ${totalOrders}  |  Jami summa: ${formatMoney(totalRevenue)} $  |  Jami: ${totalBoxes} quti / ${totalKg} kg  |  Bajarilgan: ${completed}  |  Kutilmoqda: ${pending}  |  Bekor qilingan: ${cancelled}`,
        11
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Sana', 'Mijoz', 'Telefon', 'Mahsulot', "O'lcham", 'Quti (dona)', "1 quti (kg)", 'Miqdor (kg)', 'Narx/kg', 'Summa', 'Status']);
    styleExcelHeaderRow(headerRow);

    const firstDataRow = sheet.rowCount + 1;
    let orderIndex = 0;
    orders.forEach((order) => {
        orderIndex += 1;
        order.items.forEach((item, i) => {
            const r = sheet.rowCount + 1;
            // Eski (boxKg qo'shilishidan oldingi) buyurtmalarda quti ma'lumoti bo'lmasligi mumkin.
            const hasBoxData = item.quantityBoxes != null && item.boxKg != null;
            const row = sheet.addRow([
                i === 0 ? orderIndex : '',
                i === 0 ? new Date(order.createdAt).toLocaleDateString('uz-UZ') : '',
                i === 0 ? (order.client?.name || '—') : '',
                i === 0 ? (order.client?.phone || '—') : '',
                item.productName,
                item.size,
                hasBoxData ? item.quantityBoxes : '',
                hasBoxData ? item.boxKg : '',
                hasBoxData ? { formula: `G${r}*H${r}` } : item.quantityKg,
                item.pricePerKg,
                { formula: `I${r}*J${r}` },
                i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            ]);
            row.getCell(9).numFmt = '#,##0.00';
            row.getCell(10).numFmt = '#,##0';
            row.getCell(11).numFmt = '#,##0';
            stripeExcelRow(row, orderIndex);
        });
    });
    const lastDataRow = sheet.rowCount;

    sheet.addRow([]);
    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow([
        '', '', '', '', '', '', { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }, 'JAMI:',
        { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }, '',
        { formula: `SUM(K${firstDataRow}:K${lastDataRow})` }, '',
    ]);
    totalRow.font = { bold: true };
    sheet.getCell(`I${totalRowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`K${totalRowNum}`).numFmt = '#,##0';

    sheet.columns = [
        { width: 5 }, { width: 12 }, { width: 22 }, { width: 15 },
        { width: 22 }, { width: 9 }, { width: 11 }, { width: 11 },
        { width: 12 }, { width: 11 }, { width: 15 }, { width: 14 },
    ];

    return workbook;
}

async function buildStockExcel({ rows, totalKg, totalValue, totalBoxes }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Ombordagi qoldiq');
    styleExcelTitle(
        sheet,
        "OMBORDAGI MAHSULOTLAR QOLDIG'I",
        `Jami: ${totalBoxes} quti / ${totalKg} kg  |  Jami qiymat: ${formatMoney(totalValue)} $  |  Sana: ${new Date().toLocaleDateString('uz-UZ')}`,
        8
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Mahsulot', 'Kategoriya', "O'lcham", 'Quti (dona)', "1 quti (kg)", 'Jami (kg)', 'Qiymat ($)']);
    styleExcelHeaderRow(headerRow);

    const firstDataRow = sheet.rowCount + 1;
    rows.forEach((r, idx) => {
        const rn = sheet.rowCount + 1;
        const row = sheet.addRow([
            idx + 1, r.product, r.category, r.size, r.boxes, r.boxKg,
            { formula: `E${rn}*F${rn}` }, { formula: `G${rn}*H${rn}` },
        ]);
        // Narx (r.price) yashirin holda H ustunidan keyin kerak — value = totalKg*price,
        // shu sabab qiymatni to'g'ridan-to'g'ri formuladan emas, narx orqali hisoblaymiz:
        row.getCell(8).value = { formula: `G${rn}*${r.price || 0}` };
        row.getCell(7).numFmt = '#,##0.00';
        row.getCell(8).numFmt = '#,##0';
        stripeExcelRow(row, idx + 1);
    });
    const lastDataRow = sheet.rowCount;

    sheet.addRow([]);
    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow([
        '', '', '', '', { formula: `SUM(E${firstDataRow}:E${lastDataRow})` }, 'JAMI:',
        { formula: `SUM(G${firstDataRow}:G${lastDataRow})` },
        { formula: `SUM(H${firstDataRow}:H${lastDataRow})` },
    ]);
    totalRow.font = { bold: true };
    sheet.getCell(`G${totalRowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`H${totalRowNum}`).numFmt = '#,##0';

    sheet.columns = [
        { width: 5 }, { width: 24 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 16 },
    ];

    return workbook;
}

async function buildDebtsExcel({ debtors, totalDebt }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Mijozlar qarzi');
    styleExcelTitle(
        sheet,
        'MIJOZLARNING QARZDORLIGI',
        `Qarzdor mijozlar soni: ${debtors.length}  |  Jami qarz: ${formatMoney(totalDebt)} $  |  Sana: ${new Date().toLocaleDateString('uz-UZ')}`,
        6
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Mijoz', 'Telefon', 'Jami buyurtma', "Jami to'langan", 'Qarz ($)']);
    styleExcelHeaderRow(headerRow);

    debtors.forEach((c, idx) => {
        const totalPaid = (c.paymentHistory || []).reduce((s, p) => s + (p.amount || 0), 0);
        const row = sheet.addRow([
            idx + 1, c.name, c.phone, (c.orders || []).length, formatMoney(totalPaid), formatMoney(c.debt),
        ]);
        stripeExcelRow(row, idx + 1);
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['', '', '', '', 'JAMI QARZ:', formatMoney(totalDebt)]);
    totalRow.font = { bold: true, color: { argb: `FF${REPORT_COLORS.danger}` } };

    sheet.columns = [
        { width: 5 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
    ];

    return workbook;
}

/**
 * Bitta varaqda bo'lim sarlavhasi chizuvchi yordamchi — SummaryExcel uchun.
 * Har chaqiriqda joriy oxirgi qatordan pastroqqa yangi bo'lim boshlaydi,
 * shu bilan bir nechta workbook/worksheet o'rniga faqat BITTA varaq ishlatiladi.
 */
function addSummarySection(sheet, title, colSpan) {
    sheet.addRow([]);
    const r = sheet.rowCount + 1;
    sheet.mergeCells(r, 1, r, colSpan);
    const cell = sheet.getCell(r, 1);
    cell.value = title;
    cell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.headerBg}` } };
    sheet.getRow(r).height = 20;
    sheet.addRow([]);
}

/**
 * Umumiy oylik hisobot — barcha bo'limlar (umumiy ko'rsatkichlar, buyurtmalar,
 * ombor qoldig'i, mijozlar qarzi) BITTA varaqda, bo'lim-bo'lim pastga qarab
 * joylashtiriladi. Eski versiyada har bo'lim alohida worksheet edi va bu
 * hisobot bir necha marta yaratilganda varaqlar sonining ortib ketishiga
 * (2, 4, 8...) sabab bo'lardi — endi doim bitta workbook, bitta varaq.
 */
async function buildSummaryExcel({ month, year, monthName, ordersData, stockData, debtsData, kassaBalance }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Hisobot_${monthName}_${year}`.slice(0, 31));
    const COL_SPAN = 10;

    styleExcelTitle(sheet, `OYLIK UMUMIY HISOBOT — ${monthName.toUpperCase()} ${year}`, `Yaratilgan sana: ${new Date().toLocaleDateString('uz-UZ')}`, COL_SPAN);

    // --- Bo'lim 1: umumiy ko'rsatkichlar ---
    addSummarySection(sheet, "1. UMUMIY KO'RSATKICHLAR", COL_SPAN);
    const kv = [
        ['Jami buyurtmalar soni', ordersData.totalOrders],
        ['Jami savdo summasi', `${formatMoney(ordersData.totalRevenue)} $`],
        ['Sotilgan', `${ordersData.totalBoxes} quti / ${ordersData.totalKg} kg`],
        ['Bajarilgan buyurtmalar', ordersData.completed],
        ['Kutilayotgan buyurtmalar', ordersData.pending],
        ['Bekor qilingan buyurtmalar', ordersData.cancelled],
        ['Ombordagi jami qoldiq', `${stockData.totalBoxes} quti / ${stockData.totalKg} kg`],
        ['Ombordagi jami qiymat', `${formatMoney(stockData.totalValue)} $`],
        ["Mijozlarning jami qarzi", `${formatMoney(debtsData.totalDebt)} $`],
        ['Qarzdor mijozlar soni', debtsData.debtors.length],
        ['Kassadagi joriy balans', `${formatMoney(kassaBalance)} $`],
    ];
    kv.forEach(([label, value], idx) => {
        const row = sheet.addRow([label, value]);
        row.getCell(1).font = { bold: true };
        stripeExcelRow(row, idx);
    });

    // --- Bo'lim 2: buyurtmalar ---
    addSummarySection(sheet, `2. BUYURTMALAR — ${monthName.toUpperCase()} ${year}`, COL_SPAN);
    const ordersHeader = sheet.addRow(['№', 'Sana', 'Mijoz', 'Telefon', 'Mahsulot', "O'lcham", 'Quti', 'Miqdor (kg)', 'Narx/kg', 'Summa', 'Status']);
    styleExcelHeaderRow(ordersHeader);
    let oi = 0;
    ordersData.orders.forEach((order) => {
        oi += 1;
        order.items.forEach((item, i) => {
            const row = sheet.addRow([
                i === 0 ? oi : '',
                i === 0 ? new Date(order.createdAt).toLocaleDateString('uz-UZ') : '',
                i === 0 ? (order.client?.name || '—') : '',
                i === 0 ? (order.client?.phone || '—') : '',
                item.productName, item.size,
                item.quantityBoxes != null ? item.quantityBoxes : '',
                item.quantityKg,
                formatMoney(item.pricePerKg), formatMoney(item.subtotal),
                i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            ]);
            stripeExcelRow(row, oi);
        });
    });

    // --- Bo'lim 3: ombor qoldig'i ---
    addSummarySection(sheet, "3. OMBORDAGI MAHSULOTLAR QOLDIG'I", COL_SPAN);
    const stockHeader = sheet.addRow(['№', 'Mahsulot', 'Kategoriya', "O'lcham", 'Quti (dona)', "1 quti (kg)", 'Jami (kg)', 'Qiymat']);
    styleExcelHeaderRow(stockHeader);
    stockData.rows.forEach((r, idx) => {
        const row = sheet.addRow([idx + 1, r.product, r.category, r.size, r.boxes, r.boxKg, r.totalKg, formatMoney(r.value)]);
        stripeExcelRow(row, idx + 1);
    });

    // --- Bo'lim 4: mijozlar qarzi ---
    addSummarySection(sheet, "4. MIJOZLARNING QARZDORLIGI", COL_SPAN);
    const debtsHeader = sheet.addRow(['№', 'Mijoz', 'Telefon', 'Jami buyurtma', 'Qarz ($)']);
    styleExcelHeaderRow(debtsHeader);
    debtsData.debtors.forEach((c, idx) => {
        const row = sheet.addRow([idx + 1, c.name, c.phone, (c.orders || []).length, formatMoney(c.debt)]);
        stripeExcelRow(row, idx + 1);
    });

    sheet.columns = [
        { width: 5 }, { width: 22 }, { width: 22 }, { width: 15 },
        { width: 22 }, { width: 9 }, { width: 9 }, { width: 12 }, { width: 12 }, { width: 15 },
    ];

    return workbook;
}

/**
 * Mijoz jurnal-hisoboti — TORABEK misolidagi kabi: har oy uchun bitta blok
 * (REZBA/SIZE/KAR/KLI/KG/NARH/SUMMA jadvali + to'lovlar ustuni), bloklar
 * bitta varaqda pastma-past ketadi. Har oyning "OST" (o'tgan oydan qolgan
 * qarz) qatori avvalgi oyning "QARZINGIZ" formulasiga bog'lanadi — shu bilan
 * qarz avtomatik oydan-oyga o'tkazib boriladi.
 *
 * Ustunlar: A=Sana(to'lov qatorida)  B=REZBA  C=SIZE  D=KAR(quti)
 *           E=KLI(1 quti kg)  F=KG(=D*E)  G=NARH  H=SUMMA(=F*G)
 *           J=to'lov SUMMA  K=KIMGA  L=SANA
 */
// ---- rasmdagi ranglar palitrasi -----------------------------------------
const COLORS = {
    frameOlive: 'FF9E9662',     // tashqi "ramka" foni (xaki/zaytun)
    monthHeaderBg: 'FF000000',  // MART / MAY / IYUN / IYUL bloki foni
    monthHeaderFg: 'FFFFFFFF',
    yearBg: 'FF00B050',         // 2026 katakchasi
    yearFg: 'FFFFFFFF',
    kimgaHeaderBg: 'FF4472C4',  // SUMMA / KIMGA / SANA ustun sarlavhasi
    kimgaHeaderFg: 'FFFFFFFF',
    dateBadgeBlue: 'FFBDD7EE',  // 24-Mar, 03-Jul kabi teg — ko'k
    dateBadgeYellow: 'FFFFFF00',// 12-May, 25-Jul kabi teg — sariq
    yangiBg: 'FFFFFF00',        // YANGI qatori
    ostFg: 'FFFF0000',          // OST — qizil matn
    jamiBg: 'FF00B0F0',         // JAMI qatori — moviy fon
    qarzFg: 'FF0070C0',         // "QARZINGIZ" so'zi — moviy
    qarzAmountFg: 'FFFF0000',   // qarz summasi — qizil, katta
    white: 'FFFFFFFF',
    black: 'FF000000',
};

function argb(hex) {
    return { argb: hex };
}

// -- jadval chiziqlari (nozik, kulrang) --
const THIN_BORDER = {
    top: { style: 'thin', color: argb('FFB2B2B2') },
    left: { style: 'thin', color: argb('FFB2B2B2') },
    bottom: { style: 'thin', color: argb('FFB2B2B2') },
    right: { style: 'thin', color: argb('FFB2B2B2') },
};
const THICK_BORDER = {
    top: { style: 'medium', color: argb(COLORS.black) },
    left: { style: 'medium', color: argb(COLORS.black) },
    bottom: { style: 'medium', color: argb(COLORS.black) },
    right: { style: 'medium', color: argb(COLORS.black) },
};

function colIdx(letters) {
    return letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}
function colLetter(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - m) / 26);
    }
    return s;
}
function applyBorder(sheet, range, border) {
    const [start, end] = range.split(':');
    const startCol = start.match(/[A-Z]+/)[0];
    const startRow = parseInt(start.match(/\d+/)[0], 10);
    const endCol = end.match(/[A-Z]+/)[0];
    const endRow = parseInt(end.match(/\d+/)[0], 10);
    for (let r = startRow; r <= endRow; r += 1) {
        for (let ci = colIdx(startCol); ci <= colIdx(endCol); ci += 1) {
            sheet.getCell(`${colLetter(ci)}${r}`).border = border;
        }
    }
}

/**
 * buildClientLedgerExcel
 * Mijozning barcha oylardagi xarid va to‘lov jurnalini bitta Excel varaqida,
 * oy-oy bloklar tarzida chiqaradi. Har bir oy ichida mahsulotlar jadvali va
 * to‘lovlar ro‘yxati, shuningdek qarz hisob-kitoblari avtomatik bajariladi.
 *
 * @param {Object} params
 * @param {Object} params.client - Mijoz hujjati (name, phone, debt va boshqalar)
 * @param {Array}  params.months - Har oy uchun ma'lumotlar (items, payments)
 * @returns {ExcelJS.Workbook}
 */
function buildClientLedgerExcel({ client, months }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    // Varaq nomi – mijoz ismidan olinadi
    const sheetName = `${client.name}`.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Mijoz';
    const sheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: false }],
    });

    // Ustun kengliklari
    sheet.columns = [
        { width: 12 },  // A - Sana / № (chap tomonda)
        { width: 18 },  // B - Mahsulot
        { width: 10 },  // C - Razmer
        { width: 8 },   // D - SHT (dona)
        { width: 9 },   // E - KG/1 quti
        { width: 10 },  // F - KG (jami)
        { width: 10 },  // G - Narh/kg
        { width: 12 },  // H - Summa
        { width: 3 },   // I - ajratuvchi
        { width: 12 },  // J - To‘lov summa
        { width: 18 },  // K - Izoh / Qarzingiz
        { width: 12 },  // L - Sana
    ];

    const ALL_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const LEFT_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const RIGHT_COLS = ['J', 'K', 'L'];

    // ---------- Mijoz sarlavhasi (umumiy ma'lumot) ----------
    const titleRow = 1;
    sheet.mergeCells(`A${titleRow}:H${titleRow}`);
    const titleCell = sheet.getCell(`A${titleRow}`);
    titleCell.value = `Mijoz: ${client.name}  |  Telefon: ${client.phone}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    titleCell.font.color = { argb: 'FFFFFFFF' };

    sheet.mergeCells(`J${titleRow}:L${titleRow}`);
    const debtCell = sheet.getCell(`J${titleRow}`);
    debtCell.value = `Joriy qarz: ${formatMoney(client.debt || 0)} $`;
    debtCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    debtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    debtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };

    sheet.getRow(titleRow).height = 30;

    // Sarlavhadan keyin bo‘sh qator
    sheet.addRow([]);
    const startRow = sheet.rowCount + 1;

    let prevDebtCell = null; // avvalgi oyning "QARZINGIZ" manzili

    // Har bir oy uchun blok
    months.forEach((bucket) => {
        const blockStartRow = sheet.rowCount + 1;

        // ========== 1) Oy sarlavhasi ==========
        const monthRow = sheet.rowCount + 1;
        sheet.mergeCells(`B${monthRow}:C${monthRow}`);
        const monthCell = sheet.getCell(`B${monthRow}`);
        monthCell.value = `${bucket.monthName.toUpperCase()} ${bucket.year}`;
        monthCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
        monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };

        // O'ng tomondagi sarlavha (SUMMA, IZOH, SANA)
        RIGHT_COLS.forEach((col) => {
            const c = sheet.getCell(`${col}${monthRow}`);
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        });
        applyBorder(sheet, `B${monthRow}:C${monthRow}`, THIN_BORDER);
        applyBorder(sheet, `J${monthRow}:L${monthRow}`, THIN_BORDER);

        // ========== 2) Ustun sarlavhalari ==========
        const headerRow = sheet.rowCount + 1;
        const headers = [
            { col: 'A', text: 'Sana' },
            { col: 'B', text: 'Mahsulot' },
            { col: 'C', text: 'Razmer' },
            { col: 'D', text: 'SHT (dona)' },
            { col: 'E', text: 'KG/1 quti' },
            { col: 'F', text: 'KG (jami)' },
            { col: 'G', text: 'Narh/kg' },
            { col: 'H', text: 'Summa' },
        ];
        headers.forEach(({ col, text }) => {
            const cell = sheet.getCell(`${col}${headerRow}`);
            cell.value = text;
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });
        // O'ng ustunlar
        ['J', 'K', 'L'].forEach((col) => {
            const cell = sheet.getCell(`${col}${headerRow}`);
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });
        sheet.getCell('J' + headerRow).value = 'To\'lov';
        sheet.getCell('K' + headerRow).value = 'Izoh';
        sheet.getCell('L' + headerRow).value = 'Sana';

        applyBorder(sheet, `A${headerRow}:H${headerRow}`, THIN_BORDER);
        applyBorder(sheet, `J${headerRow}:L${headerRow}`, THIN_BORDER);

        // ========== 3) Ma'lumotlar: mahsulot qatorlari va to'lovlar ==========
        const dataStartRow = sheet.rowCount + 1;

        // Mahsulotlarni sana bo'yicha guruhlaymiz (bir xil sana bitta badge)
        const groups = [];
        (bucket.items || []).forEach((item) => {
            const key = item.date || 'SANASIZ';
            const last = groups[groups.length - 1];
            if (last && last.key === key) {
                last.items.push(item);
            } else {
                groups.push({ key, items: [item] });
            }
        });
        if (groups.length === 0) groups.push({ key: null, items: [] });

        const payments = bucket.payments || [];
        let paymentIdx = 0;

        let badgeToggle = 0; // navbat bilan ko'k/sariq

        groups.forEach((group) => {
            const groupStartRow = sheet.rowCount + 1;

            group.items.forEach((item) => {
                const r = sheet.rowCount + 1;
                const hasBoxData = item.quantityBoxes != null && item.boxKg != null;

                // A - Sana (badge keyingi bosqichda qo'yiladi)
                // B - Mahsulot
                sheet.getCell(`B${r}`).value = item.productName;
                // C - Razmer
                sheet.getCell(`C${r}`).value = item.size;
                // D - SHT (quti soni)
                if (hasBoxData) {
                    sheet.getCell(`D${r}`).value = item.quantityBoxes;
                    sheet.getCell(`E${r}`).value = item.boxKg;
                    sheet.getCell(`F${r}`).value = { formula: `E${r}*D${r}` };
                } else {
                    // eski buyurtmalarda quti ma'lumoti bo'lmasa, faqat kg bor
                    sheet.getCell(`F${r}`).value = item.quantityKg;
                }
                // G - Narh/kg
                sheet.getCell(`G${r}`).value = item.pricePerKg;
                // H - Summa = kg * narh
                sheet.getCell(`H${r}`).value = { formula: `F${r}*G${r}` };
                // Formatlash
                sheet.getCell(`F${r}`).numFmt = '#,##0.00';
                sheet.getCell(`H${r}`).numFmt = '#,##0.00';
                applyBorder(sheet, `A${r}:H${r}`, THIN_BORDER);
                ['C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
                    sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
                });

                // O'ng tomondagi to'lov (agar bor bo'lsa)
                const payment = payments[paymentIdx];
                if (payment) {
                    sheet.getCell(`J${r}`).value = payment.amount;
                    sheet.getCell(`J${r}`).numFmt = '#,##0';
                    sheet.getCell(`K${r}`).value = payment.note || '—';
                    sheet.getCell(`L${r}`).value = new Date(payment.date);
                    sheet.getCell(`L${r}`).numFmt = 'd-mmm';
                    applyBorder(sheet, `J${r}:L${r}`, THIN_BORDER);
                    ['J', 'K', 'L'].forEach((col) => {
                        sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
                    });
                    paymentIdx += 1;
                }
            });

            const groupEndRow = sheet.rowCount;

            // A ustuniga sana "badge" qo'yish
            if (group.key) {
                const badgeColor = badgeToggle % 2 === 0 ? 'FFBDD7EE' : 'FFFFFF00';
                badgeToggle += 1;
                const dateCell = sheet.getCell(`A${groupStartRow}`);
                dateCell.value = formatBadgeDate(group.key);
                dateCell.font = { bold: true };
                dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
                dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: badgeColor } };
                if (groupEndRow > groupStartRow) {
                    sheet.mergeCells(`A${groupStartRow}:A${groupEndRow}`);
                }
            }
        });

        // Qolgan to'lovlar (mahsulot qatorlari tugagandan keyin)
        while (paymentIdx < payments.length) {
            const r = sheet.rowCount + 1;
            const payment = payments[paymentIdx];
            sheet.getCell(`J${r}`).value = payment.amount;
            sheet.getCell(`J${r}`).numFmt = '#,##0';
            sheet.getCell(`K${r}`).value = payment.note || '—';
            sheet.getCell(`L${r}`).value = new Date(payment.date);
            sheet.getCell(`L${r}`).numFmt = 'd-mmm';
            applyBorder(sheet, `J${r}:L${r}`, THIN_BORDER);
            ['J', 'K', 'L'].forEach((col) => {
                sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
            });
            paymentIdx += 1;
        }

        const dataEndRow = sheet.rowCount;

        // Agar hech qanday qator qo'shilmagan bo'lsa, bo'sh qator qoldiramiz
        if (dataEndRow < dataStartRow) sheet.addRow([]);

        // ========== 4) YANGI, OST, JAMI va QARZINGIZ ==========
        sheet.addRow([]);
        const yangiRow = sheet.rowCount + 1;
        sheet.getCell(`G${yangiRow}`).value = 'YANGI';
        sheet.getCell(`G${yangiRow}`).font = { bold: true };
        sheet.getCell(`G${yangiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        sheet.getCell(`H${yangiRow}`).value = { formula: `SUM(H${dataStartRow}:H${dataEndRow})` };
        sheet.getCell(`H${yangiRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${yangiRow}`).font = { bold: true };
        sheet.getCell(`H${yangiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        applyBorder(sheet, `G${yangiRow}:H${yangiRow}`, THIN_BORDER);

        const ostRow = sheet.rowCount + 1;
        sheet.getCell(`G${ostRow}`).value = 'OST';
        sheet.getCell(`G${ostRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
        if (prevDebtCell) {
            sheet.getCell(`H${ostRow}`).value = { formula: prevDebtCell };
        }
        sheet.getCell(`H${ostRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${ostRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
        applyBorder(sheet, `G${ostRow}:H${ostRow}`, THIN_BORDER);

        const jamiRow = sheet.rowCount + 1;
        sheet.getCell(`G${jamiRow}`).value = 'JAMI';
        sheet.getCell(`G${jamiRow}`).font = { bold: true };
        sheet.getCell(`H${jamiRow}`).value = { formula: `SUM(H${yangiRow}:H${ostRow})` };
        sheet.getCell(`H${jamiRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${jamiRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell(`G${jamiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
        sheet.getCell(`H${jamiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
        applyBorder(sheet, `G${jamiRow}:H${jamiRow}`, THIN_BORDER);

        // To'lovlar yig'indisi va QARZINGIZ
        const paidTotalRow = jamiRow;
        sheet.getCell(`J${paidTotalRow}`).value = { formula: `SUM(J${dataStartRow}:J${jamiRow - 1})` };
        sheet.getCell(`J${paidTotalRow}`).numFmt = '#,##0';
        sheet.getCell(`J${paidTotalRow}`).font = { bold: true };
        sheet.getCell(`K${paidTotalRow}`).numFmt = '#,##0.00';
        sheet.getCell(`K${paidTotalRow}`).font = { bold: true, size: 14, color: { argb: 'FFFF0000' } };
        sheet.getCell(`K${paidTotalRow}`).alignment = { horizontal: 'center' };

        // Qo'shimcha jamilar (SHT, KG)
        const qarzRow = sheet.rowCount + 1;
        sheet.getCell(`D${qarzRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})` };
        sheet.getCell(`D${qarzRow}`).font = { bold: true };
        sheet.getCell(`F${qarzRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})` };
        sheet.getCell(`F${qarzRow}`).numFmt = '#,##0.00';
        sheet.getCell(`F${qarzRow}`).font = { bold: true };
        // sheet.getCell(`K${qarzRow}`).value = 'QARZINGIZ';
        sheet.getCell(`K${qarzRow}`).font = { bold: true, color: { argb: 'FF0070C0' } };
        sheet.getCell(`K${qarzRow}`).alignment = { horizontal: 'center' };
        applyBorder(sheet, `D${qarzRow}:F${qarzRow}`, THIN_BORDER);
        applyBorder(sheet, `K${qarzRow}:K${qarzRow}`, THIN_BORDER);

        // Keyingi oy uchun OST manzilini saqlaymiz
        prevDebtCell = `K${paidTotalRow}`;

        const blockEndRow = sheet.rowCount;

        // ========== 5) Tashqi ramka va ajratgich ==========
        // I ustunini zaytun rang bilan to'ldirish (ramka effekti)
        for (let r = blockStartRow; r <= blockEndRow; r += 1) {
            sheet.getCell(`I${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E9662' } };
        }
        applyBorder(sheet, `A${blockStartRow}:H${blockEndRow}`, THICK_BORDER);
        applyBorder(sheet, `J${blockStartRow}:L${blockEndRow}`, THICK_BORDER);

        // Bloklar orasida bo'sh qator
        sheet.addRow([]);
    });

    return workbook;
}

// ---- yordamchi: sana kalitini "24-Mar" ko'rinishiga o'giradi -------------
function formatBadgeDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}`;
}

// ---------------------------------------------------------------------------
// PDF GENERATORLARI
// ---------------------------------------------------------------------------

function buildOrdersPdf({ month, year, monthName, orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes }) {
    const doc = newPdfDoc();
    pdfHeader(doc, `Buyurtmalar hisoboti — ${monthName} ${year}`, `Sahifa yaratilgan sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(
        doc,
        `Jami buyurtmalar: ${totalOrders}  |  Jami summa: ${formatMoney(totalRevenue)} $  |  Jami: ${totalBoxes} quti / ${totalKg} kg  |  Bajarilgan: ${completed}  |  Kutilmoqda: ${pending}  |  Bekor qilingan: ${cancelled}`
    );

    const rows = [];
    let oi = 0;
    orders.forEach((order) => {
        oi += 1;
        order.items.forEach((item, i) => {
            const hasBoxData = item.quantityBoxes != null && item.boxKg != null;
            rows.push({
                no: i === 0 ? oi : '',
                date: i === 0 ? new Date(order.createdAt).toLocaleDateString('uz-UZ') : '',
                client: i === 0 ? (order.client?.name || '—') : '',
                product: `${item.productName} (${item.size})`,
                box: hasBoxData ? item.quantityBoxes : '',
                qty: item.quantityKg,
                price: formatMoney(item.pricePerKg),
                subtotal: formatMoney(item.subtotal),
                status: i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            });
        });
    });

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.05, align: 'center' },
            { key: 'date', label: 'Sana', width: 0.10 },
            { key: 'client', label: 'Mijoz', width: 0.16 },
            { key: 'product', label: 'Mahsulot', width: 0.19 },
            { key: 'box', label: 'Quti', width: 0.08, align: 'right' },
            { key: 'qty', label: 'Kg', width: 0.09, align: 'right' },
            { key: 'price', label: 'Narx/kg', width: 0.11, align: 'right' },
            { key: 'subtotal', label: 'Summa', width: 0.13, align: 'right' },
            { key: 'status', label: 'Status', width: 0.09 },
        ],
        rows,
    });

    pdfFooter(doc);
    return doc;
}

function buildStockPdf({ rows, totalKg, totalValue, totalBoxes }) {
    const doc = newPdfDoc();
    pdfHeader(doc, "Ombordagi mahsulotlar qoldig'i", `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(doc, `Jami: ${totalBoxes} quti / ${totalKg} kg  |  Jami qiymat: ${formatMoney(totalValue)} $`);

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'product', label: 'Mahsulot', width: 0.24 },
            { key: 'category', label: 'Kategoriya', width: 0.16 },
            { key: 'size', label: "O'lcham", width: 0.1, align: 'center' },
            { key: 'boxes', label: 'Karobka', width: 0.1, align: 'right' },
            { key: 'totalKg', label: 'Jami (kg)', width: 0.13, align: 'right' },
            { key: 'value', label: 'Qiymat', width: 0.21, align: 'right' },
        ],
        rows: rows.map((r, idx) => ({
            no: idx + 1,
            product: r.product,
            category: r.category,
            size: r.size,
            boxes: r.boxes,
            totalKg: r.totalKg,
            value: formatMoney(r.value),
        })),
    });

    pdfFooter(doc);
    return doc;
}

function buildDebtsPdf({ debtors, totalDebt }) {
    const doc = newPdfDoc();
    pdfHeader(doc, 'Mijozlarning qarzdorligi', `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(doc, `Qarzdor mijozlar soni: ${debtors.length}  |  Jami qarz: ${formatMoney(totalDebt)} $`);

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'name', label: 'Mijoz', width: 0.3 },
            { key: 'phone', label: 'Telefon', width: 0.2 },
            { key: 'orders', label: 'Buyurtma', width: 0.14, align: 'center' },
            { key: 'debt', label: "Qarz ($)", width: 0.3, align: 'right' },
        ],
        rows: debtors.map((c, idx) => ({
            no: idx + 1,
            name: c.name,
            phone: c.phone,
            orders: (c.orders || []).length,
            debt: formatMoney(c.debt),
        })),
    });

    pdfFooter(doc);
    return doc;
}

function buildSummaryPdf({ month, year, monthName, ordersData, stockData, debtsData, kassaBalance }) {
    const doc = newPdfDoc();
    pdfHeader(doc, `Oylik umumiy hisobot — ${monthName} ${year}`, `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);

    pdfSectionTitle(doc, "Umumiy ko'rsatkichlar");
    drawPdfTable(doc, {
        columns: [
            { key: 'label', label: "Ko'rsatkich", width: 0.6 },
            { key: 'value', label: 'Qiymat', width: 0.4, align: 'right' },
        ],
        rows: [
            { label: 'Jami buyurtmalar soni', value: ordersData.totalOrders },
            { label: 'Jami savdo summasi', value: `${formatMoney(ordersData.totalRevenue)} $` },
            { label: 'Sotilgan', value: `${ordersData.totalBoxes} quti / ${ordersData.totalKg} kg` },
            { label: 'Bajarilgan / Kutilmoqda / Bekor qilingan', value: `${ordersData.completed} / ${ordersData.pending} / ${ordersData.cancelled}` },
            { label: 'Ombordagi jami qoldiq', value: `${stockData.totalBoxes} quti / ${stockData.totalKg} kg` },
            { label: 'Ombordagi jami qiymat', value: `${formatMoney(stockData.totalValue)} $` },
            { label: "Mijozlarning jami qarzi", value: `${formatMoney(debtsData.totalDebt)} $` },
            { label: 'Qarzdor mijozlar soni', value: debtsData.debtors.length },
            { label: 'Kassadagi joriy balans', value: `${formatMoney(kassaBalance)} $` },
        ],
    });

    doc.addPage();
    pdfSectionTitle(doc, "Eng ko'p qarzdor mijozlar (TOP-10)");
    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.08, align: 'center' },
            { key: 'name', label: 'Mijoz', width: 0.34 },
            { key: 'phone', label: 'Telefon', width: 0.24 },
            { key: 'debt', label: "Qarz ($)", width: 0.34, align: 'right' },
        ],
        rows: debtsData.debtors.slice(0, 10).map((c, idx) => ({
            no: idx + 1, name: c.name, phone: c.phone, debt: formatMoney(c.debt),
        })),
    });

    doc.addPage();
    pdfSectionTitle(doc, "Ombordagi qoldiq (TOP-15, kg bo'yicha)");
    const topStock = [...stockData.rows].sort((a, b) => b.totalKg - a.totalKg).slice(0, 15);
    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'product', label: 'Mahsulot', width: 0.28 },
            { key: 'size', label: "O'lcham", width: 0.12, align: 'center' },
            { key: 'totalKg', label: 'Jami (kg)', width: 0.22, align: 'right' },
            { key: 'value', label: 'Qiymat', width: 0.32, align: 'right' },
        ],
        rows: topStock.map((r, idx) => ({
            no: idx + 1, product: r.product, size: r.size, totalKg: r.totalKg, value: formatMoney(r.value),
        })),
    });

    pdfFooter(doc);
    return doc;
}

// ---------------------------------------------------------------------------
// CONTROLLER — Reports
// (future: controllers/reportController.js)
// ---------------------------------------------------------------------------

const reportController = {
    /**
     * GET /api/v1/reports/orders?month=iyul&year=2026&format=excel|pdf
     * Berilgan oydagi barcha buyurtmalarni Excel yoki PDF qilib qaytaradi.
     */
    async orders(req, res) {
        const format = resolveFormat(req.query);
        const { month, year, monthName, start, end } = resolveMonthYear(req.query);
        const data = await fetchOrdersReportData({ start, end });

        const filenameBase = `buyurtmalar_${monthName}_${year}`;

        if (format === 'excel') {
            const workbook = await buildOrdersExcel({ month, year, monthName, ...data });
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildOrdersPdf({ month, year, monthName, ...data });
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    /**
     * GET /api/v1/reports/stock?format=excel|pdf
     * Ombordagi joriy qoldiqni (qancha mahsulot qolgani) hisobot qilib qaytaradi.
     */
    async stock(req, res) {
        const format = resolveFormat(req.query);
        const data = await fetchStockReportData();
        const filenameBase = `ombor_qoldigi_${new Date().toISOString().slice(0, 10)}`;

        if (format === 'excel') {
            const workbook = await buildStockExcel(data);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildStockPdf(data);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    /**
     * GET /api/v1/reports/debts?format=excel|pdf
     * Mijozlarning jami qarzdorligi bo'yicha hisobot.
     */
    async debts(req, res) {
        const format = resolveFormat(req.query);
        const data = await fetchDebtsReportData();
        const filenameBase = `mijozlar_qarzi_${new Date().toISOString().slice(0, 10)}`;

        if (format === 'excel') {
            const workbook = await buildDebtsExcel(data);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildDebtsPdf(data);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    /**
     * GET /api/v1/reports/client/:clientId?format=excel
     * Bitta mijozning barcha oylardagi buyurtma+to'lov jurnalini TORABEK
     * misolidagi kabi bitta varaqda, oy-oy bloklar tarzida qaytaradi.
     * Hozircha faqat Excel qo'llab-quvvatlanadi (formulali jadval PDF'da
     * ma'nosiz — chunki PDF qayta hisoblanmaydi).
     */
    async clientLedger(req, res) {
        try {
            const { clientId } = req.params;
            if (!isValidObjectId(clientId)) throw new ApiError(400, "Noto'g'ri mijoz ID.");

            const { client, months } = await fetchClientLedgerData(clientId);
            const workbook = buildClientLedgerExcel({ client, months });

            const filenameBase = `${client.name}_hisobot_${new Date().toISOString().slice(0, 10)}`.replace(/\s+/g, '_');
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        } catch (error) {
            // Send a proper JSON error
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Hisobot yaratishda xatolik yuz berdi.',
            });
        }
    },

    /**
     * GET /api/v1/reports/summary?month=iyul&year=2026&format=excel|pdf
     * Bitta faylda: oylik buyurtmalar + ombor qoldig'i + mijozlar qarzi + kassa balansi.
     */
    async summary(req, res) {
        const format = resolveFormat(req.query);
        const { month, year, monthName, start, end } = resolveMonthYear(req.query);

        const [ordersData, stockData, debtsData, kassa] = await Promise.all([
            fetchOrdersReportData({ start, end }),
            fetchStockReportData(),
            fetchDebtsReportData(),
            getKassaDoc(),
        ]);

        const filenameBase = `umumiy_hisobot_${monthName}_${year}`;
        const payload = { month, year, monthName, ordersData, stockData, debtsData, kassaBalance: kassa.balance };

        if (format === 'excel') {
            const workbook = await buildSummaryExcel(payload);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildSummaryPdf(payload);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },
};

// ============================================================================
// SECTION: EXPRESS APP SETUP
// (future: app.js)
// ============================================================================

const app = express();

app.set('trust proxy', 1);
// app.disable('x-powered-by');

// Security headers
app.use(helmet());

// Compression
app.use(compression());

// CORS
app.use(
    cors({
        origin: config.corsOrigin,
        credentials: true,
    })
);

// Body parsers with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Sanitization against NoSQL injection & HTTP Parameter Pollution
app.use(mongoSanitize());
app.use(hpp());

// Request ID + response time logger
app.use((req, res, next) => {
    req.requestId = uuidv4();
    req.startTime = Date.now();
    res.setHeader('X-Request-Id', req.requestId);
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        if (config.nodeEnv !== 'test') {
            console.log(
                `${colors.magenta}[${req.requestId}]${colors.reset} ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
            );
        }
    });
    next();
});

// HTTP request logger (dev-friendly, disabled in test)
if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// General rate limiting applied globally; stricter limiters applied per-route below
app.use('/api/', generalLimiter);

// ============================================================================
// SECTION: ROUTES
// (future: routes/*.routes.js)
// ============================================================================

const router = express.Router();

// ---- Health ----
router.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? 'ulangan' : 'ulanmagan';
    return sendSuccess(res, 200, "Server ishlamoqda.", {
        status: 'ok',
        database: dbState,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

// ---- Auth ----
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', authLimiter, authController.login);
router.get('/auth/me', authenticate, authController.me);

// ---- Users (admin only) ----
router.get('/users', authenticate, authorize('admin'), adminLimiter, userController.list);
router.get('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.getById);
router.put('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.update);
router.delete('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.remove);

// ---- Products ----
router.post('/products', authenticate, authorize('admin', 'manager'), productController.create);
router.get('/products', authenticate, productController.list);
router.get('/products/:id', authenticate, productController.getById);
router.put('/products/:id', authenticate, authorize('admin', 'manager'), productController.update);
router.delete('/products/:id', authenticate, authorize('admin', 'manager'), productController.remove);

// ---- Clients ----
router.post('/clients', authenticate, authorize('admin', 'manager'), clientController.create);
router.get('/clients', authenticate, clientController.list);
router.get('/clients/:id', authenticate, clientController.getById);
router.put('/clients/:id', authenticate, authorize('admin', 'manager'), clientController.update);
router.delete('/clients/:id', authenticate, authorize('admin'), clientController.remove);
router.post('/clients/:id/payments', authenticate, authorize('admin', 'manager'), clientController.addPayment);
router.get('/clients/:id/payments', authenticate, clientController.paymentHistory);

// ---- Orders ----
router.post('/orders', authenticate, authorize('admin', 'manager', 'worker'), orderController.create);
router.get('/orders', authenticate, orderController.list);
router.get('/orders/:id', authenticate, orderController.getById);
router.patch('/orders/:id/status', authenticate, authorize('admin', 'manager'), orderController.updateStatus);
router.delete('/orders/:id', authenticate, authorize('admin'), orderController.remove);

// ---- Kassa ----
router.get('/kassa', authenticate, authorize('admin', 'manager'), kassaController.get);
router.get('/kassa/history', authenticate, authorize('admin', 'manager'), kassaController.history);
router.post('/kassa/expense', authenticate, authorize('admin', 'manager'), kassaController.expense);
router.post('/kassa/income', authenticate, authorize('admin', 'manager'), kassaController.income);

// ---- Dashboard ----
router.get('/dashboard/stats', authenticate, authorize('admin', 'manager'), dashboardController.stats);

// report
router.get('/reports/orders', authenticate, authorize('admin', 'manager'), reportController.orders);
router.get('/reports/stock', authenticate, authorize('admin', 'manager'), reportController.stock);
router.get('/reports/debts', authenticate, authorize('admin', 'manager'), reportController.debts);
router.get('/reports/client/:clientId', authenticate, authorize('admin', 'manager'), reportController.clientLedger);
router.get('/reports/summary', authenticate, authorize('admin', 'manager'), reportController.summary);

app.use('/api/v1', router);

// ============================================================================
// SECTION: 404 HANDLER
// ============================================================================

const keepServerAlive = () => {
    const pingInterval = 12 * 60 * 1000;

    const checkAndPing = () => {
        const now = new Date();
        const hourTashkent = (now.getUTCHours() + 5) % 24;

        if (hourTashkent >= 8 || hourTashkent < 3) {
            axios
                .get(process.env.RENDER_URL)
                .then(() => console.log('🔄 Server active (Tashkent time)'))
                .catch(() => console.log('⚠️ Ping failed'))
        } else {
            console.log('💤 Keep-alive uyqu rejimida (Tashkent time)')
        }
    }

    checkAndPing();
    setInterval(checkAndPing, pingInterval);
}

keepServerAlive();

app.use((req, res) => {
    return sendError(res, 404, "So'ralgan manzil topilmadi.");
});

// ============================================================================
// SECTION: GLOBAL ERROR HANDLER
// (future: middleware/errorHandler.js)
// ============================================================================

app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Serverda ichki xatolik yuz berdi.";

    // Mongoose validation errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((e) => e.message)
            .join(', ');
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0];
        message = `${field} allaqachon mavjud.`;
    }

    // Mongoose CastError (invalid ObjectId etc.)
    if (err.name === 'CastError') {
        statusCode = 400;
        message = "Noto'g'ri ma'lumot formati.";
    }

    if (!err.isOperational && config.nodeEnv !== 'production') {
        console.error(`${colors.red}[XATOLIK]${colors.reset}`, err);
    } else if (!err.isOperational) {
        console.error(`${colors.red}[XATOLIK] ${err.message}${colors.reset}`);
    }

    return sendError(res, statusCode, message, config.nodeEnv === 'production' ? null : err.stack);
});

// ============================================================================
// SECTION: SERVER STARTUP & GRACEFUL SHUTDOWN
// ============================================================================

let server;

async function startServer() {
    printBanner();
    await connectDatabase();

    server = app.listen(config.port, () => {
        console.log(`${colors.green}[Server] http://localhost:${config.port} manzilida ishga tushdi.${colors.reset}`);
        console.log(`${colors.cyan}[API] Asosiy manzil: /api/v1${colors.reset}`);
    });

    // Telegram bot — DB ulanib, modellar ro'yxatdan o'tgandan keyin ishga tushadi.
    // BOT_TOKEN .env faylida bo'lmasa, bot shunchaki ishga tushmaydi (server ishlashda davom etadi).
    try {
        // await startBot();
    } catch (err) {
        console.error(`${colors.red}[Bot] Ishga tushirishda xatolik: ${err.message}${colors.reset}`);
    }
}

async function gracefulShutdown(signal) {
    console.log(`\n${colors.yellow}[Server] ${signal} qabul qilindi. Server to'xtatilmoqda...${colors.reset}`);

    if (server) {
        server.close(async () => {
            console.log(`${colors.yellow}[Server] HTTP server yopildi.${colors.reset}`);
            try {
                await mongoose.connection.close(false);
                console.log(`${colors.yellow}[MongoDB] Ulanish yopildi.${colors.reset}`);
                process.exit(0);
            } catch (err) {
                console.error(`${colors.red}[Xatolik] Yopishda xato: ${err.message}${colors.reset}`);
                process.exit(1);
            }
        });

        // Force shutdown if not closed within 10s
        setTimeout(() => {
            console.error(`${colors.red}[Server] Majburiy to'xtatildi (timeout).${colors.reset}`);
            process.exit(1);
        }, 10000).unref();
    } else {
        process.exit(0);
    }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    console.error(`${colors.red}[Unhandled Rejection]${colors.reset}`, reason);
});

process.on('uncaughtException', (err) => {
    console.error(`${colors.red}[Uncaught Exception]${colors.reset}`, err);
    process.exit(1);
});

startServer();

export default app;