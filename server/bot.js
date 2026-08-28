import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import https from 'https';
import dns from 'dns';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

dns.setDefaultResultOrder('ipv4first');

import {
    buildProductsExcel,
    buildOrdersExcel,
    buildDebtorsExcel,
    buildKassaExcel,
} from './src/utils/bot/reportexcel.js';
import {
    buildProductsPdf,
    buildOrdersPdf,
    buildDebtorsPdf,
    buildKassaPdf,
} from './src/utils/bot/reportpdf.js';

const telegramAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 50,
    timeout: 120000,
    family: 4,
});

const MONTH_NAMES_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.slice(-9);
}

function money(n) {
    return `${Number(n || 0).toLocaleString('ru-RU')} $`;
}


function mainMenuKeyboard() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📊 Statistika', 'menu:stats')],
        [Markup.button.callback('📦 Mahsulotlar hisobot', 'menu:products')],
        [Markup.button.callback('🧾 Oylik savdo hisobot', 'menu:monthly')],
        [Markup.button.callback('💰 Kassa hisobot', 'menu:kassa')],
        [Markup.button.callback('👥 Qarzdor mijozlar', 'menu:debtors')],
    ]);
}

function backKeyboard(to = 'menu:main') {
    return Markup.inlineKeyboard([[Markup.button.callback('◀️ Bosh menyu', to)]]);
}

function exportKeyboard(prefix, extra = '') {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('📥 Excel', `${prefix}:excel${extra}`),
            Markup.button.callback('📄 PDF', `${prefix}:pdf${extra}`),
        ],
        [Markup.button.callback('◀️ Bosh menyu', 'menu:main')],
    ]);
}

function isTransientNetworkError(err) {
    const msg = String(err?.message || '');
    return (
        msg.includes('socket hang up') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('EAI_AGAIN') ||
        msg.includes('network')
    );
}

async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

const TMP_DIR = path.join(os.tmpdir(), 'reports');

async function ensureTmpDir() {
    await fs.mkdir(TMP_DIR, { recursive: true });
}

async function sendReport(ctx, { buildFn, args = [], filename }) {
    const startedAt = Date.now();
    let buffer;
    let tmpFilePath;

    let statusMsg;
    try {
        statusMsg = await ctx.reply('⏳ Hisobot tayyorlanmoqda, biroz kuting...');
    } catch (_) { /* status xabari yuborilmasa ham asosiy jarayon davom etadi */ }

    try {
        console.log(`[Report] Boshlandi: ${filename}`);
        buffer = await buildFn(...args);

        if (!buffer || buffer.length === 0) {
            throw new Error('Hisobot bo\'sh buffer qaytardi (0 bayt)');
        }

        await ensureTmpDir();
        tmpFilePath = path.join(TMP_DIR, `${randomUUID()}-${filename}`);
        await fs.writeFile(tmpFilePath, buffer);
        buffer = null;

        console.log(`[Report] Diskka yozildi: ${tmpFilePath} (${Date.now() - startedAt}ms)`);
    } catch (err) {
        console.error(`[Report] Yaratishda XATOLIK (${filename}):`, err);
        const failText = `❌ Hisobotni tayyorlashda xatolik yuz berdi.\nSabab: ${err.message || 'Noma\'lum xatolik'}`;
        if (statusMsg) {
            await ctx.telegram
                .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, failText)
                .catch(() => ctx.reply(failText).catch(() => { }));
        } else {
            await ctx.reply(failText).catch(() => { });
        }
        if (tmpFilePath) await fs.unlink(tmpFilePath).catch(() => { });
        return;
    }

    if (statusMsg) {
        await ctx.telegram
            .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, '📤 Fayl yuborilmoqda...')
            .catch(() => { });
    }

    const maxAttempts = 3;
    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await ctx.replyWithDocument({ source: createReadStream(tmpFilePath), filename });
                console.log(`[Report] Yuborildi: ${filename} (${attempt}-urinish)`);
                if (statusMsg) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => { });
                }
                return;
            } catch (err) {
                const transient = isTransientNetworkError(err);
                console.error(
                    `[Report] Yuborishda XATOLIK (${filename}), urinish ${attempt}/${maxAttempts}, transient=${transient}:`,
                    err
                );

                if (statusMsg) {
                    await ctx.telegram
                        .editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
                            `📤 Fayl yuborilmoqda... (qayta urinish ${attempt}/${maxAttempts})`)
                        .catch(() => { });
                }

                if (!transient || attempt === maxAttempts) {
                    const failText =
                        `❌ Faylni yuborishda xatolik yuz berdi (${attempt}-urinishdan keyin).\n` +
                        `Sabab: ${err.message || 'Noma\'lum xatolik'}\n\n` +
                        `Iltimos, qayta urinib ko'ring yoki administratorga xabar bering.`;
                    if (statusMsg) {
                        await ctx.telegram
                            .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, failText)
                            .catch(() => ctx.reply(failText).catch(() => { }));
                    } else {
                        await ctx.reply(failText).catch(() => { });
                    }
                    return;
                }

                await sleep(attempt * 3000);
            }
        }
    } finally {
        await fs.unlink(tmpFilePath).catch(() => { });
    }
}

