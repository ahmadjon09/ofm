import { getTimezoneOffsetMs } from './datetime.js';

/**
 * Kassa statistikasi uchun sof (pure) yordamchilar.
 *
 * Bu fayldagi funksiyalar hech qanday DB/HTTP ga bog'lanmagan — shuning uchun
 * ularni to'g'ridan-to'g'ri test qilish mumkin (scripts/kassa-stats-test.mjs).
 * Barcha pul hisob-kitoblari `roundMoney` orqali 2 xonagacha yaxlitlanadi —
 * float qo'shishdagi 0.1 + 0.2 = 0.30000000000000004 kabi xatolar oldini oladi.
 */

const MONEY_PRECISION = 2;
const NO_REASON_LABEL = 'Izohsiz';

function roundMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

function roundPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 10) / 10;
}

function sumMoney(values = []) {
    return roundMoney(values.reduce((acc, v) => acc + (Number(v) || 0), 0));
}

/** Ortiqcha bo'shliqlarni tozalaydi: '  Ofis   uchun ' -> 'Ofis uchun' */
function normalizeReason(reason) {
    if (reason === undefined || reason === null) return '';
    return String(reason).replace(/\s+/g, ' ').trim();
}

/**
 * Guruhlash kaliti: katta-kichik harf va bo'shliqlar hisobga olinmaydi.
 * 'Ofis uchun', 'ofis  UCHUN', ' Ofis uchun ' — bitta guruh bo'ladi.
 */
function reasonGroupKey(reason) {
    return normalizeReason(reason).toLowerCase();
}

function reasonLabel(reason) {
    return normalizeReason(reason) || NO_REASON_LABEL;
}

/**
 * Mongo aggregation natijasidagi guruhlarni birlashtiradi va foiz/o'rtacha
 * ko'rsatkichlarini qo'shadi.
 *
 * Kirish: [{ key, labels: [{ label, count }], total, count, lastAt }]
 * Chiqish: [{ key, label, total, count, percent, average, share, lastAt }]
 */
function mergeExpenseGroups(rawGroups = [], totalExpense = null) {
    const merged = new Map();

    rawGroups.forEach((group) => {
        const sourceKey = group?.key ?? group?._id ?? '';
        const key = reasonGroupKey(sourceKey);
        const labels = Array.isArray(group?.labels) && group.labels.length > 0
            ? group.labels
            : [{ label: group?.label ?? sourceKey, count: group?.count ?? 1 }];

        let entry = merged.get(key);
        if (!entry) {
            entry = { key, total: 0, count: 0, lastAt: null, labelCounts: new Map() };
            merged.set(key, entry);
        }

        entry.total = roundMoney(entry.total + (Number(group?.total) || 0));
        entry.count += Number(group?.count) || 0;

        const lastAt = group?.lastAt ? new Date(group.lastAt) : null;
        if (lastAt && !Number.isNaN(lastAt.getTime()) && (!entry.lastAt || lastAt > entry.lastAt)) {
            entry.lastAt = lastAt;
        }

        labels.forEach(({ label, count, lastAt: labelLastAt }) => {
            const cleanLabel = reasonLabel(label);
            const prev = entry.labelCounts.get(cleanLabel) || { count: 0, lastAt: null };
            const safeCount = Number(count) || 0;
            const labelDate = labelLastAt ? new Date(labelLastAt) : null;
            entry.labelCounts.set(cleanLabel, {
                count: prev.count + safeCount,
                lastAt: labelDate && (!prev.lastAt || labelDate > prev.lastAt) ? labelDate : prev.lastAt,
            });
        });
    });

    const grandTotal = totalExpense === null || totalExpense === undefined
        ? sumMoney([...merged.values()].map((g) => g.total))
        : roundMoney(totalExpense);

    const groups = [...merged.values()].map((entry) => {
        const label = pickGroupLabel(entry.labelCounts);
        const total = roundMoney(entry.total);
        const count = entry.count;
        return {
            key: entry.key,
            label,
            total,
            count,
            percent: grandTotal > 0 ? roundPercent((total / grandTotal) * 100) : 0,
            average: count > 0 ? roundMoney(total / count) : 0,
            lastAt: entry.lastAt ? entry.lastAt.toISOString() : null,
        };
    });

    groups.sort((a, b) => (b.total - a.total) || (b.count - a.count) || a.label.localeCompare(b.label));
    return groups;
}

/** Eng ko'p uchragan yozuv shaklini tanlaydi (bir xil bo'lsa — birinchisi). */
function pickGroupLabel(labelCounts) {
    let best = null;
    labelCounts.forEach((value, label) => {
        if (!best || value.count > best.count) {
            best = { label, count: value.count };
        }
    });
    return best ? best.label : NO_REASON_LABEL;
}

