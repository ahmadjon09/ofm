import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import https from 'https';
import {
    buildProductsExcel,
    buildOrdersExcel,
    buildDebtorsExcel,
    buildKassaExcel,
} from './utils/reportexcel.js';
import {
    buildProductsPdf,
    buildOrdersPdf,
    buildDebtorsPdf,
    buildKassaPdf,
} from './utils/reportpdf.js';

// Telegram API'ga (ayniqsa katta fayl yuborishda) barqarorroq ulanish uchun
// maxsus HTTPS agent: ulanishni saqlab turadi (keepAlive) va uzunroq kutadi.
const telegramAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    maxSockets: 50,
    timeout: 120000, // 120s — katta fayl yuklash uchun yetarli vaqt
});

const MONTH_NAMES_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

// Telefon raqamlarni turlicha formatda (+998..., 998..., bo'sh joylar bilan)
// solishtirish uchun faqat raqamlarni qoldirib, oxirgi 9 ta raqamini olamiz.
function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.slice(-9);
}

function money(n) {
    return `${Number(n || 0).toLocaleString('ru-RU')} $`;
}

// ---------------------------------------------------------------------------
// KEYBOARDLAR
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hisobot yaratish + yuborishni xavfsiz bajaruvchi wrapper
// (xato yuz bersa foydalanuvchiga ham, Render logiga ham to'liq ma'lumot beradi)
// ---------------------------------------------------------------------------
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

async function sendReport(ctx, { buildFn, args = [], filename }) {
    const startedAt = Date.now();
    let buffer;

    try {
        console.log(`[Report] Boshlandi: ${filename}`);
        buffer = await buildFn(...args);

        if (!buffer || buffer.length === 0) {
            throw new Error('Hisobot bo\'sh buffer qaytardi (0 bayt)');
        }

        console.log(`[Report] Tayyor: ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${Date.now() - startedAt}ms)`);
    } catch (err) {
        console.error(`[Report] Yaratishda XATOLIK (${filename}):`, err);
        await ctx.reply(
            `❌ Hisobotni tayyorlashda xatolik yuz berdi.\nSabab: ${err.message || 'Noma\'lum xatolik'}`
        ).catch(() => { });
        return;
    }

    // Yuborishda ("socket hang up" kabi) vaqtinchalik tarmoq xatolari uchun
    // 3 martagacha qayta urinamiz (kutish vaqti oshib boradi: 1s, 3s, 6s).
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await ctx.replyWithDocument({ source: buffer, filename });
            console.log(`[Report] Yuborildi: ${filename} (${attempt}-urinish)`);
            return;
        } catch (err) {
            const transient = isTransientNetworkError(err);
            console.error(
                `[Report] Yuborishda XATOLIK (${filename}), urinish ${attempt}/${maxAttempts}, transient=${transient}:`,
                err
            );

            if (!transient || attempt === maxAttempts) {
                await ctx.reply(
                    `❌ Faylni yuborishda xatolik yuz berdi (${attempt}-urinishdan keyin).\n` +
                    `Sabab: ${err.message || 'Noma\'lum xatolik'}\n\n` +
                    `Iltimos, qayta urinib ko'ring yoki administratorga xabar bering.`
                ).catch(() => { });
                return;
            }

            await sleep(attempt * 3000);
        }
    }
}

// ---------------------------------------------------------------------------
// BOTNI ISHGA TUSHIRISH
// ---------------------------------------------------------------------------

export async function startBot() {
    const token = process.env.BOT_TOKEN;
    if (!token) {
        console.warn('[Bot] BOT_TOKEN topilmadi (.env). Telegram bot ishga tushirilmadi.');
        return null;
    }

    // server.js allaqachon ro'yxatdan o'tkazgan modellar shu yerda qayta olinadi.
    const User = mongoose.model('User');
    const Product = mongoose.model('Product');
    const Client = mongoose.model('Client');
    const Order = mongoose.model('Order');
    const Kassa = mongoose.model('Kassa');
    const KassaTransaction = mongoose.model('KassaTransaction');

    const bot = new Telegraf(token, {
        telegram: {
            agent: telegramAgent,
            // sendDocument kabi og'ir so'rovlar uchun standart timeout'ni kengaytiramiz
            webhookReply: false,
        },
        handlerTimeout: 180000, // 3 daqiya — hisobot tayyorlash + yuborish uchun
    });

    // ---- /start: admin allaqachon bog'langanmi tekshiramiz ----
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

    // ---- Kontakt (telefon raqam) qabul qilish ----
    bot.on('contact', async (ctx) => {
        const contact = ctx.message.contact;

        // Faqat o'zining raqamini ulashishi shart (boshqa odamning kontaktini emas)
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

    // ---- Har bir callback tugmasidan oldin admin ekanini tekshiramiz ----
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

    // -------------------------------------------------------------------
    // STATISTIKA
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // MAHSULOTLAR (ombordagi joriy holat)
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // OYLIK SAVDO HISOBOTI (oy tanlanadi -> shu oydagi buyurtmalar)
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // KASSA
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // QARZDOR MIJOZLAR
    // -------------------------------------------------------------------
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

    // -------------------------------------------------------------------
    // Boshqa har qanday matn
    // -------------------------------------------------------------------
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

    // Render qayta deploy/restart qilganda eski instance bilan
    // "409 Conflict" bo'lmasligi uchun eski pending update'larni tashlab yuboramiz.
    await bot.launch({ dropPendingUpdates: true });
    console.log('[Bot] Telegram bot ishga tushdi ✅');

    // Xotira yoki kutilmagan xatoliklar sabab process jimgina o'lib qolmasligi
    // uchun (Render logida ko'rinishi kerak):
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