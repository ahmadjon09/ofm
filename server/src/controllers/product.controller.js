import { ApiError, sendSuccess, isValidObjectId, requireFields, parsePagination, buildMeta } from '../lib/helpers.js';
import { Product } from '../models/index.js';
import { clearDashboardCache } from '../lib/cache.js';
const productController = {
    async create(req, res) {
        const { name, category, sizes } = req.body;
        const missing = requireFields(req.body, ['name', 'category', 'sizes']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!Array.isArray(sizes) || sizes.length === 0) {
            throw new ApiError(400, "Kamida bitta Razmer (size) kiritilishi shart.");
        }

        const product = await Product.create({ name, category, sizes });

        clearDashboardCache();
        return sendSuccess(res, 201, "Mahsulot muvaffaqiyatli yaratildi.", { product });
    },

    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, category, sort } = req.query;

        const filter = {};
        if (category) filter.category = category;
        if (search) filter.name = { $regex: search, $options: 'i' };

        const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { name: 1 } };
        const sortOption = sortMap[sort] || sortMap.newest;

        const [products, total] = await Promise.all([
            Product.find(filter).select('name category sizes createdAt').sort(sortOption).skip(skip).limit(limit).lean({ virtuals: true }),
            Product.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Mahsulotlar ro'yxati.", { products }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        return sendSuccess(res, 200, "Mahsulot topildi.", { product });
    },

    async update(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const { name, category, sizes } = req.body;
        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        if (name) product.name = name;
        if (category) product.category = category;
        if (Array.isArray(sizes) && sizes.length > 0) product.sizes = sizes;

        await product.save();

        clearDashboardCache();
        return sendSuccess(res, 200, "Mahsulot muvaffaqiyatli yangilandi.", { product });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const product = await Product.findById(id);
        if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

        await Product.findByIdAndDelete(id);

        clearDashboardCache();
        return sendSuccess(res, 200, "Mahsulot butunlay o'chirildi.");
    },
};


export default productController;
