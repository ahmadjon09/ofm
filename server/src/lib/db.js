import mongoose from 'mongoose';
import { config, colors } from '../config/index.js';

mongoose.set('strictQuery', true);

async function connectDatabase() {
    try {
        await mongoose.connect(config.mongoUri, {
            maxPoolSize: 30,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 8000,
            socketTimeoutMS: 45000,
        });
        console.log(`${colors.green}[MongoDB] Ulanish muvaffaqiyatli o'rnatildi.${colors.reset}`);
    } catch (err) {
        console.error(`${colors.red}[MongoDB] Ulanishda xatolik: ${err.message}${colors.reset}`);
        process.exit(1);
    }
}

mongoose.connection.on('disconnected', () => {
    console.warn(`${colors.yellow}[MongoDB] Ulanish uzildi. Qayta ulanishga urinilmoqda...${colors.reset}`);
});

mongoose.connection.on('reconnected', () => {
    console.log(`${colors.green}[MongoDB] Qayta ulandi.${colors.reset}`);
});

mongoose.connection.on('error', (err) => {
    console.error(`${colors.red}[MongoDB] Ulanish xatosi: ${err.message}${colors.reset}`);
});

export { connectDatabase, mongoose };
