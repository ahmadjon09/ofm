// Davr (time range) mantiqini HAQIQIY controller kodi bilan tekshiradi.
//   cd server && npm run test:period
//
// Nima tekshiriladi:
//   • Dashboard STANDART holatda faqat JORIY OY ma'lumotlarini ko'rsatadi
//     (butun tarix emas) — asosiy tuzatish.
//   • range=all bilan barcha vaqt ko'rsatiladi.
//   • range=previous-month faqat o'tgan oyni oladi.
//   • startDate/endDate aniq davrni beradi, noto'g'ri sana -> 400.
//   • Buyurtmalar ro'yxati ham standart holatda faqat joriy oyni qaytaradi
//     va meta.range / summary bilan birga keladi.
import assert from 'node:assert/strict';
import { register } from 'node:module';

process.env.MONGO_URI ??= 'mongodb://placeholder';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh';
process.env.PORT ??= '5999';
process.env.NODE_ENV ??= 'test';
process.env.TIMEZONE_OFFSET_MINUTES ??= '300';

register('./tests/loader.mjs', import.meta.url);

const { default: dashboardController } = await import('../src/controllers/dashboard.controller.js');
const { default: orderController } = await import('../src/controllers/order.controller.js');
const { localDateToUtcInstant, localParts } = await import('../src/lib/datetime.js');
const { clearDashboardCache } = await import('../src/lib/cache.js');
const fake = await import('./tests/fakeModels.js');

let failures = 0;
let passed = 0;
function check(label, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            passed += 1;
            console.log(`  ✅ ${label}`);
        })
        .catch((error) => {
            failures += 1;
            console.log(`  ❌ ${label}\n     ${error.message}`);
        });
}

function fakeRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

async function call(handler, query = {}) {
    const res = fakeRes();
    await handler({ query, body: {}, params: {}, user: { _id: '000000000000000000000900' } }, res);
    return res;
}

// ---- Ma'lumot tayyorlash (joriy oy, o'tgan oy, 2 oy oldin) ----
const now = new Date();
const parts = localParts(now, 300);

const at = (monthOffset, day) => {
    const base = new Date(parts.year, parts.month - 1 + monthOffset, day, 12, 0, 0);
    return localDateToUtcInstant(base.getFullYear(), base.getMonth() + 1, base.getDate(), 300, 12, 0);
};

const clientA = {
    _id: '000000000000000000000101',
    name: 'Aliyor',
    phone: '+998900000001',
    debt: 0,
    createdAt: at(-2, 5),
};
const clientB = {
    _id: '000000000000000000000102',
    name: 'Bahodir',
    phone: '+998900000002',
    debt: 500000,
    createdAt: at(0, 3),
};

const makeOrder = (id, client, day, monthOffset, total, status) => ({
    _id: id,
    client,
    items: [{
        productName: 'Olma',
        quantityBoxes: 10,
        quantityKg: 100,
        pricePerKg: total / 100,
        subtotal: total,
    }],
    orderTotal: total,
    totalKg: 100,
    totalBoxes: 10,
    status,
    createdAt: at(monthOffset, day),
});

// Joriy oy: 2 ta (1 500 000) | o'tgan oy: 1 ta (2 000 000) | 2 oy oldin: 1 ta bekor
fake.orders.push(
    makeOrder('000000000000000000000201', clientA, 5, 0, 1000000, 'pending'),
    makeOrder('000000000000000000000202', clientA, 8, 0, 500000, 'completed'),
    makeOrder('000000000000000000000203', clientB, 10, -1, 2000000, 'completed'),
    makeOrder('000000000000000000000204', clientB, 12, -2, 3000000, 'cancelled')
);
fake.clients.push(clientA, clientB);
fake.products.push({
    _id: '000000000000000000000301',
    name: 'Olma',
    category: 'Meva',
    sizes: [{ size: 5, price: 10000, boxes: 10, box_kg: 10, total: 100 }],
});

console.log('\n1) Dashboard — standart davr = JORIY OY');

await check('standart so\'rovda range.mode = current-month', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.range.mode, 'current-month');
    assert.equal(res.body.data.range.isCurrentMonth, true);
    assert.match(res.body.data.range.label, /oktabr|noyabr|dekabr|yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr/);
});

await check('faqat joriy oy buyurtmalari hisoblanadi (2 ta, 1 500 000)', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats);
    const data = res.body.data;
    assert.equal(data.period.orders, 2, `kutilgan 2, kelgan ${data.period.orders}`);
    assert.equal(data.period.revenue, 1500000, `kutilgan 1 500 000, kelgan ${data.period.revenue}`);
    assert.equal(data.period.activeClients, 1, `aktiv mijozlar: ${data.period.activeClients}`);
    assert.equal(data.period.newClients, 1, `yangi mijozlar: ${data.period.newClients}`);
    assert.equal(data.period.totalKg, 200, `kg: ${data.period.totalKg}`);
    // Eski (butun tarix) ko'rsatkichlar endi davr bo'yicha
    assert.equal(data.totalOrders, 2, 'legacy totalOrders ham davr bo\'yicha');
    assert.equal(data.revenue, 1500000, 'legacy revenue ham davr bo\'yicha');
});

