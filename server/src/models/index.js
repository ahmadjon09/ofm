import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
const kassaTransactionSchema = new mongoose.Schema(
    {
        type: { type: String, required: true, enum: ['KIRIM', 'CHIQIM'] },
        amount: { type: Number, required: true, min: 0.01 },
        reason: { type: String, default: '', trim: true },
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
        clientName: { type: String, default: null },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        balanceAfter: { type: Number, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: true } }
);

kassaTransactionSchema.index({ createdAt: -1 });
kassaTransactionSchema.index({ type: 1 });
kassaTransactionSchema.index({ client: 1 });
kassaTransactionSchema.index({ createdAt: -1, type: 1 });
kassaTransactionSchema.index({ reason: 1 });

const KassaTransaction = mongoose.model('KassaTransaction', kassaTransactionSchema);

const kassaSchema = new mongoose.Schema(
    {
        balance: { type: Number, default: 0 },
    },
    { timestamps: true, versionKey: 'version' }
);

const Kassa = mongoose.model('Kassa', kassaSchema);

async function getKassaDoc() {
    let kassa = await Kassa.findOne();
    if (!kassa) {
        kassa = await Kassa.create({ balance: 0 });
    }
    return kassa;
}

async function kassaAddIncome(amount, { client = null, clientName = null, note = '', user = null } = {}) {
    const kassa = await getKassaDoc();
    kassa.balance = (kassa.balance || 0) + amount;
    await kassa.save();
    await KassaTransaction.create({ type: 'KIRIM', amount, reason: note, client, clientName, user, balanceAfter: kassa.balance });
    return kassa;
}

async function kassaAddExpense(amount, { reason = '', user = null } = {}) {
    const kassa = await getKassaDoc();
    kassa.balance = (kassa.balance || 0) - amount;
    await kassa.save();
    await KassaTransaction.create({ type: 'CHIQIM', amount, reason, user, balanceAfter: kassa.balance });
    return kassa;
}


const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, unique: true, trim: true },
        password: { type: String, required: true, minlength: 6, select: false },
        role: { type: String, enum: ['admin', 'manager', 'worker'], default: 'worker' },
        isActive: { type: Boolean, default: true },
        telegramLinkedAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: 'version' }
);

userSchema.pre('save', async function hashPassword(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

const User = mongoose.model('User', userSchema);
userSchema.index({ name: 1, phone: 1 });

const productSizeSchema = new mongoose.Schema(
    {
        size: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        boxes: { type: Number, required: true, min: 0, default: 0 },
        box_kg: { type: Number, required: true, min: 0 },
        total: { type: Number, default: 0 },
    },
    { _id: true }
);

productSizeSchema.pre('validate', function calcSizeTotal(next) {
    this.total = (this.boxes || 0) * (this.box_kg || 0);
    next();
});

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        sizes: {
            type: [productSizeSchema],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length > 0,
                message: "Kamida bitta Razmer (size) kiritilishi shart.",
            },
        },
    },
    { timestamps: true, versionKey: 'version', toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ name: 1, category: 1 });

productSchema.pre('save', function calcAllTotals(next) {
    this.sizes.forEach((s) => {
        s.total = (s.boxes || 0) * (s.box_kg || 0);
    });
    next();
});

productSchema.virtual('total').get(function getTotalKg() {
    return (this.sizes || []).reduce((sum, s) => sum + (s.total || 0), 0);
});

productSchema.virtual('totalPrice').get(function getTotalPrice() {
    return (this.sizes || []).reduce((sum, s) => sum + (s.total || 0) * (s.price || 0), 0);
});

const Product = mongoose.model('Product', productSchema);

const paymentHistorySchema = new mongoose.Schema(
    {
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        note: { type: String, default: '' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { _id: true }
);

const clientSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        debt: { type: Number, default: 0 },
        orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
        paymentHistory: [paymentHistorySchema],
    },
    { timestamps: true, versionKey: 'version', toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

clientSchema.index({ phone: 1 });
clientSchema.index({ name: 1 });
clientSchema.index({ name: 1, phone: 1 });
clientSchema.index({ debt: -1 });

clientSchema.virtual('totalOrders').get(function getTotalOrders() {
    return (this.orders || []).length;
});

clientSchema.virtual('totalPaid').get(function getTotalPaid() {
    return (this.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
});

clientSchema.virtual('remainingDebt').get(function getRemainingDebt() {
    return Math.max(this.debt || 0, 0);
});

clientSchema.methods.addPayment = async function addPayment(amount, note, userId) {
    this.paymentHistory.push({ amount, note, user: userId, date: new Date() });
    this.debt = (this.debt || 0) - amount;
    await this.save();
    return this;
};

const Client = mongoose.model('Client', clientSchema);

const orderItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        productCategory: { type: String },
        size: { type: Number, required: true },
        quantityBoxes: { type: Number, required: true, min: 1 },
        boxKg: { type: Number, required: true, min: 0 },
        quantityKg: { type: Number, required: true, min: 0.01 },
        pricePerKg: { type: Number, required: true, min: 0 },
        subtotal: { type: Number, default: 0 },
    },
    { _id: true }
);

orderItemSchema.pre('validate', function calcSubtotal(next) {
    this.subtotal = (this.quantityKg || 0) * (this.pricePerKg || 0);
    next();
});

const orderSchema = new mongoose.Schema(
    {
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
        items: {
            type: [orderItemSchema],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length > 0,
                message: "Buyurtmada kamida bitta mahsulot bo'lishi shart.",
            },
        },
        orderTotal: { type: Number, default: 0 },
        totalKg: { type: Number, default: 0 },
        totalBoxes: { type: Number, default: 0 },
        status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' },
        debtAdded: { type: Boolean, default: true },
        stockRestored: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true, versionKey: 'version' }
);

orderSchema.index({ client: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ 'items.productName': 1 });

orderSchema.pre('save', function calcOrderTotal(next) {
    this.items.forEach((item) => {
        item.subtotal = (item.quantityKg || 0) * (item.pricePerKg || 0);
    });
    this.orderTotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
    this.totalKg = this.items.reduce((sum, item) => sum + (item.quantityKg || 0), 0);
    this.totalBoxes = this.items.reduce((sum, item) => sum + (item.quantityBoxes || 0), 0);
    next();
});

const Order = mongoose.model('Order', orderSchema);

export { User, Product, Client, Order, Kassa, KassaTransaction, getKassaDoc, kassaAddIncome, kassaAddExpense };
