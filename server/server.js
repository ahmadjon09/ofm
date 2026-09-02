import axios from 'axios';
import { config, colors, printBanner, validateEnv } from './src/config/index.js';
import { connectDatabase, mongoose } from './src/lib/db.js';
import app from './src/app.js';

validateEnv();
printBanner();

const keepServerAlive = () => {
    const pingInterval = 12 * 60 * 1000;
    const renderUrl = process.env.RENDER_URL?.replace(/\/$/, '');

    // Lokal muhitda yoki RENDER_URL berilmaganida ortiqcha so'rov yubormaymiz.
    if (!renderUrl) {
        console.log('ℹ️ Keep-alive o\'chirilgan: RENDER_URL sozlanmagan.');
        return;
    }

    const checkAndPing = () => {
        const now = new Date();
        const hourTashkent = (now.getUTCHours() + 5) % 24;

        if (hourTashkent >= 8 || hourTashkent < 3) {
            axios
                .get(`${renderUrl}/health`, { timeout: 10000 })
                .then(() => console.log('🔄 Server active (/health, Tashkent time)'))
                .catch((error) => console.log(`⚠️ Keep-alive ping failed: ${error.message}`));
        } else {
            console.log('💤 Keep-alive uyqu rejimida (Tashkent time)');
        }
    };

    checkAndPing();
    const timer = setInterval(checkAndPing, pingInterval);
    timer.unref();
};

let server;

async function startServer() {
    await connectDatabase();

    server = app.listen(config.port, () => {
        console.log(`${colors.green}[Server] http://localhost:${config.port} manzilida ishga tushdi.${colors.reset}`);
        console.log(`${colors.cyan}[API] Asosiy manzil: /api/v2 (eski /api/v1 ham ishlaydi)${colors.reset}`);
        keepServerAlive();
    });
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
