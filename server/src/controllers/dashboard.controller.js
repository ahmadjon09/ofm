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
    parseMonthKey,
    shiftMonthKey,
    startOfLocalDay,
    startOfLocalMonth,
    UZ_MONTH_NAMES,
} from '../lib/datetime.js';
const dashboardController = {
    async stats(req, res) {
        const cached = getCache(dashboardStore);
        if (cached) {
            return sendSuccess(res, 200, "Statistika ma'lumotlari.", cached);
        }

        const now = new Date();
        // Barcha davr chegaralari ish mintaqasi (TIMEZONE_OFFSET_MINUTES) bo'yicha,
        // shunda Dashboard raqamlari Kassa sahifasidagi oylik ko'rsatkichlar bilan mos keladi.
        const offsetMinutes = getTimezoneOffsetMinutes();
        const offsetMs = getTimezoneOffsetMs();
        const monthKey = currentMonthKey(now, offsetMinutes);
        const startOfToday = startOfLocalDay(now, offsetMinutes);
        const startOfMonth = startOfLocalMonth(now, offsetMinutes);
        const lastMonthRange = monthKeyRange(shiftMonthKey(monthKey, -1), offsetMinutes);
        const startOfLastMonth = lastMonthRange.start;
        const endOfLastMonthExclusive = lastMonthRange.endExclusive;

        const sixMonthsAgo = monthKeyRange(shiftMonthKey(monthKey, -5), offsetMinutes).start;
        const thirtyDaysAgo = addLocalDays(startOfLocalDay(now, offsetMinutes), -29, offsetMinutes);

        const [
            totalProducts,
            totalClients,
            totalOrders,
            todaysOrders,
            monthlyOrders,
            lastMonthOrders,
            revenueAgg,
            lastMonthRevenueAgg,
            debtAgg,
            totalKgAgg,
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
            Order.countDocuments({ createdAt: { $gte: startOfToday } }),
            Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
            Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: endOfLastMonthExclusive } }),

            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ]),
            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: startOfLastMonth, $lt: endOfLastMonthExclusive },
                    },
                },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ]),

            Client.aggregate([{ $group: { _id: null, total: { $sum: '$debt' } } }]),

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
                            $sum: {
                                $ifNull: ["$sizes.total", 0]
                            }
                        }
                    }
                }
            ]),

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

            Order.find({}).populate('client', 'name phone').sort({ createdAt: -1 }).limit(10).lean(),

            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: sixMonthsAgo },
                    },
                },
                {
                    $group: {
                        // createdAt dan mintaqa siljishini ayiramiz -> UTC bo'laklari
                        // mahalliy vaqtga teng bo'ladi (MongoDB timezone opsiyasisiz ham ishlaydi).
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

            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: thirtyDaysAgo },
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

            Order.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        total: { $sum: '$orderTotal' },
                    },
                },
            ]),

            Client.find({})
                .sort({ debt: -1 })
                .limit(5)
                .select('name phone debt')
                .lean(),
        ]);

        const monthNames = UZ_MONTH_NAMES;

        const monthlyTrendMap = new Map(
            monthlyTrend.map((m) => [`${m._id.year}-${String(m._id.month).padStart(2, '0')}`, m])
        );
        const monthlyRevenueTrend = [];
        for (let i = 5; i >= 0; i -= 1) {
            const key = shiftMonthKey(monthKey, -i);
            const parsed = parseMonthKey(key);
            const found = monthlyTrendMap.get(key);
            monthlyRevenueTrend.push({
                month: monthNames[parsed.month - 1],
                year: parsed.year,
                revenue: found?.revenue || 0,
                ordersCount: found?.ordersCount || 0,
            });
        }

        const dailyTrendMap = new Map(
            dailyTrend.map((d) => [`${d._id.year}-${d._id.month}-${d._id.day}`, d])
        );
        const dailyRevenueTrend = [];
        for (let i = 29; i >= 0; i--) {
            const day = addLocalDays(startOfLocalDay(now, offsetMinutes), -i, offsetMinutes);
            const parts = localParts(day, offsetMinutes);
            const key = `${parts.year}-${parts.month}-${parts.day}`;
            const found = dailyTrendMap.get(key);
            dailyRevenueTrend.push({
                date: `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}`,
                revenue: found?.revenue || 0,
                ordersCount: found?.ordersCount || 0,
            });
        }

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

        const topProductsChart = topProducts.map((p) => ({
            name: p._id,
            quantityKg: p.totalQuantityKg,
            revenue: p.totalRevenue,
        }));

        const currentRevenue = revenueAgg[0]?.total || 0;
        const lastMonthRevenue = lastMonthRevenueAgg[0]?.total || 0;
        const revenueGrowthPercent = lastMonthRevenue > 0
            ? Number((((currentRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1))
            : (currentRevenue > 0 ? 100 : 0);

        const ordersGrowthPercent = lastMonthOrders > 0
            ? Number((((monthlyOrders - lastMonthOrders) / lastMonthOrders) * 100).toFixed(1))
            : (monthlyOrders > 0 ? 100 : 0);

        const warehouseValue = totalKgAgg[0]?.warehouseValue || 0;
        const warehouseKg = totalKgAgg[0]?.warehouseKg || 0;

        const payload = {
            totalProducts,
            totalClients,
            totalOrders,
            todaysOrders,
            monthlyOrders,

            revenue: currentRevenue,

            totalDebt: debtAgg[0]?.total || 0,

            totalKg: warehouseKg,

            warehouseValue: warehouseValue,

            growth: {
                revenuePercent: revenueGrowthPercent,
                ordersPercent: ordersGrowthPercent,
                lastMonthRevenue,
                lastMonthOrders,
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

        setCache(dashboardStore, payload, config.dashboardCacheTtl);
        return sendSuccess(res, 200, "Statistika ma'lumotlari.", payload);
    },
};


export default dashboardController;
