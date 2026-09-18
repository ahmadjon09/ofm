// Kassa API endpointlarini HAQIQIY controller kodi bilan tekshiradi
// (MongoDB o'rniga test modeli ishlatiladi — scripts/tests/fakeModels.js).
//   cd server && node scripts/kassa-api-test.mjs
//
// Nima tekshiriladi:
//   • oylik tushum/chiqim — TO'LIQ (sahifalashdan qat'i nazar)
//   • chiqimlar guruhlari — DB darajasida, 100 tadan ko'p yozuvda ham to'g'ri
//   • oy chegaralari ish mintaqasi (UTC+5) bo'yicha
//   • bir xil izohning turli yozilishi bitta guruhga qo'shilishi
//   • noto'g'ri oy parametri -> 400
import assert from 'node:assert/strict';
import { register } from 'node:module';

process.env.MONGO_URI ??= 'mongodb://placeholder';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh';
process.env.PORT ??= '5999';
process.env.TIMEZONE_OFFSET_MINUTES ??= '300';

// Modellarni almashtirish (import dan oldin ro'yxatdan o'tkaziladi)
register('./tests/loader.mjs', import.meta.url);

const { default: kassaController } = await import('../src/controllers/kassa.controller.js');
const { localDateToUtcInstant } = await import('../src/lib/datetime.js');
const { clearKassaCache } = await import('../src/lib/cache.js');
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

async function call(handler, query = {}, body = {}, user = { _id: '000000000000000000000900' }) {
    const res = fakeRes();
    await handler({ query, body, params: {}, user }, res);
    return res;
}

// Mahalliy (Toshkent) vaqt bo'yicha UTC instant
const at = (y, m, day, hour = 12, minute = 0) => localDateToUtcInstant(y, m, day, 300, hour, minute);

fake.resetAll();

// --- Ma'lumotlar: 150 ta bir xil sabab + 1 ta boshqa yozilish + 1 ta izohsiz
for (let i = 0; i < 150; i += 1) {
    fake.seedTransaction({
        type: 'CHIQIM',
        amount: 100.5,
        reason: i % 3 === 0 ? 'ofis UCHUN' : 'Ofis uchun',
        createdAt: at(2026, 9, (i % 28) + 1, 10 + (i % 8)),
    });
}
fake.seedTransaction({ type: 'CHIQIM', amount: 250.25, reason: '  Ofis   uchun  ', createdAt: at(2026, 9, 20, 9) });
fake.seedTransaction({ type: 'CHIQIM', amount: 49.5, reason: '', createdAt: at(2026, 9, 21, 9) });
fake.seedTransaction({ type: 'CHIQIM', amount: 1000, reason: "Yoqilg'i", createdAt: at(2026, 9, 22, 9) });

// --- Chegara holatlari (Toshkent vaqti bo'yicha)
// 31-avgust 20:00 UTC = 1-sentabr 01:00 (Toshkent) -> SENTABRGA kiradi
fake.seedTransaction({ type: 'KIRIM', amount: 5000, reason: 'Mijozdan to‘lov', createdAt: new Date('2026-08-31T20:00:00.000Z') });
// 30-sentabr 19:30 UTC = 1-oktabr 00:30 (Toshkent) -> SENTABRGA KIRMAYDI
fake.seedTransaction({ type: 'CHIQIM', amount: 777, reason: 'Oktyabrga o‘tgan', createdAt: new Date('2026-09-30T19:30:00.000Z') });
// O'tgan oy (avgust) — taqqoslash uchun
fake.seedTransaction({ type: 'CHIQIM', amount: 2000, reason: 'Avgust xarajati', createdAt: at(2026, 8, 10, 12) });
fake.seedTransaction({ type: 'KIRIM', amount: 1000, reason: 'Avgust kirimi', createdAt: at(2026, 8, 11, 12) });

const OFIS_TOTAL = 150 * 100.5 + 250.25; // 15325.25
const SEPT_EXPENSE = OFIS_TOTAL + 49.5 + 1000; // 16374.75
const SEPT_INCOME = 5000;

