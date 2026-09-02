import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import morgan from 'morgan';
import 'express-async-errors';
import { v4 as uuidv4 } from 'uuid';
import { config, colors } from './config/index.js';
import { mongoose } from './lib/db.js';
import { generalLimiter } from './middleware/auth.js';
import router from './routes/index.js';
import { sendError } from './lib/helpers.js';

const app = express();

app.set('trust proxy', 1);

// Render va boshqa monitoring servislar uchun autentifikatsiyasiz health-check.
// API versiyalari ostidagi /api/v1/health va /api/v2/health ham saqlanadi.
app.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? 'ulangan' : 'ulanmagan';
    return res.status(200).json({
        status: 'ok',
        database: dbState,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

app.use(helmet());

app.use(compression());

app.use(
    cors({
        origin: config.corsOrigin,
        credentials: true,
    })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use(mongoSanitize());
app.use(hpp());

app.use((req, res, next) => {
    req.requestId = uuidv4();
    req.startTime = Date.now();
    res.setHeader('X-Request-Id', req.requestId);
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        if (config.nodeEnv === 'development') {
            console.log(
                `${colors.magenta}[${req.requestId}]${colors.reset} ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
            );
        }
    });
    next();
});

if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
}

app.use('/api/v1', generalLimiter);
app.use('/api/v1', router);

app.use('/api/v2', generalLimiter);
app.use('/api/v2', router);

app.use((req, res) => {
    return sendError(res, 404, "So'ralgan manzil topilmadi.");
});

app.use((err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Serverda ichki xatolik yuz berdi.";

    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((e) => e.message)
            .join(', ');
    }

    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0];
        message = `${field} allaqachon mavjud.`;
    }

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

export default app;
