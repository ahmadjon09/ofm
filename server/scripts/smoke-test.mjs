// Smoke-test: buyurtma bekor qilinganda stok/qarz qaytishi, API v2 va tizim endpointlari.
// Ishga tushirish (lokal, internet kerak — mongo binar yuklab olinadi):
//   cd server && npm i -D mongodb-memory-server && node scripts/smoke-test.mjs
process.env.MONGO_URI = 'mongodb://placeholder';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh';
process.env.PORT = '5999';
process.env.NODE_ENV = 'test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replset.getUri();
await mongoose.connect(uri);

const { default: app } = await import('../src/app.js');
const { User, Product, Client, Order } = await import('../src/models/index.js');

const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/api/v2`;

const admin = await User.create({ name: 'Admin', phone: '+998901234567', password: 'secret123', role: 'admin' });
const token = jwt.sign({ id: admin._id, role: 'admin' }, 'test-secret', { expiresIn: '1h' });

async function call(method, path, body) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
}

let failures = 0;
function assert(cond, label) {
    if (cond) console.log(`  ✅ ${label}`);
    else { console.log(`  ❌ ${label}`); failures++; }
}

// --- Setup data
const product = await Product.create({
    name: 'Olma', category: 'Meva',
    sizes: [{ size: 5, price: 10000, boxes: 100, box_kg: 10 }],
});
const client = await Client.create({ name: 'Mijoz', phone: '+998900000001', debt: 0 });

// --- 1. Create order
console.log('1) Buyurtma yaratish');
let r = await call('POST', '/orders', {
    clientId: client._id, items: [{ productId: product._id, size: 5, quantityBoxes: 10 }],
});
assert(r.status === 201, `status 201 (got ${r.status})`);
assert(r.json.version === '2', `javobda version: '2' bor (${r.json.version})`);
assert(r.json.apiMessage === 'API v2', `javobda apiMessage 'API v2' bor`);
const orderId = r.json.data.order._id;

let p = await Product.findById(product._id);
let c = await Client.findById(client._id);
assert(p.sizes[0].boxes === 90, `stok 100 -> 90 (${p.sizes[0].boxes})`);
assert(c.debt === 1000000, `qarz 1 000 000 (${c.debt})`);

// --- 2. Cancel order -> stock restored, debt reduced
console.log('2) Buyurtmani bekor qilish');
r = await call('PATCH', `/orders/${orderId}/status`, { status: 'cancelled' });
assert(r.status === 200, `status 200 (got ${r.status}) ${r.json.message}`);
p = await Product.findById(product._id);
c = await Client.findById(client._id);
assert(p.sizes[0].boxes === 100, `stok omborga qaytdi 90 -> 100 (${p.sizes[0].boxes})`);
assert(c.debt === 0, `qarz qaytdi -> 0 (${c.debt})`);

// --- 3. Cancel again (idempotent)
r = await call('PATCH', `/orders/${orderId}/status`, { status: 'cancelled' });
p = await Product.findById(product._id);
assert(p.sizes[0].boxes === 100, `qayta bekor qilishda stok o'zgarmadi (${p.sizes[0].boxes})`);

// --- 4. Re-activate -> stock deducted again
console.log('3) Bekor qilishni qaytarish (pending)');
r = await call('PATCH', `/orders/${orderId}/status`, { status: 'pending' });
p = await Product.findById(product._id);
c = await Client.findById(client._id);
assert(p.sizes[0].boxes === 90, `stok qayta ayirildi -> 90 (${p.sizes[0].boxes})`);
assert(c.debt === 1000000, `qarz qayta qo'shildi (${c.debt})`);

// --- 5. Delete order -> stock restored
console.log('4) Buyurtmani o\'chirish');
r = await call('DELETE', `/orders/${orderId}`);
assert(r.status === 200, `status 200 (${r.json.message})`);
p = await Product.findById(product._id);
c = await Client.findById(client._id);
assert(p.sizes[0].boxes === 100, `stok qaytdi -> 100 (${p.sizes[0].boxes})`);
assert(c.debt === 0, `qarz qaytdi -> 0 (${c.debt})`);
assert(c.orders.length === 0, `mijoz orders ro'yxatidan olib tashlandi`);

// --- 6. v1 ham ishlaydi
const resV1 = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
const jsonV1 = await resV1.json();
assert(resV1.status === 200 && jsonV1.version === '2', `/api/v1 ham ishlaydi va version msg bor`);

