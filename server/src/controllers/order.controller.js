import mongoose from 'mongoose';
import { ApiError, sendSuccess, isValidObjectId, requireFields, parsePagination, buildMeta } from '../lib/helpers.js';
import { Client, Order, Product, kassaAddIncome, kassaAddExpense } from '../models/index.js';
import { clearDashboardCache, clearKassaCache } from '../lib/cache.js';

// Buyurtma ichidagi mahsulotlarni omborga qaytarish
async function restoreOrderStock(order, session) {
    for (const item of order.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) continue; // Mahsulot o'chirilgan bo'lsa, o'tkazib yuboramiz

        const sizeEntry = product.sizes.find((s) => s.size === Number(item.size));
        if (sizeEntry) {
            sizeEntry.boxes += item.quantityBoxes;
        } else {
            // Razmer o'chirilgan bo'lsa, uni qayta tiklaymiz
            product.sizes.push({
                size: item.size,
                price: item.pricePerKg,
                boxes: item.quantityBoxes,
                box_kg: item.boxKg,
            });
        }
        await product.save({ session });
    }
}

// Buyurtma ichidagi mahsulotlarni ombordan qayta ayirish (bekor qilish qaytarilganda)
async function deductOrderStock(order, session) {
    for (const item of order.items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) {
            throw new ApiError(400, `Mahsulot topilmadi: ${item.productName}. Buyurtmani qayta faollashtirib bo'lmaydi.`);
        }

        const sizeEntry = product.sizes.find((s) => s.size === Number(item.size));
        if (!sizeEntry || sizeEntry.boxes < item.quantityBoxes) {
            throw new ApiError(
                400,
                `Stok yetarli emas: ${item.productName} (${item.size}). Mavjud qutilar: ${sizeEntry ? sizeEntry.boxes : 0}.`
            );
        }

        sizeEntry.boxes -= item.quantityBoxes;
        await product.save({ session });
    }
}

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
                            debtAdded: addToDebt !== false,
                            cashAdded: addToDebt === false,
                        },
                    ],
                    { session }
                );

                if (addToDebt !== false) {
                    client.debt = (client.debt || 0) + order.orderTotal;
                }
                client.orders.push(order._id);
                await client.save({ session });

                // Qarzga yozilmagan buyurtma darhol kassaga kirim qilinadi.
                if (addToDebt === false) {
                    await kassaAddIncome(order.orderTotal, {
                        client: client._id,
                        clientName: client.name,
                        note: `Buyurtma uchun to'lov: ${client.name}`,
                        user: req.user._id,
                        session,
                    });
                }

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

        const session = await mongoose.startSession();
        let updatedOrder;

        try {
            await session.withTransaction(async () => {
                const order = await Order.findById(id).session(session);
                if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

                const wasCancelled = order.status === 'cancelled';
                const willBeCancelled = status === 'cancelled';

                // Bekor qilinmoqda: mahsulotlar omborga qaytadi, qarz kamayadi
                if (willBeCancelled && !wasCancelled && !order.stockRestored) {
                    await restoreOrderStock(order, session);
                    order.stockRestored = true;

                    if (order.debtAdded !== false) {
                        const client = await Client.findById(order.client).session(session);
                        if (client) {
                            client.debt = (client.debt || 0) - order.orderTotal;
                            await client.save({ session });
                        }
                    }

                    // Qarzga yozilmagan buyurtmaning kassaga kirgan puli qaytariladi.
                    if (order.debtAdded === false && order.cashAdded && !order.cashReversed) {
                        await kassaAddExpense(order.orderTotal, {
                            reason: `Buyurtma bekor qilindi: ${order._id}`,
                            client: order.client,
                            user: req.user._id,
                            session,
                        });
                        order.cashReversed = true;
                    }
                }

                // Bekor qilish qaytarilmoqda: mahsulotlar qayta ombordan ayiriladi, qarz qaytadi
                if (wasCancelled && !willBeCancelled && order.stockRestored) {
                    await deductOrderStock(order, session);
                    order.stockRestored = false;

                    if (order.debtAdded !== false) {
                        const client = await Client.findById(order.client).session(session);
                        if (client) {
                            client.debt = (client.debt || 0) + order.orderTotal;
                            await client.save({ session });
                        }
                    }

                    if (order.debtAdded === false && order.cashAdded && order.cashReversed) {
                        await kassaAddIncome(order.orderTotal, {
                            client: order.client,
                            note: `Buyurtma qayta faollashtirildi: ${order._id}`,
                            user: req.user._id,
                            session,
                        });
                        order.cashReversed = false;
                    }
                }

                order.status = status;
                await order.save({ session });
                updatedOrder = order;
            });
        } finally {
            session.endSession();
        }

        clearDashboardCache();
        clearKassaCache();
        const msg = status === 'cancelled'
            ? "Buyurtma bekor qilindi. Mahsulotlar omborga qaytarildi."
            : "Buyurtma holati yangilandi.";
        return sendSuccess(res, 200, msg, { order: updatedOrder });
    },

    async remove(req, res) {
        const { id } = req.params;
        if (!isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri ID format.");

        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                const order = await Order.findById(id).session(session);
                if (!order) throw new ApiError(404, "Buyurtma topilmadi.");

                // Agar buyurtma bekor qilinmagan bo'lsa (stok hali qaytarilmagan) — omborga qaytaramiz
                if (!order.stockRestored && order.status !== 'cancelled') {
                    await restoreOrderStock(order, session);

                    if (order.debtAdded !== false) {
                        const client = await Client.findById(order.client).session(session);
                        if (client) {
                            client.debt = (client.debt || 0) - order.orderTotal;
                            client.orders = (client.orders || []).filter((o) => String(o) !== String(order._id));
                            await client.save({ session });
                        }
                    }
                } else {
                    const client = await Client.findById(order.client).session(session);
                    if (client) {
                        client.orders = (client.orders || []).filter((o) => String(o) !== String(order._id));
                        await client.save({ session });
                    }
                }

                // Faol, qarzga yozilmagan buyurtma o'chirilsa ham kassadagi kirim bekor qilinadi.
                if (order.debtAdded === false && order.cashAdded && !order.cashReversed) {
                    await kassaAddExpense(order.orderTotal, {
                        reason: `Buyurtma bekor qilindi: ${order._id}`,
                        client: order.client,
                        user: req.user._id,
                        session,
                    });
                }

                await Order.deleteOne({ _id: order._id }).session(session);
            });
        } finally {
            session.endSession();
        }

        clearDashboardCache();
        clearKassaCache();
        return sendSuccess(res, 200, "Buyurtma butunlay o'chirildi. Mahsulotlar omborga qaytarildi.");
    },
};


export default orderController;
