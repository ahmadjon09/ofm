import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { ApiError, sendError } from '../lib/helpers.js';
import { User } from '../models/index.js';
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

const rateLimitHandler = (req, res) => {
    sendError(res, 429, "Juda ko'p so'rov yuborildi. Iltimos, birozdan so'ng qayta urinib ko'ring.");
};

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
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


export { authenticate, authorize, authLimiter, generalLimiter, adminLimiter, signAccessToken, signRefreshToken };
