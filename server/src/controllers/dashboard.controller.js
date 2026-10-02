import { config } from '../config/index.js';
import { sendSuccess } from '../lib/helpers.js';
import { dashboardStore, getCache, setCache } from '../lib/cache.js';
import { Client, Order, Product } from '../models/index.js';
import {
    addLocalDays,
    currentMonthKey,
    getTimezoneOffsetMinutes,
    getTimezoneOffsetMs,
    localParts,
    monthKeyRange,
    normalizeMonthKey,
    parseMonthKey,
    shiftMonthKey,
    startOfLocalDay,
    UZ_MONTH_NAMES,
} from '../lib/datetime.js';

/**
 * Berilgan oy kaliti bo'yicha Dashboard statistikasini hisoblaydi.
 * - Kumulyativ ko'rsatkichlar (jami mahsulotlar, mijozlar, jami buyurtmalar,
 *   jami qarz, ombor qiymati, 6 oylik trend) — doim barcha davr bo'yicha.
 * - Tanlangan oyga bog'liq ko'rsatkichlar (oylik savdo, oylik daromad, kunlik
 *   trend, eng ko'p sotilgan mahsulotlar, so'nggi buyurtmalar, holat taqsimoti)
 *   — faqat shu oyning ma'lumotlari bilan hisoblanadi.
 * - Balans (kassa) alohida /kassa endpointidan olinadi va kumulyativ qoladi.
 */