await check('ombor va qarz — bugungi holat ko\'rsatkichlari', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats);
    const data = res.body.data;
    assert.equal(data.stock.products, 1);
    assert.equal(data.stock.kg, 100);
    assert.equal(data.stock.value, 1000000);
    assert.equal(data.debts.total, 500000);
    assert.equal(data.debts.debtors, 1);
});

console.log('\n2) Dashboard — boshqa davrlar');

await check('range=all — barcha vaqt (4 ta buyurtma, tushum 3 500 000)', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats, { range: 'all' });
    const data = res.body.data;
    assert.equal(data.range.mode, 'all');
    assert.equal(data.range.start, null);
    assert.equal(data.period.orders, 4, `kutilgan 4, kelgan ${data.period.orders}`);
    assert.equal(data.period.revenue, 3500000, `kutilgan 3 500 000, kelgan ${data.period.revenue}`);
    assert.equal(data.growth.revenuePercent, null, 'barcha vaqtda taqqoslash yo\'q');
});

await check('range=previous-month — faqat o\'tgan oy (1 ta, 2 000 000)', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats, { range: 'previous-month' });
    const data = res.body.data;
    assert.equal(data.range.mode, 'previous-month');
    assert.equal(data.period.orders, 1);
    assert.equal(data.period.revenue, 2000000);
});

await check('startDate/endDate — aniq davr', async () => {
    clearDashboardCache();
    const startDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
    const endDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-06`;
    const res = await call(dashboardController.stats, { startDate, endDate });
    const data = res.body.data;
    assert.equal(data.range.mode, 'custom');
    assert.equal(data.range.startDate, startDate);
    assert.equal(data.range.endDate, endDate);
    assert.equal(data.period.orders, 1, `1-kun..6-kun oralig'ida 1 ta buyurtma kutilgan, kelgan ${data.period.orders}`);
});

await check('noto\'g\'ri sana -> 400', async () => {
    clearDashboardCache();
    await assert.rejects(
        () => dashboardController.stats(
            { query: { startDate: '2026-02-31', endDate: '2026-03-05' } },
            fakeRes()
        ),
        (error) => error.statusCode === 400
    );
});

await check('range=current-month + sanalar -> preset ustuvor', async () => {
    clearDashboardCache();
    const res = await call(dashboardController.stats, {
        range: 'current-month',
        startDate: '2020-01-01',
        endDate: '2020-01-02',
    });
    assert.equal(res.body.data.range.mode, 'current-month');
    assert.equal(res.body.data.period.orders, 2);
});

await check('range=custom + startDate/endDate -> aniq davr', async () => {
    clearDashboardCache();
    const startDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
    const endDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-06`;
    const res = await call(dashboardController.stats, { range: 'custom', startDate, endDate });
    assert.equal(res.body.data.range.mode, 'custom');
    assert.equal(res.body.data.period.orders, 1);
});

await check('range=custom sanalarsiz -> 400', async () => {
    await assert.rejects(
        () => dashboardController.stats({ query: { range: 'custom' } }, fakeRes()),
        (error) => error.statusCode === 400
    );
});

console.log('\n3) Buyurtmalar ro\'yxati — standart filtr = SHU OY');

await check('standart ro\'yxat faqat joriy oyni qaytaradi', async () => {
    const res = await call(orderController.list, { page: 1, limit: 10 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.orders.length, 2, `kutilgan 2, kelgan ${res.body.data.orders.length}`);
    assert.equal(res.body.meta.total, 2);
    assert.equal(res.body.meta.range.mode, 'current-month');
    assert.equal(res.body.data.summary.amount, 1500000);
    assert.equal(res.body.data.summary.cancelled, 0);
});

await check('range=all — barcha buyurtmalar', async () => {
    const res = await call(orderController.list, { page: 1, limit: 10, range: 'all' });
    assert.equal(res.body.meta.total, 4);
    assert.equal(res.body.meta.range.mode, 'all');
    assert.equal(res.body.data.summary.cancelled, 1);
    assert.equal(res.body.data.summary.amount, 3500000);
});

await check('status filtri + davr birga ishlaydi', async () => {
    const res = await call(orderController.list, { page: 1, limit: 10, status: 'pending' });
    assert.equal(res.body.meta.total, 1);
    assert.equal(res.body.data.orders[0].status, 'pending');
});

await check('noto\'g\'ri status -> 400', async () => {
    await assert.rejects(
        () => orderController.list({ query: { status: 'yoq-bunday' } }, fakeRes()),
        (error) => error.statusCode === 400
    );
});

console.log(`\nNatija: ${passed} ta o'tdi, ${failures} ta xato.`);
if (failures > 0) process.exit(1);