console.log('\n1) /kassa/summary — oylik tushum/chiqim');
const summary = await call(kassaController.summary, { month: '2026-09' });
check('status 200 va success envelope', () => {
    assert.equal(summary.statusCode, 200);
    assert.equal(summary.body.success, true);
    assert.equal(summary.body.version, '2');
});
const s = summary.body.data;
check(`kirim = ${SEPT_INCOME} (kechqurun kiritilgan kirim sentabrga kirdi)`, () => assert.equal(s.income, SEPT_INCOME));
check(`chiqim = ${SEPT_EXPENSE} (sentabr oxiridagi oktabr yozuvi kirmadi)`, () => assert.equal(s.expense, SEPT_EXPENSE));
check('sof oqim = kirim - chiqim', () => assert.equal(s.net, SEPT_INCOME - SEPT_EXPENSE));
check('kirim/chiqim soni', () => {
    assert.equal(s.incomeCount, 1);
    assert.equal(s.expenseCount, 153);
    assert.equal(s.count, 154);
});
check("float xatosi yo'q — guruhlar yig'indisi aniq", () => assert.equal(s.expenseGroupsTotal, SEPT_EXPENSE));
check('oy nomi va kaliti', () => {
    assert.equal(s.month, '2026-09');
    assert.equal(s.monthLabel, 'Sentabr 2026');
});
check("o'tgan oy bilan taqqoslash (avgust)", () => {
    assert.equal(s.previous.month, '2026-08');
    assert.equal(s.previous.income, 1000);
    assert.equal(s.previous.expense, 2000);
    // (5000 - 1000) / 1000 = +400%
    assert.equal(s.change.incomePercent, 400);
});
check('kunlik kesim 30 kundan iborat', () => assert.equal(s.daily.length, 30));
check('eng katta chiqim', () => {
    assert.equal(s.largestExpense.amount, 1000);
    assert.equal(s.largestExpense.reason, "Yoqilg'i");
});
check('avg qty hisoblanadi', () => assert.equal(s.averageExpense, Math.round((SEPT_EXPENSE / 153) * 100) / 100));

console.log('\n2) /kassa/summary — chiqimlar guruhlari (bir xil izohlar birlashtirilgan)');
const groups = s.expenseGroups;
check('3 ta guruh: ofis / yoqilg‘i / izohsiz', () => assert.equal(groups.length, 3));
check('ofis guruhi: 151 ta yozuv, 15325.25', () => {
    const ofis = groups.find((g) => g.key === 'ofis uchun');
    assert.equal(ofis.count, 151);
    assert.equal(ofis.total, 15325.25);
});
check('guruh nomi eng ko‘p ishlatilgani', () => {
    const ofis = groups.find((g) => g.key === 'ofis uchun');
    assert.equal(ofis.label, 'Ofis uchun');
});
check('izohsiz yozuv "Izohsiz" guruhida', () => {
    const izohsiz = groups.find((g) => g.key === '');
    assert.equal(izohsiz.label, 'Izohsiz');
    assert.equal(izohsiz.total, 49.5);
});
check('guruhlar yig‘indisi oylik chiqimga teng', () => {
    const total = groups.reduce((acc, g) => acc + g.total, 0);
    assert.equal(Math.round(total * 100) / 100, SEPT_EXPENSE);
});
check('topExpenseGroups 5 tadan ko‘p emas', () => assert.ok(s.topExpenseGroups.length <= 5));

console.log('\n3) /kassa/groups — sahifalashsiz to‘liq guruhlash');
const groupsRes = await call(kassaController.groups, { month: '2026-09' });
const g = groupsRes.body.data;
check('jami summa oylik chiqimga teng (100 tadan ko‘p yozuvda ham)', () => assert.equal(g.total, SEPT_EXPENSE));
check('operatsiyalar soni 153', () => assert.equal(g.count, 153));
check('guruhlar soni 3', () => assert.equal(g.groupCount, 3));
check('eng katta guruh — ofis', () => assert.equal(g.largestGroup.key, 'ofis uchun'));
check('foizlar yig‘indisi 100%', () => {
    const total = g.groups.reduce((acc, item) => acc + item.percent, 0);
    assert.ok(Math.abs(total - 100) < 0.2, `foiz yig'indisi: ${total}`);
});
check('oy nomi serverdan', () => assert.equal(g.monthLabel, 'Sentabr 2026'));

