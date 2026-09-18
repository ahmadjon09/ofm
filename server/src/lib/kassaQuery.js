import { ApiError } from './helpers.js';
import { resolveRangeQuery } from './datetime.js';
import { normalizeReason, roundMoney } from './kassaStats.js';

/**
 * Kassa so'rovlarini (query) Mongo filtriga aylantirish — DB ga bog'lanmagan
 * sof funksiyalar. Shu sababli ularni Mongo'siz test qilish mumkin
 * (scripts/kassa-stats-test.mjs).
 */

export const HISTORY_SELECT = 'type amount reason client clientName user balanceAfter createdAt';

export function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * month/from/to parametrlaridan davr oralig'ini oladi.
 * Oy formati noto'g'ri bo'lsa — jimgina joriy oyga tushib qolmasligi uchun 400.
 * (datetime.js ataylab throw qilmaydi — u sof modul.)
 */
export function resolvePeriod(query = {}, now = new Date()) {
    const range = resolveRangeQuery(query, { now });
    if (range) return range;

    const rawMonth = query.month === undefined || query.month === null ? '' : String(query.month).trim();
    if (rawMonth !== '') {
        throw new ApiError(400, `Oy formati noto'g'ri: "${query.month}". YYYY-MM ko'rinishida yuboring (masalan: 2026-09).`);
    }

    return null;
}

/**
 * So'rov parametrlaridan (type/month/from/to/search) Mongo filter quradi.
 * Barcha sana chegaralari ish mintaqasi (config.timezoneOffsetMinutes) bo'yicha
 * va `$lt` (eksklyuziv) bilan — kun/oy oxiri to'liq qamrab olinadi.
 */
export function buildHistoryFilter(query = {}, now = new Date()) {
    const filter = {};

    const rawType = String(query.type || '').toUpperCase();
    if (rawType === 'KIRIM' || rawType === 'CHIQIM') {
        filter.type = rawType;
    }

    const range = resolvePeriod(query, now);
    if (range && (range.start || range.endExclusive)) {
        filter.createdAt = {};
        if (range.start) filter.createdAt.$gte = range.start;
        if (range.endExclusive) filter.createdAt.$lt = range.endExclusive;
    }

    const search = normalizeReason(query.search ?? query.q);
    if (search) {
        // Izoh bo'yicha qidiruv — katta-kichik harfga sezgir emas, regex belgilari escape qilinadi.
        filter.reason = { $regex: escapeRegExp(search), $options: 'i' };
    }

    return { filter, range };
}

export function buildSort(query = {}) {
    const order = String(query.order || query.sort || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    return { createdAt: order, _id: order };
}

/** Aggregation natijasini (kirim/chiqim) klientga tayyor ko'rinishga keltiradi. */
export function roundAggregate(row, extra = {}) {
    const income = roundMoney(row?.income);
    const expense = roundMoney(row?.expense);
    const incomeCount = Number(row?.incomeCount) || 0;
    const expenseCount = Number(row?.expenseCount) || 0;
    return {
        income,
        expense,
        net: roundMoney(income - expense),
        incomeCount,
        expenseCount,
        count: Number(row?.count) || incomeCount + expenseCount,
        lastTransactionAt: row?.lastTransactionAt ? new Date(row.lastTransactionAt).toISOString() : null,
        ...extra,
    };
}

/** Chiqim guruhlari uchun oldingi davr matcher'i (o'zgarish foizini hisoblash uchun). */
export function previousMatchFromPeriod(period, baseFilter = {}) {
    if (!period || (!period.start && !period.endExclusive)) return null;
    const match = {};
    if (baseFilter.type) match.type = baseFilter.type;
    if (baseFilter.reason) match.reason = baseFilter.reason;
    match.createdAt = {};
    if (period.start) match.createdAt.$gte = period.start;
    if (period.endExclusive) match.createdAt.$lt = period.endExclusive;
    return match;
}
