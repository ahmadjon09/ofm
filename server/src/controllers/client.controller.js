import { ApiError, sendSuccess, isValidObjectId, isValidPhone, requireFields, parsePagination, buildMeta } from '../lib/helpers.js';
import { Client, kassaAddIncome } from '../models/index.js';
import { clearDashboardCache, clearKassaCache } from '../lib/cache.js';
const clientController = {
    async create(req, res) {
        const { name, phone, debt } = req.body;
        const missing = requireFields(req.body, ['name', 'phone']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");

        const client = await Client.create({ name, phone, debt });

        clearDashboardCache();
        return sendSuccess(res, 201, "Mijoz muvaffaqiyatli yaratildi.", { client });
    },

    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search } = req.query;

        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const [clients, total] = await Promise.all([
            Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
            Client.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Mijozlar ro'yxati.", { clients }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id).populate('orders', 'orderTotal status createdAt');
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        return sendSuccess(res, 200, "Mijoz topildi.", { client });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, phone, debt } = req.body;
        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        if (name) client.name = name;
        if (phone) {
            if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
            client.phone = phone;
        }
        if (debt) client.debt = debt;

        await client.save();

        clearDashboardCache();
        return sendSuccess(res, 200, "Mijoz muvaffaqiyatli yangilandi.", { client });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        await Client.findByIdAndDelete(id);

        clearDashboardCache();
        return sendSuccess(res, 200, "Mijoz butunlay o'chirildi.");
    },

    async addPayment(req, res) {
        const { id } = req.params;
        const { amount, note } = req.body;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (!amount || amount <= 0) throw new ApiError(400, "To'lov summasi noto'g'ri.");

        const client = await Client.findById(id);
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        await client.addPayment(amount, note || '', req.user._id);
        const kassa = await kassaAddIncome(amount, {
            client: client._id,
            clientName: client.name,
            note: `${client.name}\n${note}` || `${client.name} tomonidan qarz to'lovi`,
            user: req.user._id,
        });
        clearDashboardCache();
        clearKassaCache();
        return sendSuccess(res, 200, "Qarz muvaffaqiyatli to'landi.", { client, kassaBalance: kassa.balance });
    },

    async paymentHistory(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const client = await Client.findById(id).select('name paymentHistory').populate('paymentHistory.user', 'name');
        if (!client) throw new ApiError(404, "Mijoz topilmadi.");

        return sendSuccess(res, 200, "To'lovlar tarixi.", { paymentHistory: client.paymentHistory });
    },
};


export default clientController;
