// Kassa statistikasi yordamchilarini tekshirish (Mongo kerak emas).
//   cd server && node scripts/kassa-stats-test.mjs
// Bu testlar aynan "oylik tushum/chiqim" va "chiqimlar guruhlari" hisob-kitobini
// qamrab oladi: float xatolari, >100 yozuv, bir xil izohning turli yozilishi,
// kechqurun kiritilgan operatsiyaning oy chegarasi va h.k.
import assert from 'node:assert/strict';

process.env.MONGO_URI ??= 'mongodb://placeholder';
process.env.JWT_SECRET ??= 'test-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh';
process.env.PORT ??= '5999';
process.env.TIMEZONE_OFFSET_MINUTES ??= '300'; // UTC+5 (Toshkent)

const {
    roundMoney,
    normalizeReason,
    reasonGroupKey,
    reasonLabel,
    mergeExpenseGroups,
    buildExpenseGroupsFromTransactions,
    summarizeTransactions,
    buildDailyBreakdown,
    percentChange,
    pickLargestExpense,
    buildExpenseGroupsPipeline,
    buildSummaryPipeline,
    buildDailyPipeline,
    buildExpenseSuggestionsPipeline,
} = await import('../src/lib/kassaStats.js');

const {
    currentMonthKey,
    currentDayKey,
    formatMonthKey,
    formatDayKey,
    monthKeyRange,
    dayKeyRange,
    shiftMonthKey,
    monthKeyLabel,
    resolveMonthQuery,
    resolveRangeQuery,
    startOfLocalMonth,
    startOfLocalDay,
    listDayKeys,
    getTimezoneOffsetMinutes,
    localDateToUtcInstant,
} = await import('../src/lib/datetime.js');

const { resolveMonthYear } = await import('../src/utils/reports/shared.js');

const {
    buildHistoryFilter,
    buildSort,
    resolvePeriod,
    roundAggregate,
    previousMatchFromPeriod,
    escapeRegExp,
} = await import('../src/lib/kassaQuery.js');

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

console.log('\n1) Pul yaxlitlash (float xatolar)');
check('0.1 + 0.2 -> 0.3', () => assert.equal(roundMoney(0.1 + 0.2), 0.3));
check('1.005 -> 1.01', () => assert.equal(roundMoney(1.005), 1.01));
check('3 * 0.1 -> 0.3', () => assert.equal(roundMoney(0.1 + 0.1 + 0.1), 0.3));
check("noto'g'ri qiymat -> 0", () => {
    assert.equal(roundMoney(undefined), 0);
    assert.equal(roundMoney('abc'), 0);
    assert.equal(roundMoney(null), 0);
});
check('12000.005 -> 12000.01 (katta sonlarda ham)', () => assert.equal(roundMoney(12000.005), 12000.01));

console.log('\n2) Izohlarni normallashtirish');
check("'  Ofis   uchun ' -> 'Ofis uchun'", () => assert.equal(normalizeReason('  Ofis   uchun '), 'Ofis uchun'));
check("bo'sh izoh -> 'Izohsiz'", () => {
    assert.equal(reasonLabel(''), 'Izohsiz');
    assert.equal(reasonLabel(null), 'Izohsiz');
    assert.equal(reasonLabel('   '), 'Izohsiz');
});
check('guruh kaliti katta-kichik harfga sezgir emas', () => {
    assert.equal(reasonGroupKey('Ofis  UCHUN'), reasonGroupKey(' ofis uchun '));
});

console.log('\n3) Chiqimlarni guruhlash (klientda emas — serverda)');
const manyTransactions = [];
for (let i = 0; i < 180; i += 1) {
    // 180 ta yozuv: ilgari klient faqat 100 tasini olib guruhlardi -> yig'indi xato edi.
    manyTransactions.push({
        type: 'CHIQIM',
        amount: 1000,
        reason: i % 2 === 0 ? 'Ofis uchun' : 'ofis   UCHUN',
        createdAt: new Date(Date.UTC(2026, 8, 1, 4, 0, i % 60)),
    });
}
manyTransactions.push({ type: 'CHIQIM', amount: 250.5, reason: 'Yoqilg\'i', createdAt: new Date(Date.UTC(2026, 8, 5, 4, 0, 0)) });
manyTransactions.push({ type: 'CHIQIM', amount: 49.5, reason: '', createdAt: new Date(Date.UTC(2026, 8, 6, 4, 0, 0)) });
manyTransactions.push({ type: 'KIRIM', amount: 999999, reason: 'Ofis uchun', createdAt: new Date(Date.UTC(2026, 8, 7, 4, 0, 0)) });

