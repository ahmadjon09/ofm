import mongoose from 'mongoose';
import { ApiError, sendSuccess, isValidObjectId, requireFields, parsePagination, buildMeta } from '../lib/helpers.js';
import { Client, Order, Product } from '../models/index.js';
import { clearDashboardCache } from '../lib/cache.js';
const orderController = {
    async create(req, res) {
        const { clientId, items, addToDebt } = req.body;

        const missing = requireFields(req.body, ['clientId', 'items']);
        if (missing.length) throw new ApiError(400, `Majburiy maydonlar to'ldirilmagan: ${missing.join(', ')}`);
        if (!isValidObjectId(clientId)) throw new ApiError(400, "Noto'g'ri mijoz ID.");
        if (!Array.isArray(items) || items.length === 0) {
            throw new ApiError(400, "Buyurtmada kamida bitta mahsulot bo'lishi shart.");
        }

        const session = await mongoose.startSession();
        let createdOrder;

        try {
            await session.withTransaction(async () => {
                const client = await Client.findById(clientId).session(session);
                if (!client) throw new ApiError(404, "Mijoz topilmadi.");

                const orderItems = [];

                for (const reqItem of items) {
                    const { productId, size, quantityBoxes, pricePerKg } = reqItem;
                    if (!isValidObjectId(productId)) throw new ApiError(400, "Noto'g'ri mahsulot ID.");
                    if (!Number.isInteger(quantityBoxes) || quantityBoxes <= 0) {
                        throw new ApiError(400, "Qutilar soni (quantityBoxes) musbat butun son bo'lishi kerak.");
                    }

                    const product = await Product.findById(productId).session(session);
                    if (!product) throw new ApiError(404, "Mahsulot topilmadi.");

                    const sizeEntry = product.sizes.find((s) => s.size === Number(size));
                    if (!sizeEntry) throw new ApiError(404, `Ushbu mahsulotda ${size} Razmer topilmadi.`);

                    if (sizeEntry.boxes < quantityBoxes) {
                        throw new ApiError(400, `Stok yetarli emas: ${product.name} (${size}). Mavjud qutilar: ${sizeEntry.boxes}.`);
                    }

                    const quantityKg = quantityBoxes * sizeEntry.box_kg;

                    let finalPricePerKg = sizeEntry.price;
                    if (pricePerKg !== undefined && pricePerKg !== null && pricePerKg !== '') {
                        finalPricePerKg = Number(pricePerKg);
                        if (Number.isNaN(finalPricePerKg) || finalPricePerKg < 0) {
                            throw new ApiError(400, "Narx (pricePerKg) noto'g'ri.");
                        }
                    }

                    sizeEntry.boxes -= quantityBoxes;
                    await product.save({ session });

                    orderItems.push({
                        product: product._id,
                        productName: product.name,
                        productCategory: product.category,
                        size: sizeEntry.size,
                        quantityBoxes,
                        boxKg: sizeEntry.box_kg,
                        quantityKg,
                        pricePerKg: finalPricePerKg,
                    });
                }

                const [order] = await Order.create(
                    [
                        {
                            client: client._id,
                            items: orderItems,
                            createdBy: req.user._id,
                        },
                    ],
                    { session }
                );

                if (addToDebt !== false) {
                    client.debt = (client.debt || 0) + order.orderTotal;
                }
                client.orders.push(order._id);
                await client.save({ session });

                createdOrder = order;
            });
        } finally {
            session.endSession();
        }

        clearDashboardCache();
        return sendSuccess(res, 201, "Buyurtma yaratildi.", { order: createdOrder });
    },

    async list(req, res) {
        const { page, limit, skip } = parsePagination(req.query);
        const { status, clientId, from, to } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (clientId && isValidObjectId(clientId)) filter.client = clientId;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = new Date(from);
            if (to) filter.createdAt.$lte = new Date(to);
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .select('client items orderTotal totalKg totalBoxes status createdAt')
                .populate('client', 'name phone debt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
        ]);

        return sendSuccess(res, 200, "Buyurtmalar ro'yxati.", { orders }, buildMeta(total, page, limit));
    },

    async getById(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const order = await Order.findById(id)
            .populate('client', 'name phone')
            .populate('createdBy', 'name');
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        return sendSuccess(res, 200, "Buyurtma topildi.", { order });
    },

    async updateStatus(req, res) {
        const { id } = req.params;
        const { status } = req.body;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");
        if (!['pending', 'completed', 'cancelled'].includes(status)) {
            throw new ApiError(400, "Noto'g'ri holat qiymati.");
        }

        const order = await Order.findById(id);
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        order.status = status;
        await order.save();

        clearDashboardCache();
        return sendSuccess(res, 200, "Buyurtma holati yangilandi.", { order });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const order = await Order.findById(id);
        if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

        await Order.findByIdAndDelete(id);

        clearDashboardCache();
        return sendSuccess(res, 200, "Buyurtma butunlay o'chirildi.");
    },
};


export default orderController;