async function launchWithRetry(bot, maxAttempts = 8) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await bot.launch({ dropPendingUpdates: true });
            return;
        } catch (err) {
            const is409 = err?.response?.error_code === 409 || String(err?.message || '').includes('409');
            console.error(`[Bot] Ishga tushirish urinishi ${attempt}/${maxAttempts} muvaffaqiyatsiz:`, err?.message || err);

            if (!is409 || attempt === maxAttempts) {
                throw err;
            }

            const waitMs = Math.min(5000 * attempt, 30000);
            console.log(`[Bot] Eski instance hali faol bo'lishi mumkin, ${waitMs / 1000}s kutib qayta urinamiz...`);
            await sleep(waitMs);
        }
    }
}


export async function startBot() {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.warn('[Bot] BOT_TOKEN topilmadi (.env). Telegram bot ishga tushirilmadi.');
        return null;
    }

    const User = mongoose.model('User');
    const Product = mongoose.model('Product');
    const Client = mongoose.model('Client');
    const Order = mongoose.model('Order');
    const Kassa = mongoose.model('Kassa');
    const KassaTransaction = mongoose.model('KassaTransaction');

    const bot = new Telegraf(token, {
        telegram: {
            agent: telegramAgent,
            webhookReply: false,
        },
        handlerTimeout: 180000,
    });

    try {
        await ensureTmpDir();
        const leftovers = await fs.readdir(TMP_DIR);
        await Promise.all(leftovers.map((f) => fs.unlink(path.join(TMP_DIR, f)).catch(() => { })));
        if (leftovers.length) {
            console.log(`[Bot] ${leftovers.length} ta eski vaqtinchalik fayl tozalandi.`);
        }
    } catch (err) {
        console.error('[Bot] Vaqtinchalik papkani tozalashda xatolik:', err);
    }

    bot.start(async (ctx) => {
        const existing = await User.findOne({ telegramId: ctx.from.id, role: 'admin', isActive: true });
        if (existing) {
            return ctx.reply(
                `Assalomu alaykum, ${existing.name}! 👋\nQuyidagi menyudan kerakli bo'limni tanlang:`,
                mainMenuKeyboard()
            );
        }

        return ctx.reply(
            "Assalomu alaykum! 🙋‍♂️\nBu bot faqat administratorlar uchun mo'ljallangan.\n" +
            "Davom etish uchun telefon raqamingizni ulashing:",
            Markup.keyboard([[Markup.button.contactRequest('📱 Raqamni ulashish')]])
                .resize()
                .oneTime()
        );
    });

    bot.help((ctx) => ctx.reply("Boshlash uchun /start buyrug'ini yuboring."));

    bot.on('contact', async (ctx) => {
        const contact = ctx.message.contact;

        if (contact.user_id && contact.user_id !== ctx.from.id) {
            return ctx.reply(
                "Iltimos, faqat o'zingizning shaxsiy raqamingizni ulashing.",
                Markup.removeKeyboard()
            );
        }

        const incoming = normalizePhone(contact.phone_number);
        const admins = await User.find({ role: 'admin', isActive: true });
        const matched = admins.find((a) => normalizePhone(a.phone) === incoming);

        if (!matched) {
            return ctx.reply(
                "❌ Kechirasiz, bu raqam tizimda admin sifatida topilmadi.\n" +
                "Agar bu xato deb hisoblasangiz, tizim administratoriga murojaat qiling.",
                Markup.removeKeyboard()
            );
        }

        matched.telegramId = ctx.from.id;
        matched.telegramLinkedAt = new Date();
        await matched.save();

        await ctx.reply(`✅ Tasdiqlandi! Xush kelibsiz, ${matched.name}.`, Markup.removeKeyboard());
        return ctx.reply("Quyidagi menyudan kerakli bo'limni tanlang:", mainMenuKeyboard());
    });

    async function requireAdmin(ctx, next) {
        const admin = await User.findOne({ telegramId: ctx.from.id, role: 'admin', isActive: true });
        if (!admin) {
            await ctx.answerCbQuery("Ruxsat yo'q. Avval /start bosing.", { show_alert: true }).catch(() => { });
            return;
        }
        ctx.state.admin = admin;
        return next();
    }

    bot.action('menu:main', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText("🏠 Bosh menyu:", mainMenuKeyboard());
    });

    bot.action('menu:stats', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalProducts, totalClients, totalOrders, monthlyAgg, debtAgg, kassa] = await Promise.all([
            Product.countDocuments(),
            Client.countDocuments(),
            Order.countDocuments(),
            Order.aggregate([
                { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
                { $group: { _id: null, revenue: { $sum: '$orderTotal' }, count: { $sum: 1 } } },
            ]),
            Client.aggregate([{ $group: { _id: null, total: { $sum: '$debt' } } }]),
            Kassa.findOne(),
        ]);

        const monthlyRevenue = monthlyAgg[0]?.revenue || 0;
        const monthlyCount = monthlyAgg[0]?.count || 0;
        const totalDebt = debtAgg[0]?.total || 0;

        const text =
            `📊 <b>Umumiy statistika</b>\n\n` +
            `📦 Mahsulot turlari: <b>${totalProducts}</b>\n` +
            `👥 Mijozlar: <b>${totalClients}</b>\n` +
            `🧾 Jami buyurtmalar: <b>${totalOrders}</b>\n\n` +
            `📅 <b>${MONTH_NAMES_UZ[now.getMonth()]}</b> oyi:\n` +
            `　 • Buyurtmalar: <b>${monthlyCount}</b> ta\n` +
            `　 • Savdo summasi: <b>${money(monthlyRevenue)}</b>\n\n` +
            `💰 Kassa balansi: <b>${money(kassa?.balance)}</b>\n` +
            `📉 Umumiy qarzdorlik: <b>${money(totalDebt)}</b>`;

        await ctx.editMessageText(text, { parse_mode: 'HTML', ...backKeyboard() });
    });

    bot.action('menu:products', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const count = await Product.countDocuments();
        await ctx.editMessageText(
            `📦 Omborda jami <b>${count}</b> ta mahsulot turi bor.\nHisobot formatini tanlang:`,
            { parse_mode: 'HTML', ...exportKeyboard('products') }
        );
    });

    bot.action('products:excel', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const products = await Product.find().sort({ category: 1, name: 1 }).lean({ virtuals: true });
        await sendReport(ctx, {
            buildFn: buildProductsExcel,
            args: [products],
            filename: `mahsulotlar_${dayjs().format('YYYY-MM-DD')}.xlsx`,
        });
    });

    bot.action('products:pdf', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const products = await Product.find().sort({ category: 1, name: 1 }).lean({ virtuals: true });
        await sendReport(ctx, {
            buildFn: buildProductsPdf,
            args: [products],
            filename: `mahsulotlar_${dayjs().format('YYYY-MM-DD')}.pdf`,
        });
    });

    bot.action('menu:monthly', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const now = new Date();
        const buttons = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = `${MONTH_NAMES_UZ[d.getMonth()]} ${d.getFullYear()}`;
            const value = `${d.getFullYear()}-${d.getMonth() + 1}`;
            buttons.push([Markup.button.callback(label, `monthly:pick:${value}`)]);
        }
        buttons.push([Markup.button.callback('◀️ Bosh menyu', 'menu:main')]);
        await ctx.editMessageText('📅 Qaysi oy uchun hisobot kerak?', Markup.inlineKeyboard(buttons));
    });

    bot.action(/^monthly:pick:(\d+)-(\d+)$/, requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const [, year, month] = ctx.match;
        const label = `${MONTH_NAMES_UZ[Number(month) - 1]} ${year}`;
        await ctx.editMessageText(
            `🧾 <b>${label}</b> oyi uchun savdo hisoboti.\nFormatni tanlang:`,
            { parse_mode: 'HTML', ...exportKeyboard('monthly', `:${year}-${month}`) }
        );
    });

    bot.action(/^monthly:(excel|pdf):(\d+)-(\d+)$/, requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const [, format, year, month] = ctx.match;
        const start = new Date(Number(year), Number(month) - 1, 1);
        const end = new Date(Number(year), Number(month), 1);

        const orders = await Order.find({ createdAt: { $gte: start, $lt: end } })
            .populate('client', 'name phone')
            .sort({ createdAt: 1 })
            .lean();

        const monthLabel = `${MONTH_NAMES_UZ[Number(month) - 1]} ${year}`;
        const fileLabel = `${MONTH_NAMES_UZ[Number(month) - 1]}_${year}`;

        if (orders.length === 0) {
            return ctx.reply(`ℹ️ ${monthLabel} oyida hech qanday buyurtma topilmadi.`);
        }

        if (format === 'excel') {
            await sendReport(ctx, {
                buildFn: buildOrdersExcel,
                args: [orders, `${monthLabel} — Savdo hisoboti`],
                filename: `savdo_${fileLabel}.xlsx`,
            });
        } else {
            await sendReport(ctx, {
                buildFn: buildOrdersPdf,
                args: [orders, `${monthLabel} — Savdo hisoboti`],
                filename: `savdo_${fileLabel}.pdf`,
            });
        }
    });

    bot.action('menu:kassa', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const kassa = await Kassa.findOne();
        await ctx.editMessageText(
            `💰 Joriy kassa balansi: <b>${money(kassa?.balance)}</b>\n\nOxirgi 500 ta harakat bo'yicha hisobot:`,
            { parse_mode: 'HTML', ...exportKeyboard('kassa') }
        );
    });

    bot.action('kassa:excel', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const history = await KassaTransaction.find()
            .populate('client', 'name')
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();
        await sendReport(ctx, {
            buildFn: buildKassaExcel,
            args: [history],
            filename: `kassa_${dayjs().format('YYYY-MM-DD')}.xlsx`,
        });
    });

    bot.action('kassa:pdf', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const history = await KassaTransaction.find()
            .populate('client', 'name')
            .populate('user', 'name')
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();
        await sendReport(ctx, {
            buildFn: buildKassaPdf,
            args: [history],
            filename: `kassa_${dayjs().format('YYYY-MM-DD')}.pdf`,
        });
    });

    bot.action('menu:debtors', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery();
        const count = await Client.countDocuments({ debt: { $gt: 0 } });
        await ctx.editMessageText(
            `👥 Qarzdor mijozlar soni: <b>${count}</b>\nHisobot formatini tanlang:`,
            { parse_mode: 'HTML', ...exportKeyboard('debtors') }
        );
    });

    bot.action('debtors:excel', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const clients = await Client.find({ debt: { $gt: 0 } }).sort({ debt: -1 }).lean();
        await sendReport(ctx, {
            buildFn: buildDebtorsExcel,
            args: [clients],
            filename: `qarzdorlar_${dayjs().format('YYYY-MM-DD')}.xlsx`,
        });
    });

    bot.action('debtors:pdf', requireAdmin, async (ctx) => {
        await ctx.answerCbQuery('Tayyorlanmoqda...');
        const clients = await Client.find({ debt: { $gt: 0 } }).sort({ debt: -1 }).lean();
        await sendReport(ctx, {
            buildFn: buildDebtorsPdf,
            args: [clients],
            filename: `qarzdorlar_${dayjs().format('YYYY-MM-DD')}.pdf`,
        });
    });

    bot.on('text', async (ctx, next) => {
        if (ctx.message.text.startsWith('/')) return next();
        const admin = await User.findOne({ telegramId: ctx.from.id, role: 'admin', isActive: true });
        if (!admin) {
            return ctx.reply("Botdan foydalanish uchun /start buyrug'ini yuboring va telefon raqamingizni ulashing.");
        }
        return ctx.reply("Menyuni ochish uchun /start buyrug'ini yuboring.");
    });

    bot.catch((err, ctx) => {
        console.error(`[Bot] Xatolik (${ctx.updateType}):`, err);
    });

    await launchWithRetry(bot);
    console.log('[Bot] Telegram bot ishga tushdi ✅');

    process.on('unhandledRejection', (reason) => {
        console.error('[Bot] Unhandled promise rejection:', reason);
    });
    process.on('uncaughtException', (err) => {
        console.error('[Bot] Uncaught exception:', err);
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}