const groupsFromTx = buildExpenseGroupsFromTransactions(manyTransactions);
const ofisGroup = groupsFromTx.find((g) => g.key === 'ofis uchun');
check('180 ta yozuv bitta guruhga birlashdi', () => assert.equal(ofisGroup.count, 180));
check('guruh yig\'indisi to\'liq: 180 * 1000 = 180000', () => assert.equal(ofisGroup.total, 180000));
check("ko'rinadigan nom eng ko'p ishlatilgani ('Ofis uchun')", () => assert.equal(ofisGroup.label, 'Ofis uchun'));
check("izohsiz chiqim 'Izohsiz' guruhiga tushdi", () => {
    const noReason = groupsFromTx.find((g) => g.key === '');
    assert.equal(noReason.label, 'Izohsiz');
    assert.equal(noReason.total, 49.5);
});
check('KIRIM guruhga qo\'shilmaydi', () => {
    const total = groupsFromTx.reduce((s, g) => s + g.total, 0);
    assert.equal(total, 180000 + 250.5 + 49.5);
});
check('foizlar yig\'indisi 100 ga teng', () => {
    const sum = groupsFromTx.reduce((s, g) => s + g.percent, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `foizlar yig'indisi: ${sum}`);
});
check("o'rtacha summa to'g'ri", () => assert.equal(ofisGroup.average, 1000));
check('yig\'indi bo\'yicha kamayish tartibida saralangan', () => {
    assert.deepEqual(groupsFromTx.map((g) => g.total), [...groupsFromTx.map((g) => g.total)].sort((a, b) => b - a));
});

console.log('\n4) Kirim/chiqim yig\'indilari');
const summary = summarizeTransactions(manyTransactions);
check('kirim 999999', () => assert.equal(summary.income, 999999));
check('chiqim = 180000 + 250.5 + 49.5', () => assert.equal(summary.expense, 180300));
check('sof oqim = kirim - chiqim', () => assert.equal(summary.net, 819699));
check('kirim soni 1, chiqim soni 182', () => {
    assert.equal(summary.incomeCount, 1);
    assert.equal(summary.expenseCount, 182);
    assert.equal(summary.count, 183);
});
check('float yig\'indisi ham aniq (0.1 x 3)', () => {
    const s = summarizeTransactions([
        { type: 'CHIQIM', amount: 0.1 },
        { type: 'CHIQIM', amount: 0.2 },
    ]);
    assert.equal(s.expense, 0.3);
    assert.equal(s.net, -0.3);
});

console.log("\n5) Chiqimlar guruhlari (Mongo aggregation javobini qayta ishlash)");
const mergedGroups = mergeExpenseGroups([
    { key: 'ofis uchun', total: 120.5, count: 3, lastAt: new Date('2026-09-03T10:00:00Z'), labels: [{ label: 'Ofis uchun', count: 3 }] },
    { key: 'ofis uchun', total: 79.5, count: 1, lastAt: new Date('2026-09-10T10:00:00Z'), labels: [{ label: 'OFIS UCHUN', count: 1 }] },
    { key: 'yoqilg\'i', total: 50, count: 1, lastAt: null, labels: [{ label: "Yoqilg'i", count: 1 }] },
]);
check('bir xil kalitli guruhlar birlashtirildi', () => assert.equal(mergedGroups.length, 2));
check('summa 200, soni 4', () => {
    assert.equal(mergedGroups[0].total, 200);
    assert.equal(mergedGroups[0].count, 4);
});
check("foiz 80% / 20%", () => {
    assert.equal(mergedGroups[0].percent, 80);
    assert.equal(mergedGroups[1].percent, 20);
});
check("eng oxirgi sana saqlanadi", () => assert.equal(mergedGroups[0].lastAt, '2026-09-10T10:00:00.000Z'));
check("bo'sh ro'yxat -> bo'sh massiv", () => assert.deepEqual(mergeExpenseGroups([]), []));
check('null summalar 0 bo\'lib qoladi', () => {
    const res = mergeExpenseGroups([{ key: '', total: null, count: 2, labels: null }]);
    assert.equal(res[0].total, 0);
    assert.equal(res[0].label, 'Izohsiz');
});

