import os from 'os';
import mongoose from 'mongoose';
import { ApiError, sendSuccess } from '../lib/helpers.js';
import { config } from '../config/index.js';
import { User, Product, Client, Order, Kassa, KassaTransaction, getKassaDoc } from '../models/index.js';
import { clearDashboardCache, clearKassaCache } from '../lib/cache.js';

// O'chirish mumkin bo'lgan modullar ro'yxati (whitelist)
const MODULES = {
    products: {
        key: 'products',
        label: 'Mahsulotlar',
        model: Product,
        deletable: true,
        description: "Barcha mahsulotlar va ombor qoldiqlari o'chiriladi.",
    },
    clients: {
        key: 'clients',
        label: 'Mijozlar',
        model: Client,
        deletable: true,
        description: "Barcha mijozlar, qarzlar va to'lov tarixi o'chiriladi.",
    },
    orders: {
        key: 'orders',
        label: 'Buyurtmalar',
        model: Order,
        deletable: true,
        description: "Barcha buyurtmalar tarixi o'chiriladi (ombor qoldig'iga ta'sir qilmaydi).",
    },
    kassa_transactions: {
        key: 'kassa_transactions',
        label: 'Kassa tarixi',
        model: KassaTransaction,
        deletable: true,
        description: "Barcha kirim/chiqim yozuvlari o'chiriladi (balans saqlanadi).",
    },
    kassa: {
        key: 'kassa',
        label: 'Kassa balansi',
        model: Kassa,
        deletable: true,
        description: "Kassa balansi 0 ga tushiriladi.",
    },
    users: {
        key: 'users',
        label: 'Xodimlar',
        model: User,
        deletable: false,
        description: "Xavfsizlik sababli xodimlarni bu yerdan o'chirib bo'lmaydi.",
    },
};

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
}

const systemController = {
    // GET /system/info — DB va server holati
    async info(req, res) {
        const db = mongoose.connection.db;
        if (!db || mongoose.connection.readyState !== 1) {
            throw new ApiError(503, "Ma'lumotlar bazasi ulanmagan.");
        }

        const [dbStats, kassaDoc] = await Promise.all([db.stats(), getKassaDoc()]);

        // Modul (kolleksiya) statistikasi
        const modules = await Promise.all(
            Object.values(MODULES).map(async (m) => {
                let count = 0;
                let sizeBytes = 0;
                try {
                    count = await m.model.estimatedDocumentCount();
                    const collStats = await m.model.collection
                        .aggregate([{ $collStats: { storageStats: {} } }])
                        .toArray();
                    sizeBytes = collStats?.[0]?.storageStats?.size || 0;
                } catch {
                    // Kolleksiya hali yaratilmagan bo'lishi mumkin
                }
                return {
                    key: m.key,
                    label: m.label,
                    description: m.description,
                    deletable: m.deletable,
                    count,
                    sizeBytes,
                    size: formatBytes(sizeBytes),
                };
            })
        );

        // DB to'lganlik foizi (kvota: DB_QUOTA_MB env, standart 512MB — Atlas Free)
        const quotaBytes = config.dbQuotaMb * 1024 * 1024;
        const usedBytes = dbStats.dataSize || 0;
        const usedPercent = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

        const memory = process.memoryUsage();

        return sendSuccess(res, 200, "Tizim ma'lumotlari.", {
            database: {
                name: dbStats.db,
                connected: true,
                collections: dbStats.collections,
                objects: dbStats.objects,
                dataSizeBytes: usedBytes,
                dataSize: formatBytes(usedBytes),
                storageSizeBytes: dbStats.storageSize || 0,
                storageSize: formatBytes(dbStats.storageSize || 0),
                indexSizeBytes: dbStats.indexSize || 0,
                indexSize: formatBytes(dbStats.indexSize || 0),
                quotaBytes,
                quota: formatBytes(quotaBytes),
                usedPercent: Number(usedPercent.toFixed(2)),
            },
            modules,
            kassaBalance: kassaDoc.balance || 0,
            server: {
                nodeVersion: process.version,
                platform: `${os.type()} ${os.arch()}`,
                env: config.nodeEnv,
                uptimeSeconds: Math.floor(process.uptime()),
                memoryRssBytes: memory.rss,
                memoryRss: formatBytes(memory.rss),
                heapUsedBytes: memory.heapUsed,
                heapUsed: formatBytes(memory.heapUsed),
                timestamp: new Date().toISOString(),
            },
        });
    },

    // DELETE /system/modules/:key — modul ma'lumotlarini tozalash
    async clearModule(req, res) {
        const { key } = req.params;
        const { confirm } = req.body || {};

        const module = MODULES[key];
        if (!module) throw new ApiError(404, "Bunday modul topilmadi.");
        if (!module.deletable) throw new ApiError(403, `"${module.label}" modulini o'chirish taqiqlangan.`);

        // Tasdiqlash: body da modul kaliti yuborilishi shart
        if (confirm !== key) {
            throw new ApiError(400, `Tasdiqlash uchun body da confirm: "${key}" yuborilishi shart.`);
        }

        let deletedCount = 0;

        if (key === 'kassa') {
            const kassa = await getKassaDoc();
            kassa.balance = 0;
            await kassa.save();
            deletedCount = 1;
        } else {
            const result = await module.model.deleteMany({});
            deletedCount = result.deletedCount || 0;

            // Bog'liq ma'lumotlarni tozalash
            if (key === 'orders') {
                await Client.updateMany({}, { $set: { orders: [] } });
            }
        }

        clearDashboardCache();
        clearKassaCache();

        return sendSuccess(res, 200, `"${module.label}" moduli tozalandi.`, {
            module: key,
            deletedCount,
        });
    },
};

export default systemController;
