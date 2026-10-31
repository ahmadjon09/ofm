import { config } from '../config/index.js';
import { sendSuccess } from '../lib/helpers.js';
import { dashboardStore, getCache, setCache } from '../lib/cache.js';
import { Client, Order, Product } from '../models/index.js';
import {
    addLocalDays,
    formatDayKey,
    getTimezoneOffsetMinutes,
    getTimezoneOffsetMs,
    listDayKeys,
    localParts,
    monthKeyRange,
    shiftMonthKey,
    startOfLocalDay,
    UZ_MONTH_NAMES,
} from '../lib/datetime.js';
import {
    comparisonLabel,
    previousPeriodRange,
    resolvePeriodRange,
    serializeRange,
} from '../lib/period.js';

const MAX_DAILY_CHART_DAYS = 62;

const STATUS_LABELS = {
    pending: 'Kutilmoqda',
    processing: 'Jarayonda',
    completed: 'Bajarilgan',
    cancelled: 'Bekor qilingan',
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Dashboard statistikasi — YAGONA VAQT DOIRASI bo'yicha.
 *
 * MUHIM QOIDA: barcha asosiy ko'rsatkichlar (buyurtmalar soni, tushum, aktiv
 * mijozlar, o'rtacha chek, top mahsulotlar, holatlar taqsimoti, grafiklar)
 * tanlangan davr uchun hisoblanadi. Standart davr — JORIY OY (1-kunidan
 * bugungacha). "Barcha davr" yig'indisi faqat foydalanuvchi ataylab
 * "Barcha vaqt" ni tanlaganda ko'rsatiladi.
 *
 * Faqat ombor qoldig'i va mijoz qarzi — bu DAVR emas, BUGUNGI HOLAT (balans)
 * ko'rsatkichlari. Ular alohida guruhda, aniq izoh bilan qaytariladi.
 */
async function computeStats(range, now, offsetMinutes, offsetMs) {
    const rangeFilter = range.start && range.endExclusive
        ? { createdAt: { $gte: range.start, $lt: range.endExclusive } }
        : {};
    const notCancelledRangeFilter = { ...rangeFilter, status: { $ne: 'cancelled' } };

    // ---- Bugungi kun chegaralari ----
    const startOfToday = startOfLocalDay(now, offsetMinutes);
    const startOfTomorrow = addLocalDays(startOfToday, 1, offsetMinutes);

    // ---- Taqqoslash davri (o'sish foizi uchun) ----
    const prevRange = previousPeriodRange(range, { now, offsetMinutes });
    const prevFilter = prevRange ? { createdAt: { $gte: prevRange.start, $lt: prevRange.endExclusive } } : null;

    // ---- Oylik trend: davr tugagan oydan boshlab 6 oy ----
    const rangeEndParts = range.endExclusive
        ? localParts(new Date(range.endExclusive.getTime() - 1), offsetMinutes)
        : localParts(now, offsetMinutes);
    const anchorMonthKey = `${rangeEndParts.year}-${String(rangeEndParts.month).padStart(2, '0')}`;
    const trendStart = monthKeyRange(shiftMonthKey(anchorMonthKey, -5), offsetMinutes).start;
    const trendEndExclusive = monthKeyRange(anchorMonthKey, offsetMinutes).endExclusive;

    // ---- Kunlik trend oynasi ----
    // Davr 62 kungacha bo'lsa — davrning har bir kuni; aks holda (barcha vaqt
    // yoki juda uzoq davr) — so'nggi 30 kun. Bu grafikni o'qishga qulay qiladi.
    const usePeriodForDaily = !!(range.start && range.endExclusive && range.days && range.days <= MAX_DAILY_CHART_DAYS);
    const dailyStart = usePeriodForDaily ? range.start : startOfLocalDay(addLocalDays(now, -29), offsetMinutes);
    const dailyEndExclusive = usePeriodForDaily ? range.endExclusive : startOfLocalDay(addLocalDays(now, 1), offsetMinutes);
    const dailyMode = usePeriodForDaily ? 'period' : 'last-30-days';

    const [
        statusBreakdown,
        activeClientIds,
        newClients,
        revenueAgg,
        itemsAgg,
        latestOrders,
        topProductsAgg,
        monthlyTrend,
        dailyTrend,
        stockAgg,
        productCount,
        debtAgg,
        topClients,
        todayOrders,
        todayRevenueAgg,
        prevOrders,
        prevRevenueAgg,
    ] = await Promise.all([
        // Davr bo'yicha holatlar taqsimoti
        Order.aggregate([
            { $match: rangeFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    total: { $sum: '$orderTotal' },
                },
            },
        ]),

        // Davrda kamida bitta (bekor qilinmagan) buyurtma bergan mijozlar
        Order.distinct('client', notCancelledRangeFilter),

        // Davrda qo'shilgan yangi mijozlar
        Client.countDocuments(rangeFilter),

        // Davr tushumi (bekor qilingan buyurtmalarsiz)
        Order.aggregate([
            { $match: notCancelledRangeFilter },
            { $group: { _id: null, total: { $sum: '$orderTotal' } } },
        ]),

        // Davrda sotilgan kg va qutilar
        Order.aggregate([
            { $match: notCancelledRangeFilter },
            { $unwind: '$items' },
            {
                $group: {
                    _id: null,
                    kg: { $sum: '$items.quantityKg' },
                    boxes: { $sum: '$items.quantityBoxes' },
                },
            },
        ]),

        // Davrning so'nggi buyurtmalari
        Order.find(rangeFilter)
            .populate('client', 'name phone')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),

        // Davrda eng ko'p sotilgan mahsulotlar (TOP-5)
        Order.aggregate([
            { $match: notCancelledRangeFilter },
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

        // 6 oylik daromad dinamikasi (kontekst uchun)
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: trendStart, $lt: trendEndExclusive },
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

        // Kunlik daromad
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: dailyStart, $lt: dailyEndExclusive },
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

        // Ombor qoldig'i (bugungi holat)
        Product.aggregate([
            { $unwind: '$sizes' },
            {
                $group: {
                    _id: null,
                    warehouseValue: {
                        $sum: {
                            $multiply: [
                                { $ifNull: ['$sizes.total', 0] },
                                { $ifNull: ['$sizes.price', 0] },
                            ],
                        },
                    },
                    warehouseKg: { $sum: { $ifNull: ['$sizes.total', 0] } },
                    warehouseBoxes: { $sum: { $ifNull: ['$sizes.boxes', 0] } },
                },
            },
        ]),
        Product.countDocuments({}),

        // Mijozlar qarzi (bugungi holat)
        Client.aggregate([
            { $match: { debt: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$debt' }, count: { $sum: 1 } } },
        ]),

        // Eng ko'p qarzdor mijozlar (bugungi holat)
        Client.find({ debt: { $gt: 0 } })
            .sort({ debt: -1 })
            .limit(5)
            .select('name phone debt')
            .lean(),

        // Bugun
        Order.countDocuments({ createdAt: { $gte: startOfToday, $lt: startOfTomorrow } }),
        Order.aggregate([
            {
                $match: {
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: startOfToday, $lt: startOfTomorrow },
                },
            },
            { $group: { _id: null, total: { $sum: '$orderTotal' } } },
        ]),

        // Taqqoslash davri
        prevFilter ? Order.countDocuments(prevFilter) : Promise.resolve(null),
        prevFilter
            ? Order.aggregate([
                { $match: { ...prevFilter, status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ])
            : Promise.resolve(null),
    ]);

    // ---- Holatlar bo'yicha yig'indi ----
    const statusCounts = { pending: 0, completed: 0, cancelled: 0 };
    const statusAmounts = { pending: 0, completed: 0, cancelled: 0 };
    for (const row of statusBreakdown) {
        if (statusCounts[row._id] === undefined) {
            statusCounts[row._id] = 0;
            statusAmounts[row._id] = 0;
        }
        statusCounts[row._id] += row.count || 0;
        statusAmounts[row._id] += row.total || 0;
    }

    const periodOrders = statusBreakdown.reduce((sum, row) => sum + (row.count || 0), 0);
    const cancelledOrders = statusCounts.cancelled || 0;
    const completedOrders = statusCounts.completed || 0;
    const pendingOrders = (periodOrders - cancelledOrders - completedOrders) || 0;

    const revenue = roundMoney(revenueAgg[0]?.total || 0);
    const billableOrders = Math.max(periodOrders - cancelledOrders, 0);
    const avgOrderValue = billableOrders > 0 ? roundMoney(revenue / billableOrders) : 0;

    const activeClients = (activeClientIds || []).filter(Boolean).length;
    const totalKg = Math.round((itemsAgg[0]?.kg || 0) * 100) / 100;
    const totalBoxes = Math.round(itemsAgg[0]?.boxes || 0);

    // ---- O'sish foizi (faqat taqqoslash uchun baza mavjud bo'lsa) ----
    const prevRevenue = roundMoney(prevRevenueAgg?.[0]?.total || 0);
    const prevOrderCount = prevOrders || 0;
    const percentChange = (current, previous) => (
        previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null
    );
    const growth = {
        revenuePercent: prevRange ? percentChange(revenue, prevRevenue) : null,
        ordersPercent: prevRange ? percentChange(periodOrders, prevOrderCount) : null,
        comparisonLabel: comparisonLabel(range),
        previousRevenue: prevRevenue,
        previousOrders: prevOrderCount,
    };

    // ---- Grafiklar ----
    const monthlyTrendMap = new Map(
        monthlyTrend.map((row) => [`${row._id.year}-${String(row._id.month).padStart(2, '0')}`, row])
    );
    const monthlyRevenueTrend = [];
    for (let i = 5; i >= 0; i -= 1) {
        const key = shiftMonthKey(anchorMonthKey, -i);
        const [year, month] = key.split('-').map(Number);
        const found = monthlyTrendMap.get(key);
        monthlyRevenueTrend.push({
            key,
            month: UZ_MONTH_NAMES[month - 1],
            year,
            revenue: found?.revenue || 0,
            ordersCount: found?.ordersCount || 0,
        });
    }

    const dailyTrendMap = new Map(
        dailyTrend.map((row) => [`${row._id.year}-${row._id.month}-${row._id.day}`, row])
    );
    const dailyRevenueTrend = listDayKeys(dailyStart, dailyEndExclusive, offsetMinutes).map((dayKey) => {
        const [year, month, day] = dayKey.split('-').map(Number);
        const found = dailyTrendMap.get(`${year}-${month}-${day}`);
        return {
            date: `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`,
            fullDate: dayKey,
            revenue: found?.revenue || 0,
            ordersCount: found?.ordersCount || 0,
        };
    });

    const orderStatusChart = Object.entries(statusCounts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
            status,
            label: STATUS_LABELS[status] || status,
            count,
            total: roundMoney(statusAmounts[status] || 0),
        }));

    const topProducts = topProductsAgg.map((row) => ({
        name: row._id || "Noma'lum mahsulot",
        quantityKg: Math.round((row.totalQuantityKg || 0) * 100) / 100,
        revenue: roundMoney(row.totalRevenue || 0),
    }));

    const warehouseValue = roundMoney(stockAgg[0]?.warehouseValue || 0);
    const warehouseKg = Math.round((stockAgg[0]?.warehouseKg || 0) * 100) / 100;
    const warehouseBoxes = Math.round(stockAgg[0]?.warehouseBoxes || 0);
    const totalDebt = roundMoney(debtAgg[0]?.total || 0);
    const debtorsCount = debtAgg[0]?.count || 0;

    const todayRevenue = roundMoney(todayRevenueAgg[0]?.total || 0);
    const rangeInfo = serializeRange(range);

    const payload = {
        // ---- Qo'llanilgan davr (UI shu ma'lumotga tayanadi) ----
        range: rangeInfo,

        // ---- DAVR ko'rsatkichlari (asosiy metrikalar) ----
        period: {
            orders: periodOrders,
            revenue,
            avgOrderValue,
            activeClients,
            newClients,
            completedOrders,
            pendingOrders,
            cancelledOrders,
            cancelledAmount: roundMoney(statusAmounts.cancelled || 0),
            totalKg,
            totalBoxes,
            hasOrders: periodOrders > 0,
        },

        // ---- Taqqoslash ----
        previous: {
            range: serializeRange(prevRange),
            orders: prevRange ? prevOrderCount : null,
            revenue: prevRange ? prevRevenue : null,
        },
        growth,

        // ---- BUGUNGI HOLAT (davrga bog'liq emas) ----
        stock: {
            products: productCount,
            value: warehouseValue,
            kg: warehouseKg,
            boxes: warehouseBoxes,
        },
        debts: {
            total: totalDebt,
            debtors: debtorsCount,
        },
        today: {
            orders: todayOrders,
            revenue: todayRevenue,
            inRange: !!range.includesToday,
        },

        // ---- Ro'yxatlar va grafiklar (davr bo'yicha) ----
        topProducts,
        latestOrders,
        charts: {
            monthlyRevenueTrend,
            dailyRevenueTrend,
            daily: {
                mode: dailyMode,
                label: dailyMode === 'period' ? range.label : "So'nggi 30 kun",
                startDate: formatDayKey(dailyStart, offsetMinutes),
                endDate: formatDayKey(new Date(dailyEndExclusive.getTime() - 1), offsetMinutes),
            },
            orderStatusChart,
            // Qarzdorlik — balans ko'rsatkichi, davrga bog'lanmaydi
            topClientsByDebt: topClients,
        },

        // ---- Moslik uchun eski maydonlar (eski klientlar buzilmasin) ----
        selectedMonth: range.monthKey,
        selectedMonthLabel: range.label,
        isCurrentMonth: range.isCurrentMonth,
        totalProducts: productCount,
        totalClients: activeClients,
        totalOrders: periodOrders,
        monthlyOrders: periodOrders,
        revenue,
        totalDebt,
        totalKg: warehouseKg,
        warehouseValue,
        todaysOrders: todayOrders,
    };

    return payload;
}

const dashboardController = {
    async stats(req, res) {
        const now = new Date();
        const offsetMinutes = getTimezoneOffsetMinutes();
        const offsetMs = getTimezoneOffsetMs();

        // Standart: JORIY OY. Noto'g'ri parametrlar uchun period lib 400 beradi.
        const range = resolvePeriodRange(req.query, { now, offsetMinutes });

        const cacheKey = [
            range.mode,
            range.start ? range.start.toISOString() : 'all',
            range.endExclusive ? range.endExclusive.toISOString() : 'all',
        ].join('|');

        if (dashboardStore.cacheKey === cacheKey) {
            const cached = getCache(dashboardStore);
            if (cached) {
                return sendSuccess(res, 200, "Statistika ma'lumotlari.", cached);
            }
        }
        // Boshqa davr tanlangan bo'lsa — eski keshni tozalaymiz
        dashboardStore.cacheKey = null;

        const payload = await computeStats(range, now, offsetMinutes, offsetMs);

        dashboardStore.cacheKey = cacheKey;
        setCache(dashboardStore, payload, config.dashboardCacheTtl);
        return sendSuccess(res, 200, "Statistika ma'lumotlari.", payload);
    },
};

export default dashboardController;