console.log('\n6) Kunlik kesim');
const daily = buildDailyBreakdown(
    [{ _id: '2026-09-02', income: 100, expense: 30, count: 2 }],
    ['2026-09-01', '2026-09-02', '2026-09-03']
);
check('operatsiyasiz kunlar 0 bilan to\'ldiriladi', () => {
    assert.equal(daily.length, 3);
    assert.equal(daily[0].income, 0);
    assert.equal(daily[0].expense, 0);
});
check('net = kirim - chiqim', () => assert.equal(daily[1].net, 70));

console.log('\n7) Foizli o\'zgarish');
check('0 -> 100 = +100%', () => assert.equal(percentChange(100, 0), 100));
check('0 -> 0 = 0%', () => assert.equal(percentChange(0, 0), 0));
check('100 -> 50 = -50%', () => assert.equal(percentChange(50, 100), -50));

console.log('\n8) Eng katta chiqim');
check("eng katta chiqim topiladi (kirim hisobga olinmaydi)", () => {
    const largest = pickLargestExpense(manyTransactions);
    assert.equal(largest.amount, 1000);
    assert.equal(largest.reason, 'Ofis uchun');
});

console.log('\n9) Ish mintaqasi bo\'yicha oy/kun chegaralari (UTC+5)');
check('TIMEZONE_OFFSET_MINUTES=300 o\'qildi', () => assert.equal(getTimezoneOffsetMinutes(), 300));
check('oy boshi = oldingi kunning 19:00 UTC', () => {
    const range = monthKeyRange('2026-09');
    assert.equal(range.start.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(range.endExclusive.toISOString(), '2026-09-30T19:00:00.000Z');
});
check('kechqurun kiritilgan operatsiya TOSHKENToq oyga tushadi', () => {
    // 31-avgust 20:00 UTC = 1-sentabr 01:00 (Toshkent) -> sentabr oyi
    const instant = new Date('2026-08-31T20:00:00.000Z');
    assert.equal(formatMonthKey(instant), '2026-09');
    assert.equal(formatDayKey(instant), '2026-09-01');
    const range = monthKeyRange('2026-09');
    assert.ok(instant >= range.start && instant < range.endExclusive);
});
check('30-sentabr 18:59 UTC hali sentabrda', () => {
    const instant = new Date('2026-09-30T18:59:59.000Z');
    const range = monthKeyRange('2026-09');
    assert.ok(instant >= range.start && instant < range.endExclusive);
});
check('oy oxiridagi 1 oktabr 00:30 (Toshkent) oktabrga o\'tadi', () => {
    assert.equal(formatMonthKey(new Date('2026-09-30T19:30:00.000Z')), '2026-10');
});
check('fevral (kabisa bo\'lmagan yil) 28 kun', () => {
    assert.equal(listDayKeys(monthKeyRange('2026-02').start, monthKeyRange('2026-02').endExclusive).length, 28);
});
check('sentabr 30 kun', () => {
    assert.equal(listDayKeys(monthKeyRange('2026-09').start, monthKeyRange('2026-09').endExclusive).length, 30);
});
check("oy kalitini siljitish yil chegarasida ishlaydi", () => {
    assert.equal(shiftMonthKey('2026-12', 1), '2027-01');
    assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
});
check('oy nomi', () => assert.equal(monthKeyLabel('2026-09'), 'Sentabr 2026'));
check('currentMonthKey 1-sentabr 00:30 (Toshkent)', () => {
    assert.equal(currentMonthKey(new Date('2026-08-31T19:30:00.000Z')), '2026-09');
});
check('currentDayKey mahalliy kunga o\'tadi', () => {
    assert.equal(currentDayKey(new Date('2026-09-10T19:30:00.000Z')), '2026-09-11');
});
check("kun boshi/oxiri (dayKeyRange)", () => {
    const r = dayKeyRange('2026-09-15');
    assert.equal(r.start.toISOString(), '2026-09-14T19:00:00.000Z');
    assert.equal(r.endExclusive.toISOString(), '2026-09-15T19:00:00.000Z');
});
check("startOfLocalMonth / startOfLocalDay", () => {
    const instant = new Date('2026-09-15T20:00:00.000Z');
    assert.equal(startOfLocalMonth(instant).toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(startOfLocalDay(instant).toISOString(), '2026-09-15T19:00:00.000Z');
});
check('localDateToUtcInstant teskari ishlaydi', () => {
    assert.equal(localDateToUtcInstant(2026, 9, 1, 300).toISOString(), '2026-08-31T19:00:00.000Z');
});

console.log('\n10) So\'rov parametrlarini tahlil qilish');
check('month=2026-09', () => assert.equal(resolveMonthQuery({ month: '2026-09' }), '2026-09'));
check('month=9&year=2026', () => assert.equal(resolveMonthQuery({ month: '9', year: '2026' }), '2026-09'));
check("month=13 noto'g'ri -> null", () => assert.equal(resolveMonthQuery({ month: '13' }), null));
check('month=abc -> null', () => assert.equal(resolveMonthQuery({ month: 'abc' }), null));
check('from/to (faqat kun) -> mahalliy kun chegaralari', () => {
    const range = resolveRangeQuery({ from: '2026-09-01', to: '2026-09-30' });
    assert.equal(range.start.toISOString(), '2026-08-31T19:00:00.000Z');
    // to=2026-09-30 -> 30-sentabr kuni oxiri (eksklyuziv: 1-oktabr boshlanishi)
    assert.equal(range.endExclusive.toISOString(), '2026-09-30T19:00:00.000Z');
});
check("eski klient yuboradigan UTC yarim tun 'to' qiymati kun oxirini qamraydi", () => {
    const range = resolveRangeQuery({ from: '2026-09-01T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z' });
    assert.equal(range.start.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(range.endExclusive.toISOString(), '2026-09-30T19:00:00.000Z');
});
check("haqiqiy ISO instant chegarasi o'zidek qoladi", () => {
    const range = resolveRangeQuery({ from: '2026-09-01T08:30:00.000Z', to: '2026-09-02T08:30:00.000Z' });
    assert.equal(range.start.toISOString(), '2026-09-01T08:30:00.000Z');
    // 'to' — aniq instant sifatida inkluziv chegara ($lt uchun +1ms)
    assert.equal(range.end.toISOString(), '2026-09-02T08:30:00.000Z');
    assert.equal(range.endExclusive.toISOString(), '2026-09-02T08:30:00.001Z');
});
check('faqat "to" berilganda ham ishlaydi', () => {
    const range = resolveRangeQuery({ to: '2026-09-30' });
    assert.equal(range.start, null);
    assert.equal(range.endExclusive.toISOString(), '2026-09-30T19:00:00.000Z');
});
check('month parametri from/to dan ustun', () => {
    const range = resolveRangeQuery({ month: '2026-09', from: '2020-01-01' });
    assert.equal(range.monthKey, '2026-09');
});
check("parametrsiz so'rov -> null", () => assert.equal(resolveRangeQuery({}), null));

console.log('\n11) Hisobotlar (Excel/PDF) uchun oy chegaralari');
check("resolveMonthYear standart oyi ish mintaqasi bo'yicha", () => {
    const res = resolveMonthYear({});
    const expected = currentMonthKey();
    assert.equal(res.month, Number(expected.slice(5, 7)));
    assert.equal(res.year, Number(expected.slice(0, 4)));
});
check('resolveMonthYear sentabr 2026 chegarasi', () => {
    const res = resolveMonthYear({ month: '9', year: '2026' });
    assert.equal(res.start.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(res.end.toISOString(), '2026-09-30T18:59:59.999Z');
});
check("resolveMonthYear oy nomini ham qabul qiladi", () => {
    const res = resolveMonthYear({ month: 'sentabr', year: '2026' });
    assert.equal(res.monthKey, '2026-09');
});

console.log('\n12) Mongo aggregation pipeline tuzilishi');
check('guruhlar pipeline: CHIQIM + DB darajasida guruhlash', () => {
    const pipeline = buildExpenseGroupsPipeline({ createdAt: { $gte: new Date(0) } });
    assert.equal(pipeline[0].$match.type, 'CHIQIM');
    assert.ok(pipeline.some((s) => s.$group));
    assert.ok(pipeline.some((s) => s.$sort));
    // $limit BO'LMASLIGI kerak: yig'indi sahifalash bilan kesilmasin.
    assert.ok(!pipeline.some((s) => s.$limit), "guruhlashda $limit bo'lmasligi kerak");
});
check('xulosa pipeline: kirim/chiqimni bitta o\'tishda yig\'adi', () => {
    const pipeline = buildSummaryPipeline({ type: 'KIRIM' });
    assert.equal(pipeline[0].$match.type, 'KIRIM');
    const group = pipeline.find((s) => s.$group);
    assert.ok(group.$group.income.$sum);
    assert.ok(group.$group.expense.$sum);
    assert.ok(group.$group.count.$sum);
});
check('kunlik pipeline mintaqa siljishini ayiradi', () => {
    const pipeline = buildDailyPipeline({});
    const group = pipeline.find((s) => s.$group);
    assert.equal(group.$group._id.$dateToString.date.$subtract[1], 300 * 60 * 1000);
    assert.equal(group.$group._id.$dateToString.format, '%Y-%m-%d');
});
check("taklif pipeline bo'sh izohlarni chiqarib tashlaydi", () => {
    const pipeline = buildExpenseSuggestionsPipeline(10);
    assert.deepEqual(pipeline[0].$match.reason.$nin, [null, '']);
    assert.ok(pipeline.some((s) => s.$limit));
});

console.log('\n13) So\'rov -> Mongo filter');
check("type filtri faqat KIRIM/CHIQIM uchun qo'llanadi", () => {
    assert.equal(buildHistoryFilter({ type: 'CHIQIM' }).filter.type, 'CHIQIM');
    assert.equal(buildHistoryFilter({ type: 'kirim' }).filter.type, 'KIRIM');
    assert.equal(buildHistoryFilter({ type: 'hack' }).filter.type, undefined);
});
check('oy filtri $gte/$lt bilan (eksklyuziv yuqori chegara)', () => {
    const { filter, range } = buildHistoryFilter({ month: '2026-09' });
    assert.equal(filter.createdAt.$gte.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(filter.createdAt.$lt.toISOString(), '2026-09-30T19:00:00.000Z');
    assert.equal(range.monthKey, '2026-09');
});
check('from/to kunlari mahalliy kun chegaralariga aylantiriladi', () => {
    const { filter } = buildHistoryFilter({ from: '2026-09-01', to: '2026-09-30' });
    assert.equal(filter.createdAt.$gte.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(filter.createdAt.$lt.toISOString(), '2026-09-30T19:00:00.000Z');
});
check('qidiruv regex belgilaridan tozalanadi', () => {
    const { filter } = buildHistoryFilter({ search: 'Ofis (1+1) *x*' });
    assert.equal(filter.reason.$options, 'i');
    assert.equal(filter.reason.$regex, 'Ofis \\(1\\+1\\) \\*x\\*');
    assert.equal(escapeRegExp('a.b*c'), 'a\\.b\\*c');
});
check("qidiruvdagi ortiqcha bo'shliqlar tozalanadi", () => {
    const { filter } = buildHistoryFilter({ search: '  Ofis   uchun  ' });
    assert.equal(filter.reason.$regex, 'Ofis uchun');
});
check("noto'g'ri oy -> 400 xatolik (jimgina joriy oy emas)", () => {
    assert.throws(() => resolvePeriod({ month: '2026-13' }), /Oy formati noto'g'ri/);
    assert.throws(() => resolvePeriod({ month: 'salom' }), /Oy formati noto'g'ri/);
});
check('parametrsiz davr -> null (joriy oy chaqiruvchi tomonda)', () => {
    assert.equal(resolvePeriod({}), null);
    assert.equal(buildHistoryFilter({}).filter.createdAt, undefined);
});
check('saralash: asc/desc', () => {
    assert.equal(buildSort({ order: 'asc' }).createdAt, 1);
    assert.equal(buildSort({ order: 'desc' }).createdAt, -1);
    assert.equal(buildSort({}).createdAt, -1);
});
check('aggregation natijasi yaxlitlanadi va null bo\'lsa 0', () => {
    const res = roundAggregate(null);
    assert.equal(res.income, 0);
    assert.equal(res.expense, 0);
    assert.equal(res.net, 0);
    assert.equal(res.count, 0);
    const res2 = roundAggregate({ income: 100.005, expense: 0.1 + 0.2, incomeCount: 2, expenseCount: 3 });
    assert.equal(res2.income, 100.01);
    assert.equal(res2.expense, 0.3);
    assert.equal(res2.net, 99.71);
    assert.equal(res2.count, 5);
});
check('oldingi davr matcheri faqat kerakli maydonlarni oladi', () => {
    const match = previousMatchFromPeriod(
        { start: new Date('2026-08-31T19:00:00Z'), endExclusive: new Date('2026-09-30T19:00:00Z') },
        { type: 'CHIQIM' }
    );
    assert.equal(match.type, 'CHIQIM');
    assert.equal(match.createdAt.$gte.toISOString(), '2026-08-31T19:00:00.000Z');
    assert.equal(match.createdAt.$lt.toISOString(), '2026-09-30T19:00:00.000Z');
    assert.equal(previousMatchFromPeriod(null), null);
});

console.log(
    failures === 0
        ? `\nHAMMASI OK ✅ (${passed} ta tekshiruv)`
        : `\n${failures} ta tekshiruv yiqildi ❌ (${passed} ta o'tdi)`
);
process.exit(failures === 0 ? 0 : 1);