console.log('\n4) /kassa/history — sahifalash + shu filtr bo‘yicha to‘liq yig‘indi');
const history1 = await call(kassaController.history, { page: 1, limit: 100 });
const h1 = history1.body.data;
check('birinchi sahifada 100 ta yozuv', () => assert.equal(h1.history.length, 100));
check('meta: jami yozuvlar soni barcha operatsiyalar', () => {
    assert.equal(history1.body.meta.total, fake.transactions.length);
    assert.equal(history1.body.meta.limit, 100);
});
check('yig‘indi sahifadagi 100 ta emas, TO‘LIQ hisoblanadi', () => {
    assert.equal(h1.summary.income, SEPT_INCOME + 1000);
    assert.equal(h1.summary.expense, SEPT_EXPENSE + 777 + 2000);
});
check('standart saralash — eng yangisi birinchi', () => {
    const dates = h1.history.map((tx) => new Date(tx.createdAt).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});
const historyAsc = await call(kassaController.history, { page: 1, limit: 5, order: 'asc' });
check('order=asc ishlaydi', () => {
    const dates = historyAsc.body.data.history.map((tx) => new Date(tx.createdAt).getTime());
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
});

console.log('\n5) /kassa/history — oy va qidiruv filtrlari');
const septHistory = await call(kassaController.history, { month: '2026-09', page: 1, limit: 1000 });
check('oy filtri faqat sentabr yozuvlarini qaytaradi', () => {
    assert.equal(septHistory.body.meta.total, 154);
    assert.equal(septHistory.body.data.summary.income, SEPT_INCOME);
    assert.equal(septHistory.body.data.summary.expense, SEPT_EXPENSE);
});
check('range javobda ko‘rinadi (ish mintaqasi)', () => {
    assert.equal(septHistory.body.data.range.month, '2026-09');
    assert.equal(septHistory.body.data.range.from, '2026-08-31T19:00:00.000Z');
    assert.equal(septHistory.body.data.range.to, '2026-09-30T19:00:00.000Z');
});
const searchRes = await call(kassaController.history, { search: 'ofis', page: 1, limit: 1000 });
check('qidiruv butun tarix bo‘yicha (faqat joriy sahifa emas)', () => {
    assert.equal(searchRes.body.meta.total, 151);
    assert.equal(searchRes.body.data.summary.expense, 15325.25);
    assert.equal(searchRes.body.data.summary.income, 0);
});
check('qidiruv katta-kichik harfga sezgir emas', () => {
    assert.equal(searchRes.body.meta.total, 151);
});

console.log('\n6) /kassa/expense va /kassa/income — balans va yaxlitlash');
fake.kassaDoc.balance = 10000; // test uchun boshlang'ich balans
clearKassaCache(); // 5 sekundlik balans keshi testni chalg'itmasin
const before = await call(kassaController.get);
check('boshlang‘ich balans serverdan olinadi', () => assert.equal(before.body.data.balance, 10000));
const expenseRes = await call(kassaController.expense, {}, { amount: 0.1 + 0.2, reason: '  Sinov   xarajati ' });
check('chiqim yozildi va qiymat 2 xonaga yaxlitlandi', () => {
    assert.equal(expenseRes.body.data.expense.amount, 0.3);
    assert.equal(expenseRes.body.data.expense.reason, 'Sinov xarajati');
});
check('balans aniq ayirildi (float xatosi yo‘q)', () => {
    assert.equal(expenseRes.body.data.balance, 10000 - 0.3);
});
const afterIncome = await call(kassaController.income, {}, { amount: 100.005, source: 'Sinov kirimi' });
check('kirim yaxlitlandi (100.005 -> 100.01)', () => assert.equal(afterIncome.body.data.income.amount, 100.01));
let badAmount = null;
try {
    await call(kassaController.expense, {}, { amount: 0, reason: 'x' });
} catch (error) {
    badAmount = error;
}
check('noto‘g‘ri summa 400 xatolik beradi', () => {
    assert.equal(badAmount?.statusCode, 400);
});
let emptyReason = null;
try {
    await call(kassaController.expense, {}, { amount: 10, reason: '   ' });
} catch (error) {
    emptyReason = error;
}
check('bo‘sh sabab 400 xatolik beradi', () => assert.equal(emptyReason?.statusCode, 400));

console.log('\n7) Xato parametrlar');
let badMonth = null;
try {
    await call(kassaController.summary, { month: '2026-13' });
} catch (error) {
    badMonth = error;
}
check('month=2026-13 -> 400 (jimgina joriy oyga tushmaydi)', () => assert.equal(badMonth?.statusCode, 400));
const defaultMonth = await call(kassaController.summary, {});
check('parametrsiz so‘rov joriy oyni oladi', () => {
    assert.ok(defaultMonth.body.data.month);
    assert.equal(defaultMonth.body.data.currentMonth, defaultMonth.body.data.month);
});

console.log('\n8) /kassa/suggestions — izohlar taklifi (birlashtirilgan, bo‘shlar chiqarilgan)');
const suggestions = await call(kassaController.expenseSuggestions, { limit: 10 });
const items = suggestions.body.data.suggestions;
check('bo‘sh izohlar taklifga kirmaydi', () => {
    assert.ok(items.every((item) => item.reason && item.reason.trim() !== ''));
});
check('“ofis uchun” bitta taklif bo‘lib birlashgan', () => {
    const ofis = items.find((item) => item.key === 'ofis uchun');
    assert.equal(ofis.count, 151);
    assert.equal(ofis.total, 15325.25);
    assert.equal(ofis.reason, 'Ofis uchun');
});
check('limit hurmat qilinadi', () => assert.ok(items.length <= 10));

console.log(
    failures === 0
        ? `\nHAMMASI OK ✅ (${passed} ta tekshiruv)`
        : `\n${failures} ta tekshiruv yiqildi ❌ (${passed} ta o'tdi)`
);
process.exit(failures === 0 ? 0 : 1);
