import { ApiError, sendSuccess, isValidObjectId, parsePagination, buildMeta } from '../lib/helpers.js';
import { KassaTransaction, getKassaDoc, kassaAddIncome, kassaAddExpense } from '../models/index.js';
import { kassaStore, getCache, setCache, clearKassaCache } from '../lib/cache.js';
import {
    currentMonthKey,
    describeRange,
    getTimezoneOffsetMinutes,
    getTimezoneOffsetMs,
    listDayKeys,
    monthKeyRange,
    shiftMonthKey,
} from '../lib/datetime.js';
import {
    buildDailyPipeline,
    buildExpenseGroupsPipeline,
    buildSummaryPipeline,
    buildExpenseSuggestionsPipeline,
    buildDailyBreakdown,
    mergeExpenseGroups,
    normalizeReason,
    percentChange,
    mapTransaction,
    reasonLabel,
    roundMoney,
} from '../lib/kassaStats.js';

import {
    HISTORY_SELECT,
    buildHistoryFilter,
    buildSort,
    previousMatchFromPeriod,
    resolvePeriod,
    roundAggregate,
} from '../lib/kassaQuery.js';

async function getCachedKassaBalance() {
    const cached = getCache(kassaStore);
    if (cached && typeof cached.balance === 'number') return cached.balance;
    const kassa = await getKassaDoc();
    setCache(kassaStore, { balance: kassa.balance }, 5);
    return kassa.balance;
}

async function aggregateSummary(match) {
    const rows = await KassaTransaction.aggregate(buildSummaryPipeline(match));
    return roundAggregate(rows[0]);
}

async function aggregateExpenseGroups(match, totalExpense = null) {
    const rows = await KassaTransaction.aggregate(buildExpenseGroupsPipeline(match, getTimezoneOffsetMs()));
    return mergeExpenseGroups(rows, totalExpense);
}

/**
 * Joriy va oldingi davr chegaralarini aniqlaydi (oy yoki ixtiyoriy oraliq).
 * O'zgarish foizini hisoblash uchun kerak.
 */
