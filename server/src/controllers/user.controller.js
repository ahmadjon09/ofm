import { ApiError, sendSuccess, isValidObjectId, isValidPhone, requireFields, parsePagination, buildMeta } from '../lib/helpers.js';
import { User } from '../models/index.js';
const userController = {
    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, role } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter).select('name phone role isActive createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Foydalanuvchilar ro'yxati.", { users }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        return sendSuccess(res, 200, "Foydalanuvchi topildi.", { user: user.toSafeObject() });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, phone, role, isActive } = req.body;
        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        if (name) user.name = name;
        if (phone) {
            if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
            user.phone = phone;
        }
        if (role) user.role = role;
        if (typeof isActive === 'boolean') user.isActive = isActive;

        await user.save();

        return sendSuccess(res, 200, "Foydalanuvchi muvaffaqiyatli yangilandi.", { user: user.toSafeObject() });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const user = await User.findById(id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        await User.findByIdAndDelete(id);

        return sendSuccess(res, 200, "Foydalanuvchi butunlay o'chirildi.");
    },
};


export default userController;
