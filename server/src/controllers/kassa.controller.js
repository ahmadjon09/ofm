import { ApiError, sendSuccess, isValidObjectId, parsePagination, buildMeta } from '../lib/helpers.js';
import { Kassa, KassaTransaction, getKassaDoc, kassaAddIncome, kassaAddExpense } from '../models/index.js';
import { kassaStore, getCache, setCache, clearKassaCache } from '../lib/cache.js';

async function getCachedKassaBalance() {
    const cached = getCache(kassaStore);
    if (cached && typeof cached.balance === 'number') return cached.balance;
    const kassa = await getKassaDoc();
    setCache(kassaStore, { balance: kassa.balance }, 5);
    return kassa.balance;
}

const kassaController = {
    async get(req, res) {
        const balance = await getCachedKassaBalance();
        return sendSuccess(res, 200, "Kassa ma'lumotlari.", { balance });
    },

    async history(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, from, to } = req.query;

        const filter = {};
        if (type && ['KIRIM', 'CHIQIM'].includes(type)) filter.type = type;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const [history, total, kassa] = await Promise.all([
            KassaTransaction.find(filter)
                .select('type amount reason client clientName user balanceAfter createdAt')
                .populate('client', 'name phone')
                .populate('user', 'name role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            KassaTransaction.countDocuments(filter),
            getCachedKassaBalance(),
        ]);

        return sendSuccess(
            res,
            200,
            "Kassa tarixi.",
            { history, balance: kassa.balance },
            buildMeta(total, page, limit)
        );
    },

    async expense(req, res) {
        const { amount, reason } = req.body;
        if (!amount || amount <= 0) throw new ApiError(400, "Chiqim summasi noto'g'ri.");
        if (!reason || !String(reason).trim()) {
            throw new ApiError(400, "Chiqim sababi (nimaga olingani) kiritilishi shart.");
        }

        const kassa = await getKassaDoc();
        if (kassa.balance < amount) {
            throw new ApiError(400, `Kassada yetarli mablag' yo'q. Joriy balans: ${kassa.balance}.`);
        }

        const updated = await kassaAddExpense(amount, { reason: String(reason).trim(), user: req.user._id });
        clearKassaCache();

        return sendSuccess(res, 200, "Chiqim muvaffaqiyatli yozildi.", { balance: updated.balance });
    },
    async deleteHistory(req, res) {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            throw new ApiError(400, "Noto'g'ri ID.");
        }

        const transaction = await KassaTransaction.findById(id);

        if (!transaction) {
            throw new ApiError(404, "Kassa tarixi topilmadi.");
        }

        const kassa = await getKassaDoc();

        if (transaction.type === "KIRIM") {
            if (kassa.balance < transaction.amount) {
                throw new ApiError(
                    400,
                    "Bu kirimni o'chirib bo'lmaydi. Kassada yetarli mablag' yo'q."
                );
            }

            kassa.balance -= transaction.amount;
        } else if (transaction.type === "CHIQIM") {
            kassa.balance += transaction.amount;
        }

        await kassa.save();
        await transaction.deleteOne();
        clearKassaCache();

        return sendSuccess(res, 200, "Kassa tarixi o'chirildi.", {
            balance: kassa.balance,
        });
    },

    async income(req, res) {
        const { amount, source } = req.body;

        if (!amount || amount <= 0) {
            throw new ApiError(400, "Kirim summasi musbat son bo'lishi shart.");
        }
        if (!source || !String(source).trim()) {
            throw new ApiError(400, "Kirim manbasi (kimdan yoki nima uchun) kiritilishi shart.");
        }

        const updated = await kassaAddIncome(amount, {
            note: String(source).trim(),
            user: req.user._id,
        });
        clearKassaCache();

        return sendSuccess(res, 200, "Kirim muvaffaqiyatli yozildi.", { balance: updated.balance });
    },

    async updateHistoryNote(req, res) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (reason === undefined || reason === null) {
            throw new ApiError(400, "Izoh (reason) maydoni kiritilishi shart.");
        }

        const transaction = await KassaTransaction.findById(id);
        if (!transaction) throw new ApiError(404, "Kassa tarixida bunday yozuv topilmadi.");

        transaction.reason = String(reason).trim();
        await transaction.save();

        return sendSuccess(res, 200, "Izoh muvaffaqiyatli yangilandi.", { transaction });
    },

    async expenseSuggestions(req, res) {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
        const suggestions = await KassaTransaction.aggregate([
            { $match: { type: 'CHIQIM', reason: { $exists: true, $ne: '', $ne: null } } },
            { $group: { _id: { $trim: { input: { $ifNull: ['$reason', ''] } } }, total: { $sum: '$amount' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
            { $sort: { last: -1 } },
            { $limit: limit },
            { $project: { _id: 0, reason: '$_id', total: 1, count: 1 } },
        ]);

        return sendSuccess(res, 200, "Chiqim sabablari.", { suggestions });
    },
};


export default kassaController;