/**
 * Tranzaksiyalar ro'yxatidan guruhlarni quradi (JS tomonidagi fallback va testlar uchun).
 * Server esa asosiy yo'lda Mongo aggregation ishlatadi.
 */
function buildExpenseGroupsFromTransactions(transactions = []) {
    const buckets = new Map();

    transactions.forEach((tx) => {
        if (tx?.type && tx.type !== 'CHIQIM') return;
        const key = reasonGroupKey(tx?.reason);
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { key, total: 0, count: 0, labels: new Map(), lastAt: null };
            buckets.set(key, bucket);
        }
        bucket.total = roundMoney(bucket.total + (Number(tx?.amount) || 0));
        bucket.count += 1;
        const label = reasonLabel(tx?.reason);
        bucket.labels.set(label, (bucket.labels.get(label) || 0) + 1);
        const createdAt = tx?.createdAt ? new Date(tx.createdAt) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime()) && (!bucket.lastAt || createdAt > bucket.lastAt)) {
            bucket.lastAt = createdAt;
        }
    });

    const rawGroups = [...buckets.values()].map((bucket) => ({
        key: bucket.key,
        total: bucket.total,
        count: bucket.count,
        lastAt: bucket.lastAt,
        labels: [...bucket.labels.entries()].map(([label, count]) => ({ label, count })),
    }));

    return mergeExpenseGroups(rawGroups);
}

/** Kirim/chiqim yig'indilari — har doim 2 xonaga yaxlitlanadi. */
function summarizeTransactions(transactions = []) {
    let income = 0;
    let expense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let lastTransactionAt = null;

    transactions.forEach((tx) => {
        const amount = Number(tx?.amount) || 0;
        if (tx?.type === 'KIRIM') {
            income += amount;
            incomeCount += 1;
        } else if (tx?.type === 'CHIQIM') {
            expense += amount;
            expenseCount += 1;
        }
        const createdAt = tx?.createdAt ? new Date(tx.createdAt) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime()) && (!lastTransactionAt || createdAt > lastTransactionAt)) {
            lastTransactionAt = createdAt;
        }
    });

    const roundedIncome = roundMoney(income);
    const roundedExpense = roundMoney(expense);
    return {
        income: roundedIncome,
        expense: roundedExpense,
        net: roundMoney(roundedIncome - roundedExpense),
        incomeCount,
        expenseCount,
        count: incomeCount + expenseCount,
        lastTransactionAt: lastTransactionAt ? lastTransactionAt.toISOString() : null,
    };
}

/**
 * Kunlik kesim: aggregation natijasidagi kunlar ro'yxatini to'ldiradi
 * (operatsiya bo'lmagan kunlar ham 0 bilan chiqadi).
 */
function buildDailyBreakdown(dayRows = [], dayKeys = []) {
    const map = new Map();
    dayRows.forEach((row) => {
        const key = row?._id || row?.day || row?.date;
        if (!key) return;
        map.set(String(key), row);
    });

    const keys = dayKeys && dayKeys.length > 0
        ? dayKeys
        : [...map.keys()].sort();

    return keys.map((key) => {
        const row = map.get(key) || {};
        const income = roundMoney(row.income);
        const expense = roundMoney(row.expense);
        return {
            date: key,
            income,
            expense,
            net: roundMoney(income - expense),
            count: Number(row.count) || 0,
        };
    });
}

/** Foizli o'zgarish (oldingi davrga nisbatan). */
function percentChange(current, previous) {
    const currentValue = roundMoney(current);
    const previousValue = roundMoney(previous);
    if (previousValue === 0) return currentValue === 0 ? 0 : 100;
    return roundPercent(((currentValue - previousValue) / Math.abs(previousValue)) * 100);
}

/** Tranzaksiyalardan eng katta chiqimni topadi. */
function pickLargestExpense(transactions = []) {
    let largest = null;
    transactions.forEach((tx) => {
        if (tx?.type && tx.type !== 'CHIQIM') return;
        const amount = roundMoney(tx?.amount);
        if (!largest || amount > largest.amount) {
            largest = {
                amount,
                reason: reasonLabel(tx?.reason),
                createdAt: tx?.createdAt ? new Date(tx.createdAt).toISOString() : null,
            };
        }
    });
    return largest;
}

