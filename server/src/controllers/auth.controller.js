import bcrypt from 'bcrypt';
import { ApiError, sendSuccess, isValidPhone, requireFields } from '../lib/helpers.js';
import { User } from '../models/index.js';
import { signAccessToken, signRefreshToken } from '../middleware/auth.js';
const authController = {
    async register(req, res) {
        const { name, phone, password, role } = req.body;

        const missing = requireFields(req.body, ['name', 'phone', 'password']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
        if (password.length < 6) throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak.");

        const existing = await User.findOne({ phone });
        if (existing) throw new ApiError(409, "Bu telefon raqami allaqachon ro'yxatdan o'tgan.");

        const user = await User.create({ name, phone, password, role: role || 'worker' });
        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        return sendSuccess(res, 201, "Muvaffaqiyatli ro'yxatdan o'tdingiz.", {
            user: user.toSafeObject(),
            accessToken,
            refreshToken,
        });
    },

    async login(req, res) {
        const { phone, password } = req.body;
        const missing = requireFields(req.body, ['phone', 'password']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);

        const user = await User.findOne({ phone }).select('+password name phone role isActive');
        if (!user) throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri.");
        if (!user.isActive) throw new ApiError(403, "Foydalanuvchi bloklangan.");

        const isMatch = await user.comparePassword(password);
        if (!isMatch) throw new ApiError(401, "Telefon raqam yoki parol noto'g'ri.");

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);

        return sendSuccess(res, 200, "Muvaffaqiyatli tizimga kirdingiz.", {
            user: user.toSafeObject(),
            accessToken,
            refreshToken,
        });
    },

    async me(req, res) {
        const user = await User.findById(req.user._id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");
        return sendSuccess(res, 200, "Foydalanuvchi ma'lumotlari.", { user: user.toSafeObject() });
    },

    async updateProfile(req, res) {
        const { name, phone, currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi.");

        if (name !== undefined && String(name).trim() !== '') {
            user.name = String(name).trim();
        }

        if (phone !== undefined && String(phone).trim() !== '') {
            if (!isValidPhone(phone)) throw new ApiError(400, "Telefon raqami noto'g'ri formatda.");
            user.phone = String(phone).trim();
        }

        if (newPassword !== undefined && String(newPassword) !== '') {
            if (String(newPassword).length < 6) {
                throw new ApiError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak.");
            }
            if (!currentPassword) {
                throw new ApiError(400, "Parolni yangilash uchun joriy parol kiritilishi shart.");
            }
            const match = await user.comparePassword(currentPassword);
            if (!match) throw new ApiError(400, "Joriy parol noto'g'ri.");
            user.password = String(newPassword);
        }

        await user.save();

        return sendSuccess(res, 200, "Profil muvaffaqiyatli yangilandi.", {
            user: user.toSafeObject(),
        });
    },
};


export default authController;
