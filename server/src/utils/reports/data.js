import { ApiError } from '../../lib/helpers.js';
import { Client, Order, Product } from '../../models/index.js';
import { UZ_MONTHS } from './shared.js';
async function fetchOrdersReportData({ start, end }) {
    const orders = await Order.find({ createdAt: { $gte: start, $lte: end } })
        .select('client items orderTotal totalKg totalBoxes status createdAt')
        .populate('client', 'name phone')
        .sort({ createdAt: 1 })
        .lean();

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((s, o) => s + (o.orderTotal || 0), 0);
    const completed = orders.filter((o) => o.status === 'completed').length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const cancelled = orders.filter((o) => o.status === 'cancelled').length;
    const totalKg = orders.reduce(
        (s, o) => s + o.items.reduce((si, it) => si + (it.quantityKg || 0), 0),
        0
    );
    const totalBoxes = orders.reduce(
        (s, o) => s + o.items.reduce((si, it) => si + (it.quantityBoxes || 0), 0),
        0
    );

    return { orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes };
}

async function fetchStockReportData() {
    const products = await Product.find({}).select('name category sizes').sort({ category: 1, name: 1 }).lean({ virtuals: true });
    let totalKg = 0;
    let totalValue = 0;
    let totalBoxes = 0;
    const rows = [];

    products.forEach((p) => {
        (p.sizes || []).forEach((s) => {
            const value = (s.total || 0) * (s.price || 0);
            totalKg += s.total || 0;
            totalValue += value;
            totalBoxes += s.boxes || 0;
            rows.push({
                product: p.name,
                category: p.category,
                size: s.size,
                boxes: s.boxes,
                boxKg: s.box_kg,
                totalKg: s.total,
                price: s.price,
                value,
            });
        });
    });

    return { products, rows, totalKg, totalValue, totalBoxes };
}

async function fetchDebtsReportData() {
    const clients = await Client.find({}).select('name phone debt orders paymentHistory createdAt').sort({ debt: -1 }).lean({ virtuals: true });
    const totalDebt = clients.reduce((s, c) => s + (c.debt || 0), 0);
    const debtors = clients.filter((c) => (c.debt || 0) > 0);
    return { clients, debtors, totalDebt };
}

async function fetchClientLedgerData(clientId) {
    const client = await Client.findById(clientId).lean({ virtuals: true });
    if (!client) throw new ApiError(404, 'Mijoz topilmadi.');

    const orders = await Order.find({ client: clientId }).select('createdAt items').sort({ createdAt: 1 }).lean();

    const monthsMap = new Map();

    function getBucket(date) {
        const y = date.getFullYear();
        const m = date.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (!monthsMap.has(key)) {
            monthsMap.set(key, { key, year: y, month: m + 1, monthName: UZ_MONTHS[m], items: [], payments: [] });
        }
        return monthsMap.get(key);
    }

    orders.forEach((order) => {
        const bucket = getBucket(new Date(order.createdAt));
        order.items.forEach((item) => {
            bucket.items.push({
                date: order.createdAt,
                productName: item.productName,
                size: item.size,
                quantityBoxes: item.quantityBoxes != null ? item.quantityBoxes : null,
                boxKg: item.boxKg != null ? item.boxKg : null,
                quantityKg: item.quantityKg,
                pricePerKg: item.pricePerKg,
                subtotal: item.subtotal,
            });
        });
    });

    (client.paymentHistory || []).forEach((p) => {
        const bucket = getBucket(new Date(p.date));
        bucket.payments.push({
            date: p.date,
            amount: p.amount,
            note: p.note || '',
        });
    });

    const months = Array.from(monthsMap.values()).sort((a, b) => (a.key < b.key ? -1 : 1));

    return { client, months };
}


export { fetchOrdersReportData, fetchStockReportData, fetchDebtsReportData, fetchClientLedgerData };