function periodsFromRange(range, now = new Date()) {
    if (!range) {
        const currentKey = currentMonthKey(now);
        return {
            current: monthKeyRange(currentKey),
            previous: monthKeyRange(shiftMonthKey(currentKey, -1)),
        };
    }

    if (range.monthKey) {
        const previous = monthKeyRange(shiftMonthKey(range.monthKey, -1));
        return {
            current: range,
            previous: previous ? { ...previous, monthKey: previous.monthKey, label: previous.label } : null,
        };
    }

    const duration = range.endExclusive && range.start
        ? range.endExclusive.getTime() - range.start.getTime()
        : null;
    const previous = duration && duration > 0 && range.start
        ? {
            start: new Date(range.start.getTime() - duration),
            endExclusive: new Date(range.start.getTime()),
            end: new Date(range.start.getTime() - 1),
            monthKey: null,
            label: null,
        }
        : null;

    return { current: range, previous };
}
const kassaController = {
    async get(req, res) {
        const balance = await getCachedKassaBalance();
        return sendSuccess(res, 200, "Kassa ma'lumotlari.", {
            balance,
            currentMonth: currentMonthKey(),
            timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
        });
    },

    /**
     * Kassa tarixi + shu filtr bo'yicha TO'LIQ yig'indi (sahifalashdan qat'i nazar).
     * Klient endi jami summalarni sahifadagi qatordan emas, shu javobdan oladi.
     */
    async history(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { filter, range } = buildHistoryFilter(req.query);
        const sort = buildSort(req.query);

        const [history, total, summary, balance] = await Promise.all([
            KassaTransaction.find(filter)
                .select(HISTORY_SELECT)
                .populate('client', 'name phone')
                .populate('user', 'name role')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            KassaTransaction.countDocuments(filter),
            aggregateSummary(filter),
            getCachedKassaBalance(),
        ]);

        return sendSuccess(
            res,
            200,
            'Kassa tarixi.',
            {
                history: history.map(mapTransaction),
                balance,
                summary: { ...summary, balance },
                range: describeRange(range),
                filters: {
                    type: filter.type || null,
                    search: normalizeReason(req.query.search ?? req.query.q) || null,
                },
            },
            buildMeta(total, page, limit)
        );
    },

    /**
     * Oylik (yoki ixtiyoriy davr) xulosa: kirim, chiqim, sof oqim, kunlik kesim,
     * chiqim guruhlari va oldingi davr bilan taqqoslash. Barchasi serverda,
     * ish mintaqasi chegaralari bo'yicha hisoblanadi.
     */
    async summary(req, res) {
        const now = new Date();
        const offsetMinutes = getTimezoneOffsetMinutes();
        const currentKey = currentMonthKey(now, offsetMinutes);

        const range = resolvePeriod(req.query, now)
            || monthKeyRange(currentKey, offsetMinutes);

        const { current, previous } = periodsFromRange(range, now);

        const match = {};
        if (req.query.type && ['KIRIM', 'CHIQIM'].includes(String(req.query.type).toUpperCase())) {
            match.type = String(req.query.type).toUpperCase();
        }
        const rangeFilter = {};
        if (current.start) rangeFilter.$gte = current.start;
        if (current.endExclusive) rangeFilter.$lt = current.endExclusive;
        if (Object.keys(rangeFilter).length > 0) match.createdAt = rangeFilter;

        const previousMatch = previousMatchFromPeriod(previous, match);

        const [
            summaryRow,
            previousRow,
            groupRows,
            dailyRows,
            largestExpenseDoc,
            balance,
        ] = await Promise.all([
            aggregateSummary(match),
            previousMatch ? aggregateSummary(previousMatch) : Promise.resolve(null),
            aggregateExpenseGroups(match),
            KassaTransaction.aggregate(buildDailyPipeline(match, getTimezoneOffsetMs())),
            KassaTransaction.findOne({ ...match, type: 'CHIQIM' }).sort({ amount: -1 }).select('amount reason createdAt').lean(),
            getCachedKassaBalance(),
        ]);

        const expenseGroups = groupRows;
        const expenseGroupsTotal = roundMoney(expenseGroups.reduce((sum, g) => sum + g.total, 0));
        const expenseGroupsCount = expenseGroups.reduce((sum, g) => sum + g.count, 0);
        // Kunlik kesim davrning BARCHA kunlarini o'z ichiga oladi (operatsiya
        // bo'lmagan kunlar ham 0 bilan) — grafikda bo'shliq bo'lmasin.
        const dayKeys = current.start && current.endExclusive
            ? listDayKeys(current.start, current.endExclusive, offsetMinutes)
            : [];
        const daily = buildDailyBreakdown(dailyRows, dayKeys);

        const income = summaryRow.income;
        const expense = summaryRow.expense;

        return sendSuccess(res, 200, 'Kassa xulosasi.', {
            balance,
            month: current.monthKey || null,
            monthLabel: current.label || current.monthKey || null,
            currentMonth: currentKey,
            timezoneOffsetMinutes: offsetMinutes,
            range: describeRange(current),
            income,
            expense,
            net: roundMoney(income - expense),
            incomeCount: summaryRow.incomeCount,
            expenseCount: summaryRow.expenseCount,
            count: summaryRow.count,
            averageIncome: summaryRow.incomeCount > 0 ? roundMoney(income / summaryRow.incomeCount) : 0,
            averageExpense: summaryRow.expenseCount > 0 ? roundMoney(expense / summaryRow.expenseCount) : 0,
            largestExpense: largestExpenseDoc
                ? {
                    amount: roundMoney(largestExpenseDoc.amount),
                    reason: reasonLabel(largestExpenseDoc.reason),
                    createdAt: largestExpenseDoc.createdAt
                        ? new Date(largestExpenseDoc.createdAt).toISOString()
                        : null,
                }
                : null,
            lastTransactionAt: summaryRow.lastTransactionAt,
            previous: previousRow
                ? {
                    month: previous.monthKey || null,
                    monthLabel: previous.label || previous.monthKey || null,
                    income: previousRow.income,
                    expense: previousRow.expense,
                    net: roundMoney(previousRow.income - previousRow.expense),
                    count: previousRow.count,
                }
                : null,
            change: previousRow
                ? {
                    incomePercent: percentChange(income, previousRow.income),
                    expensePercent: percentChange(expense, previousRow.expense),
                    netPercent: percentChange(income - expense, previousRow.income - previousRow.expense),
                    previousIncome: previousRow.income,
                    previousExpense: previousRow.expense,
                }
                : null,
            expenseGroups,
            expenseGroupsTotal,
            expenseGroupsCount,
            averageExpensePerGroup: expenseGroups.length > 0
                ? roundMoney(expenseGroupsTotal / expenseGroups.length)
                : 0,
            topExpenseGroups: expenseGroups.slice(0, 5),
            daily,
            generatedAt: new Date().toISOString(),
        });
    },

    /**
     * Chiqimlarni sabab (izoh) bo'yicha guruhlash — to'liq, DB darajasida.
     * Ilgari klient tarixning birinchi 100 tasini olib guruhlardi va
     * yig'indi kam chiqardi.
     */
    async groups(req, res) {
        const now = new Date();
        const offsetMinutes = getTimezoneOffsetMinutes();
        const currentKey = currentMonthKey(now, offsetMinutes);

        const range = resolvePeriod(req.query, now)
            || monthKeyRange(currentKey, offsetMinutes);

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

        const match = { type: 'CHIQIM' };
        const rangeFilter = {};
        if (range.start) rangeFilter.$gte = range.start;
        if (range.endExclusive) rangeFilter.$lt = range.endExclusive;
        if (Object.keys(rangeFilter).length > 0) match.createdAt = rangeFilter;

        const search = normalizeReason(req.query.search ?? req.query.q);
        if (search) match.reason = { $regex: escapeRegExp(search), $options: 'i' };

        const [groupRows, summaryRow, balance] = await Promise.all([
            aggregateExpenseGroups(match),
            aggregateSummary(match),
            getCachedKassaBalance(),
        ]);

        const total = roundMoney(groupRows.reduce((sum, g) => sum + g.total, 0));
        const count = groupRows.reduce((sum, g) => sum + g.count, 0);
        const groups = groupRows.slice(0, limit);

        return sendSuccess(res, 200, 'Chiqimlar guruhlari.', {
            month: range.monthKey || null,
            monthLabel: range.label || range.monthKey || null,
            currentMonth: currentKey,
            timezoneOffsetMinutes: offsetMinutes,
            range: describeRange(range),
            total,
            count,
            groupCount: groupRows.length,
            averagePerGroup: groupRows.length > 0 ? roundMoney(total / groupRows.length) : 0,
            largestGroup: groupRows[0] || null,
            truncated: groupRows.length > groups.length,
            groups,
            income: summaryRow.income,
            net: roundMoney(summaryRow.income - summaryRow.expense),
            generatedAt: new Date().toISOString(),
        });
    },

    async expense(req, res) {
        const { amount, reason } = req.body;
        const value = roundMoney(amount);
        if (!value || value <= 0) throw new ApiError(400, "Chiqim summasi noto'g'ri.");
        const cleanReason = normalizeReason(reason);
        if (!cleanReason) {
            throw new ApiError(400, 'Chiqim sababi (nimaga olingani) kiritilishi shart.');
        }

        const kassa = await getKassaDoc();
        const balance = roundMoney(kassa.balance);
        if (balance < value) {
            throw new ApiError(400, `Kassada yetarli mablag' yo'q. Joriy balans: ${balance}.`);
        }

        const updated = await kassaAddExpense(value, { reason: cleanReason, user: req.user._id });
        clearKassaCache();

        return sendSuccess(res, 200, 'Chiqim muvaffaqiyatli yozildi.', {
            balance: updated.balance,
            expense: { amount: value, reason: cleanReason },
        });
    },

    async deleteHistory(req, res) {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Noto'g'ri ID.");
        }

        const transaction = await KassaTransaction.findById(id);

        if (!transaction) {
            throw new ApiError(404, 'Kassa tarixi topilmadi.');
        }

        const kassa = await getKassaDoc();
        const amount = roundMoney(transaction.amount);

        if (transaction.type === 'KIRIM') {
            if (roundMoney(kassa.balance) < amount) {
                throw new ApiError(
                    400,
                    "Bu kirimni o'chirib bo'lmaydi. Kassada yetarli mablag' yo'q."
                );
            }

            kassa.balance = roundMoney(kassa.balance - amount);
        } else if (transaction.type === 'CHIQIM') {
            kassa.balance = roundMoney(kassa.balance + amount);
        }

        await kassa.save();
        await transaction.deleteOne();
        clearKassaCache();

        return sendSuccess(res, 200, "Kassa tarixi o'chirildi.", {
            balance: kassa.balance,
        });
    },

    async income(req, res) {
        const { amount, source, note } = req.body;
        const value = roundMoney(amount);

        if (!value || value <= 0) {
            throw new ApiError(400, "Kirim summasi musbat son bo'lishi shart.");
        }
        const cleanSource = normalizeReason(source ?? note);
        if (!cleanSource) {
            throw new ApiError(400, 'Kirim manbasi (kimdan yoki nima uchun) kiritilishi shart.');
        }

        const updated = await kassaAddIncome(value, {
            note: cleanSource,
            user: req.user._id,
        });
        clearKassaCache();

        return sendSuccess(res, 200, 'Kirim muvaffaqiyatli yozildi.', {
            balance: updated.balance,
            income: { amount: value, source: cleanSource },
        });
    },

    async updateHistoryNote(req, res) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (reason === undefined || reason === null) {
            throw new ApiError(400, 'Izoh (reason) maydoni kiritilishi shart.');
        }

        const transaction = await KassaTransaction.findById(id);
        if (!transaction) throw new ApiError(404, "Kassa tarixida bunday yozuv topilmadi.");

        const cleanReason = normalizeReason(reason);
        if (!cleanReason) throw new ApiError(400, "Izoh bo'sh bo'lishi mumkin emas.");

        transaction.reason = cleanReason;
        await transaction.save();

        return sendSuccess(res, 200, 'Izoh muvaffaqiyatli yangilandi.', {
            transaction: mapTransaction(transaction.toObject()),
        });
    },

    /** Chiqim sabablari (taklif ro'yxati) — katta-kichik harf va bo'shliqlar birlashtirilgan. */
    async expenseSuggestions(req, res) {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
        // Guruhlash kaliti bo'yicha ko'proq yozuv olamiz, keyin JS da birlashtirib kesamiz —
        // shunda "Ofis  uchun" va "ofis uchun" kabi yozuvlar bitta bo'lib chiqadi.
        const rows = await KassaTransaction.aggregate(
            buildExpenseSuggestionsPipeline(Math.min(limit * 3, 90))
        );

        const merged = mergeExpenseGroups(
            rows.map((row) => ({
                key: row.key,
                total: row.total,
                count: row.count,
                lastAt: row.last,
                labels: (row.labels || []).map((item) => ({ label: item.label, count: 1, lastAt: item.lastAt })),
            }))
        );

        const suggestions = merged
            .sort((a, b) => {
                const aTime = a.lastAt ? new Date(a.lastAt).getTime() : 0;
                const bTime = b.lastAt ? new Date(b.lastAt).getTime() : 0;
                return (bTime - aTime) || (b.total - a.total);
            })
            .slice(0, limit)
            .map((group) => ({
                reason: group.label,
                label: group.label,
                key: group.key,
                total: group.total,
                count: group.count,
                lastAt: group.lastAt,
            }));

        return sendSuccess(res, 200, 'Chiqim sabablari.', { suggestions });
    },
};

export default kassaController;
