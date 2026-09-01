import 'dotenv/config';

const REQUIRED_ENV_VARS = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'PORT'];

function validateEnv() {
    const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`\x1b[31m[XATOLIK] Quyidagi .env o'zgaruvchilari topilmadi: ${missing.join(', ')}\x1b[0m`);
        process.exit(1);
    }
}

const config = {
    port: process.env.PORT || 5000,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    dashboardCacheTtl: Number(process.env.DASHBOARD_CACHE_TTL || 30),
    dbQuotaMb: Number(process.env.DB_QUOTA_MB || 512),
};

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

export { config, colors, printBanner, validateEnv };