// --- 7. System info
console.log('5) Tizim ma\'lumotlari');
r = await call('GET', '/system/info');
assert(r.status === 200, `status 200`);
assert(typeof r.json.data.database.usedPercent === 'number', `DB foizi bor (${r.json.data.database.usedPercent}%)`);
assert(Array.isArray(r.json.data.modules) && r.json.data.modules.length === 6, `6 ta modul (${r.json.data.modules.length})`);
const usersMod = r.json.data.modules.find(m => m.key === 'users');
assert(usersMod.deletable === false, `users moduli o'chirilmaydi`);

// --- 8. Clear module without confirm -> 400
r = await call('DELETE', '/system/modules/clients');
assert(r.status === 400, `confirm siz 400 (${r.status})`);

// --- 9. Clear module with confirm
await Order.create({ client: client._id, items: [{ product: product._id, productName: 'Olma', size: 5, quantityBoxes: 1, boxKg: 10, quantityKg: 10, pricePerKg: 10000 }] });
r = await call('DELETE', '/system/modules/orders', { confirm: 'orders' });
assert(r.status === 200 && r.json.data.deletedCount === 1, `orders tozalandi (${r.json.data?.deletedCount})`);

// --- 10. users module protected
r = await call('DELETE', '/system/modules/users', { confirm: 'users' });
assert(r.status === 403, `users modulini o'chirish taqiqlangan (${r.status})`);

// --- 11. Kassa: oylik tushum/chiqim va chiqimlar guruhlari (server hisobida)
console.log('6) Kassa statistikasi (oylik tushum/chiqim, guruhlar)');
r = await call('POST', '/kassa/income', { amount: 1000, source: 'Smoke kirim' });
assert(r.status === 200 && r.json.data.balance === 1000, `kirim yozildi (balans ${r.json.data?.balance})`);
r = await call('POST', '/kassa/expense', { amount: 250.5, reason: 'Smoke xarajat' });
assert(r.status === 200 && r.json.data.balance === 749.5, `chiqim yozildi (balans ${r.json.data?.balance})`);
r = await call('POST', '/kassa/expense', { amount: 49.5, reason: '  smoke   XARAJAT ' });
assert(r.status === 200, `bir xil izohning boshqa yozilishi qabul qilindi (${r.status})`);

// Joriy oy kaliti serverdan olinadi (ish mintaqasi bo'yicha hisoblanadi)
const kassaInfo = await call('GET', '/kassa');
const monthKey = kassaInfo.json.data.currentMonth;
assert(!!monthKey && /^\d{4}-\d{2}$/.test(monthKey), `server joriy oyni qaytaradi (${monthKey})`);
r = await call('GET', `/kassa/summary?month=${monthKey}`);
assert(r.status === 200, `summary 200 (${r.status})`);
assert(r.json.data.income === 1000, `oylik kirim 1000 (${r.json.data?.income})`);
assert(r.json.data.expense === 300, `oylik chiqim 300 (${r.json.data?.expense})`);
assert(r.json.data.net === 700, `sof oqim 700 (${r.json.data?.net})`);
assert(r.json.data.expenseGroups.length === 1, `guruhlar birlashtirildi: 1 ta (${r.json.data?.expenseGroups?.length})`);
assert(r.json.data.expenseGroups[0].total === 300, `guruh yig'indisi 300 (${r.json.data?.expenseGroups?.[0]?.total})`);
assert(r.json.data.expenseGroups[0].count === 2, `guruhda 2 ta yozuv (${r.json.data?.expenseGroups?.[0]?.count})`);

r = await call('GET', `/kassa/groups?month=${monthKey}`);
assert(r.status === 200 && r.json.data.total === 300, `groups yig'indisi 300 (${r.json.data?.total})`);
assert(r.json.data.count === 2, `groups yozuvlar soni 2 (${r.json.data?.count})`);

r = await call('GET', '/kassa/history?search=smoke&limit=1000');
assert(r.status === 200 && r.json.meta.total === 2, `qidiruv butun tarix bo'yicha 2 ta (${r.json.meta?.total})`);
assert(r.json.data.summary.expense === 300, `qidiruv bo'yicha to'liq yig'indi 300 (${r.json.data?.summary?.expense})`);
assert(r.json.data.history.length <= 100, `sahifa hajmi serverda cheklanadi (${r.json.data?.history?.length})`);

r = await call('GET', '/kassa/summary?month=13');
assert(r.status === 400, `noto'g'ri oy -> 400 (${r.status})`);

server.close();
await mongoose.disconnect();
await replset.stop();

console.log(failures === 0 ? '\nHAMMASI OK ✅' : `\n${failures} ta test yiqildi ❌`);
process.exit(failures === 0 ? 0 : 1);
