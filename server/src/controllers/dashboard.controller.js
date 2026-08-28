import { config } from '../config/index.js';
import { sendSuccess } from '../lib/helpers.js';
import { dashboardStore, getCache, setCache } from '../lib/cache.js';
import { Client, Order, Product } from '../models/index.js';
const dashboardController = {
    async stats(req, res) {
        const cached = getCache(dashboardStore);
        if (cached) {
            return sendSuccess(res, 200, "Statistika ma'lumotlari.", cached);
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

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
            Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),

            Order.aggregate([
                { $match: { status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$orderTotal' } } },
            ]),
            Order.aggregate([
                {
                    $match: {
                        status: { $ne: 'cancelled' },
                        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
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
                        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
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
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' },
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

        const monthNames = [
            'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
            'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
        ];

        const monthlyTrendMap = new Map(
            monthlyTrend.map((m) => [`${m._id.year}-${m._id.month}`, m])
        );
        const monthlyRevenueTrend = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            const found = monthlyTrendMap.get(key);
            monthlyRevenueTrend.push({
                month: monthNames[d.getMonth()],
                year: d.getFullYear(),
                revenue: found?.revenue || 0,
                ordersCount: found?.ordersCount || 0,
            });
        }

        const dailyTrendMap = new Map(
            dailyTrend.map((d) => [`${d._id.year}-${d._id.month}-${d._id.day}`, d])
        );
        const dailyRevenueTrend = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            const found = dailyTrendMap.get(key);
            dailyRevenueTrend.push({
                date: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
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
