// Kassa endpointlarini HAQIQIY HTTP orqali tekshiradi (Express + routing + auth),
// MongoDB o'rniga test modeli ishlatiladi: scripts/tests/fakeModels.js
//   cd server && node scripts/kassa-http-test.mjs
import assert from 'node:assert/strict';
import { register } from 'node:module';
import jwt from 'jsonwebtoken';

process.env.MONGO_URI ??= 'mongodb://placeholder';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh';
process.env.PORT ??= '5999';
process.env.NODE_ENV = 'test';
process.env.TIMEZONE_OFFSET_MINUTES ??= '300';

register('./tests/loader.mjs', import.meta.url);

const { default: app } = await import('../src/app.js');
const { localDateToUtcInstant } = await import('../src/lib/datetime.js');
const fake = await import('./tests/fakeModels.js');

let failures = 0;
let passed = 0;
function check(label, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ✅ ${label}`);
    } catch (error) {
        failures += 1;
        console.log(`  ❌ ${label}\n     ${error.message}`);
    }
}

const adminId = '000000000000000000000901';
fake.users.push({
    _id: adminId,
    name: 'Admin',
    phone: '+998900000000',
    role: 'admin',
    isActive: true,
});
const adminToken = jwt.sign({ id: adminId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });

// Balans: kirim 5000 - chiqim 1230 = 3770 (real bazadagi holat kabi)
fake.kassaDoc.balance = 3770;
for (let i = 0; i < 120; i += 1) {
    fake.seedTransaction({
        type: 'CHIQIM',
        amount: 10.25,
        reason: i % 2 === 0 ? 'Sement' : 'sement',
        createdAt: localDateToUtcInstant(2026, 9, (i % 20) + 1, 300, 10),
    });
}
fake.seedTransaction({ type: 'KIRIM', amount: 5000, reason: 'Naqd tushum', createdAt: localDateToUtcInstant(2026, 9, 10, 300, 12) });

const server = app.listen(0);
const port = server.address().port;
const base = `http://127.0.0.1:${port}/api/v2`;

async function get(path, token = adminToken) {
    const res = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
}

console.log('\n1) HTTP: autentifikatsiya va ruxsatlar');
let res = await get('/kassa/summary', null);
check('tokensiz -> 401', () => assert.equal(res.status, 401));

res = await get('/kassa/summary');
check('token bilan -> 200 (yangi /kassa/summary route ishlaydi)', () => {
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.month, '2026-09');
});

console.log('\n2) HTTP: oylik tushum/chiqim (server hisobida)');
check('oylik kirim 5000', () => assert.equal(res.json.data.income, 5000));
check('oylik chiqim 120 * 10.25 = 1230', () => assert.equal(res.json.data.expense, 1230));
check('sof oqim 3770', () => assert.equal(res.json.data.net, 3770));
check('guruhlar: "sement" 120 ta yozuvda bitta guruh', () => {
    assert.equal(res.json.data.expenseGroups.length, 1);
    assert.equal(res.json.data.expenseGroups[0].count, 120);
    assert.equal(res.json.data.expenseGroups[0].total, 1230);
});
check('kunlik kesim 30 kun', () => assert.equal(res.json.data.daily.length, 30));

console.log('\n3) HTTP: chiqimlar guruhlari endpointi');
res = await get('/kassa/groups?month=2026-09');
check('/kassa/groups 200 va to‘liq yig‘indi', () => {
    assert.equal(res.status, 200);
    assert.equal(res.json.data.total, 1230);
    assert.equal(res.json.data.count, 120);
    assert.equal(res.json.data.groupCount, 1);
    assert.equal(res.json.data.groups[0].percent, 100);
});

console.log('\n4) HTTP: tarix + sahifalash + to‘liq yig‘indi');
res = await get('/kassa/history?limit=50');
check('50 tadan ortiq qaytmaydi (server limiti)', () => {
    assert.equal(res.status, 200);
    assert.equal(res.json.data.history.length, 50);
    assert.equal(res.json.meta.limit, 50);
    assert.equal(res.json.meta.total, 121);
});
check('yig‘indi sahifadagi 50 ta emas, barcha 121 ta bo‘yicha', () => {
    assert.equal(res.json.data.summary.income, 5000);
    assert.equal(res.json.data.summary.expense, 1230);
    assert.equal(res.json.data.summary.count, 121);
});
res = await get('/kassa/history?search=sement&limit=100');
check('qidiruv serverda ishlaydi (120 ta topiladi)', () => {
    assert.equal(res.json.meta.total, 120);
    assert.equal(res.json.data.summary.expense, 1230);
});

console.log('\n5) HTTP: kassa balansi va joriy oy');
res = await get('/kassa');
check('/kassa currentMonth va timezoneOffsetMinutes qaytaradi', () => {
    assert.equal(res.status, 200);
    assert.match(res.json.data.currentMonth, /^\d{4}-\d{2}$/);
    assert.equal(res.json.data.timezoneOffsetMinutes, 300);
});

console.log('\n6) HTTP: kirim/chiqim yozish va oylik ko‘rsatkichga ta’siri');
const beforeSummary = await get('/kassa/summary');
const postRes = await fetch(`${base}/kassa/expense`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 0.1 + 0.2, reason: '  yangi   xarajat ' }),
});
const postJson = await postRes.json();
check('chiqim 200 va yaxlitlangan summa', () => {
    assert.equal(postRes.status, 200);
    assert.equal(postJson.data.expense.amount, 0.3);
    assert.equal(postJson.data.expense.reason, 'yangi xarajat');
});
const afterSummary = await get('/kassa/summary');
check('yangi chiqim oylik ko‘rsatkichga qo‘shildi', () => {
    assert.equal(afterSummary.json.data.expense, beforeSummary.json.data.expense + 0.3);
});
check('yangi guruh qo‘shildi', () => assert.equal(afterSummary.json.data.expenseGroups.length, 2));

res = await get('/kassa/summary?month=07&year=2026');
check('month=07&year=2026 formati ham ishlaydi', () => {
    assert.equal(res.status, 200);
    assert.equal(res.json.data.month, '2026-07');
});
res = await get('/kassa/groups?month=notogri');
check('noto‘g‘ri oy -> 400', () => assert.equal(res.status, 400));

server.close();
console.log(
    failures === 0
        ? `\nHAMMASI OK ✅ (${passed} ta tekshiruv)`
        : `\n${failures} ta tekshiruv yiqildi ❌ (${passed} ta o'tdi)`
);
process.exit(failures === 0 ? 0 : 1);