/**
 * Chiqimlarni sabab (izoh) bo'yicha guruhlash uchun Mongo aggregation pipeline.
 * Guruhlash DB darajasida bajariladi — shuning uchun sahifalash (limit) ta'sir
 * qilmaydi va yig'indi har doim to'liq bo'ladi.
 *
 * Katta-kichik harf va chetdagi bo'shliqlar DB da, ichki bo'shliqlar esa
 * `mergeExpenseGroups` da birlashtiriladi.
 */
function buildExpenseGroupsPipeline(match = {}, offsetMs = getTimezoneOffsetMs()) {
    const baseMatch = { ...match, type: 'CHIQIM' };
    return [
        { $match: baseMatch },
        {
            $addFields: {
                _groupKey: { $toLower: { $trim: { input: { $ifNull: ['$reason', ''] } } } },
                _groupLabel: { $trim: { input: { $ifNull: ['$reason', ''] } } },
            },
        },
        {
            $group: {
                _id: { key: '$_groupKey', label: '$_groupLabel' },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                lastAt: { $max: '$createdAt' },
            },
        },
        {
            $group: {
                _id: '$_id.key',
                total: { $sum: '$total' },
                count: { $sum: '$count' },
                lastAt: { $max: '$lastAt' },
                labels: { $push: { label: '$_id.label', count: '$count', lastAt: '$lastAt' } },
            },
        },
        { $sort: { total: -1, count: -1 } },
    ];
}

/** Kirim/chiqim yig'indilari uchun pipeline (sahifalashdan qat'i nazar to'liq). */
function buildSummaryPipeline(match = {}) {
    return [
        { $match: match },
        {
            $group: {
                _id: null,
                income: { $sum: { $cond: [{ $eq: ['$type', 'KIRIM'] }, '$amount', 0] } },
                expense: { $sum: { $cond: [{ $eq: ['$type', 'CHIQIM'] }, '$amount', 0] } },
                incomeCount: { $sum: { $cond: [{ $eq: ['$type', 'KIRIM'] }, 1, 0] } },
                expenseCount: { $sum: { $cond: [{ $eq: ['$type', 'CHIQIM'] }, 1, 0] } },
                count: { $sum: 1 },
                lastTransactionAt: { $max: '$createdAt' },
            },
        },
        { $project: { _id: 0 } },
    ];
}

/** Kunlik kirim/chiqim kesimi (ish mintaqasi bo'yicha kunlarga bo'linadi). */
function buildDailyPipeline(match = {}, offsetMs = getTimezoneOffsetMs()) {
    return [
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { date: { $subtract: ['$createdAt', offsetMs] }, format: '%Y-%m-%d' } },
                income: { $sum: { $cond: [{ $eq: ['$type', 'KIRIM'] }, '$amount', 0] } },
                expense: { $sum: { $cond: [{ $eq: ['$type', 'CHIQIM'] }, '$amount', 0] } },
                count: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ];
}

/** Chiqim sabablari (taklif ro'yxati) uchun pipeline. */
function buildExpenseSuggestionsPipeline(limit = 10) {
    return [
        { $match: { type: 'CHIQIM', reason: { $nin: [null, ''] } } },
        {
            $group: {
                _id: { $toLower: { $trim: { input: { $ifNull: ['$reason', ''] } } } },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
                last: { $max: '$createdAt' },
                labels: { $push: { label: { $trim: { input: { $ifNull: ['$reason', ''] } } }, lastAt: '$createdAt' } },
            },
        },
        { $sort: { last: -1 } },
        { $limit: Math.max(Number(limit) || 10, 1) },
        {
            $project: {
                _id: 0,
                key: '$_id',
                total: 1,
                count: 1,
                last: 1,
                labels: 1,
            },
        },
    ];
}

/** Kassa tranzaksiyasi uchun javob obyekti (klient uchun "label" ham qo'shiladi). */
function mapTransaction(tx) {
    if (!tx) return tx;
    const type = tx.type;
    return {
        ...tx,
        type,
        amount: roundMoney(tx.amount),
        label: reasonLabel(tx.reason || tx.source),
    };
}

export {
    MONEY_PRECISION,
    NO_REASON_LABEL,
    buildExpenseGroupsPipeline,
    buildSummaryPipeline,
    buildDailyPipeline,
    buildExpenseSuggestionsPipeline,
    roundMoney,
    roundPercent,
    sumMoney,
    normalizeReason,
    reasonGroupKey,
    reasonLabel,
    pickGroupLabel,
    mergeExpenseGroups,
    buildExpenseGroupsFromTransactions,
    summarizeTransactions,
    buildDailyBreakdown,
    percentChange,
    pickLargestExpense,
    mapTransaction,
};