async function computeStats(monthKey, offsetMinutes, offsetMs) {
    const parsed = parseMonthKey(monthKey);
    const now = new Date();

    // ---- Vaqt chegaralari ----
    // Tanlangan oy (yoki joriy oy, agar monthKey bo'lmasa)
    const selectedRange = monthKeyRange(monthKey, offsetMinutes);
    const startOfSelectedMonth = selectedRange.start;
    const endOfSelectedMonthExclusive = selectedRange.endExclusive;

    // Oldingi oy (o'sish foizini hisoblash uchun)
    const prevMonthKey = shiftMonthKey(monthKey, -1);
    const prevRange = monthKeyRange(prevMonthKey, offsetMinutes);
    const startOfPrevMonth = prevRange.start;
    const endOfPrevMonthExclusive = prevRange.endExclusive;

    // Bugun (faqat joriy oyda bo'lsak "bugungi savdo" ko'rsatkichi ishlaydi)
    const nowParts = localParts(now, offsetMinutes);
    const isCurrentMonth = nowParts.year === parsed.year && nowParts.month === parsed.month;
    const startOfToday = startOfLocalDay(now, offsetMinutes);

    // Trendlar:
    // - 6 oylik daromad dinamikasi — tanlangan oygacha bo'lgan 6 oy (kontekst uchun)
    const sixMonthsAgo = monthKeyRange(shiftMonthKey(monthKey, -5), offsetMinutes).start;
    // - Kunlik trend — tanlangan oyning barcha kunlari (30 kun emas!)
    const daysInSelected = [];
    {
        let cursor = startOfSelectedMonth;
        let guard = 0;
        while (cursor.getTime() < endOfSelectedMonthExclusive.getTime() && guard < 40) {
            daysInSelected.push(cursor);
            cursor = addLocalDays(cursor, 1, offsetMinutes);
            guard += 1;
        }
    }
    const startOfSelectedForDaily = startOfSelectedMonth;

    const [
        totalProducts,
        totalClients,
        totalOrders,
        todaysOrders,
        monthlyOrders,
        lastMonthOrders,
        revenueAggAllTime,
        revenueAgg,
        lastMonthRevenueAgg,
        debtAgg,
        totalKgAgg,
        topProductsAllTime,
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
        // Bugungi buyurtmalar — faqat tanlangan oy joriy oy bo'lsa; aks holda 0
        isCurrentMonth
            ? Order.countDocuments({ createdAt: { $gte: startOfToday } })
            : Promise.resolve(0),
        // Oylik buyurtmalar — tanlangan oy
        Order.countDocuments({ createdAt: { $gte: startOfSelectedMonth, $lt: endOfSelectedMonthExclusive } }),
        // O'tgan oy buyurtmalar (o'sish uchun)
        Order.countDocuments({ createdAt: { $gte: startOfPrevMonth, $lt: endOfPrevMonthExclusive } }),

        // Umumiy daromad (barcha davr) — balans kabi kumulyativ ko'rsatkich
        Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: null, total: { $sum: '$orderTotal' } } },
        ]),
        // Tanlangan oy daromadi
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: startOfSelectedMonth, $lt: endOfSelectedMonthExclusive },
                },
            },
            { $group: { _id: null, total: { $sum: '$orderTotal' } } },
        ]),
        // O'tgan oy daromadi
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: startOfPrevMonth, $lt: endOfPrevMonthExclusive },
                },
            },
            { $group: { _id: null, total: { $sum: '$orderTotal' } } },
        ]),

        // Jami qarz — kumulyativ
        Client.aggregate([{ $group: { _id: null, total: { $sum: '$debt' } } }]),

        // Ombor — kumulyativ
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
                        $sum: { $ifNull: ["$sizes.total", 0] }
                    },
                },
            },
        ]),

        // TOP-5 mahsulotlar — barcha davr (kumulyativ)
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

        // So'nggi 10 buyurtma — tanlangan oy
        Order.find({ createdAt: { $gte: startOfSelectedMonth, $lt: endOfSelectedMonthExclusive } })
            .populate('client', 'name phone')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),

        // 6 oylik trend — tanlangan oygacha
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: sixMonthsAgo, $lt: endOfSelectedMonthExclusive },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: { $subtract: ['$createdAt', offsetMs] } },
                        month: { $month: { $subtract: ['$createdAt', offsetMs] } },
                    },
                    revenue: { $sum: '$orderTotal' },
                    ordersCount: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]),

        // Kunlik trend — tanlangan oyning barcha kunlari
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: startOfSelectedForDaily, $lt: endOfSelectedMonthExclusive },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: { $subtract: ['$createdAt', offsetMs] } },
                        month: { $month: { $subtract: ['$createdAt', offsetMs] } },
                        day: { $dayOfMonth: { $subtract: ['$createdAt', offsetMs] } },
                    },
                    revenue: { $sum: '$orderTotal' },
                    ordersCount: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]),

        // Buyurtma holatlari — tanlangan oy
        Order.aggregate([
            { $match: { createdAt: { $gte: startOfSelectedMonth, $lt: endOfSelectedMonthExclusive } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    total: { $sum: '$orderTotal' },
                },
            },
        ]),

        // Eng ko'p qarzdor mijozlar — kumulyativ (qarzga oy cheklovi yo'q)
        Client.find({})
            .sort({ debt: -1 })
            .limit(5)
            .select('name phone debt')
            .lean(),
    ]);

    const monthNames = UZ_MONTH_NAMES;

    // ---- 6 oylik trendni shakllantirish ----
    const monthlyTrendMap = new Map(
        monthlyTrend.map((m) => [`${m._id.year}-${String(m._id.month).padStart(2, '0')}`, m])
    );
    const monthlyRevenueTrend = [];
    for (let i = 5; i >= 0; i -= 1) {
        const key = shiftMonthKey(monthKey, -i);
        const p = parseMonthKey(key);
        const found = monthlyTrendMap.get(key);
        monthlyRevenueTrend.push({
            month: monthNames[p.month - 1],
            year: p.year,
            revenue: found?.revenue || 0,
            ordersCount: found?.ordersCount || 0,
        });
    }

    // ---- Kunlik trend (tanlangan oyning har bir kuni) ----
    const dailyTrendMap = new Map(
        dailyTrend.map((d) => [`${d._id.year}-${d._id.month}-${d._id.day}`, d])
    );
    const dailyRevenueTrend = daysInSelected.map((day) => {
        const parts = localParts(day, offsetMinutes);
        const key = `${parts.year}-${parts.month}-${parts.day}`;
        const found = dailyTrendMap.get(key);
        return {
            date: `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}`,
            revenue: found?.revenue || 0,
            ordersCount: found?.ordersCount || 0,
        };
    });

    // ---- Holatlar taqsimoti ----
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

    // ---- TOP mahsulotlar ----
    const topProductsChart = topProductsAllTime.map((p) => ({
        name: p._id,
        quantityKg: p.totalQuantityKg,
        revenue: p.totalRevenue,
    }));

    // ---- O'sish ko'rsatkichlari (oy nisbat oy) ----
    const selectedRevenue = revenueAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;
    const totalRevenueAllTime = revenueAggAllTime[0]?.total || 0;

    const revenueGrowthPercent = lastMonthRevenue > 0
        ? Number((((selectedRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1))
        : (selectedRevenue > 0 ? 100 : 0);

    const ordersGrowthPercent = lastMonthOrders > 0
        ? Number((((monthlyOrders - lastMonthOrders) / lastMonthOrders) * 100).toFixed(1))
        : (monthlyOrders > 0 ? 100 : 0);

    const warehouseValue = totalKgAgg[0]?.warehouseValue || 0;
    const warehouseKg = totalKgAgg[0]?.warehouseKg || 0;

    return {
        // Tanlangan oy haqida ma'lumot
        selectedMonth: monthKey,
        selectedMonthLabel: selectedRange.label,
        currentMonth: currentMonthKey(new Date(), offsetMinutes),
        isCurrentMonth,

        // Kumulyativ ko'rsatkichlar (oyga bog'liq emas)
        totalProducts,
        totalClients,
        totalOrders,
        totalDebt: debtAgg[0]?.total || 0,
        totalKg: warehouseKg,
        warehouseValue: warehouseValue,
        totalRevenueAllTime,

        // Tanlangan oy ko'rsatkichlari
        todaysOrders: isCurrentMonth ? todaysOrders : 0,
        monthlyOrders,
        revenue: selectedRevenue,

        // O'sish (o'tgan oyga nisbatan)
        growth: {
            revenuePercent: revenueGrowthPercent,
            ordersPercent: ordersGrowthPercent,
            lastMonthRevenue,
            lastMonthOrders,
            selectedMonthLabel: selectedRange.label,
            previousMonthLabel: prevRange.label,
        },

        topProducts: topProductsChart,
        latestOrders,

        charts: {
            monthlyRevenueTrend,
            dailyRevenueTrend,
            orderStatusChart,
            topClientsByDebt: topClients,
        },
    };
}

const dashboardController = {
    async stats(req, res) {
        const now = new Date();
        const offsetMinutes = getTimezoneOffsetMinutes();
        const offsetMs = getTimezoneOffsetMs();
        const currentKey = currentMonthKey(now, offsetMinutes);

        // ---- So'rovdan oyni aniqlash ----
        const rawMonth = req.query.month ? String(req.query.month).trim() : '';
        let monthKey;
        if (rawMonth) {
            const normalized = normalizeMonthKey(rawMonth);
            if (!normalized) {
                return res.status(400).json({
                    success: false,
                    message: `Oy formati noto'g'ri: "${req.query.month}". YYYY-MM ko'rinishida yuboring (masalan: 2026-09).`,
                });
            }
            monthKey = normalized;
        } else {
            monthKey = currentKey;
        }

        // ---- Keshlash (oy bo'yicha) ----
        const cacheKey = monthKey;
        if (dashboardStore.monthKey === cacheKey) {
            const cached = getCache(dashboardStore);
            if (cached) {
                return sendSuccess(res, 200, "Statistika ma'lumotlari.", cached);
            }
        }
        // Boshqa oy tanlangan bo'lsa — eski keshni tozalaymiz
        dashboardStore.monthKey = null;

        const payload = await computeStats(monthKey, offsetMinutes, offsetMs);

        dashboardStore.monthKey = cacheKey;
        setCache(dashboardStore, payload, config.dashboardCacheTtl);
        return sendSuccess(res, 200, "Statistika ma'lumotlari.", payload);
    },
};

export default dashboardController;
