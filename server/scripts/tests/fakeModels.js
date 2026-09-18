/**
 * `src/models/index.js` o'rniga ishlatiladigan test modeli.
 *
 * `scripts/tests/loader.mjs` orqali ulanadi:
 *   node --import ./scripts/tests/registerFakeModels.mjs scripts/kassa-api-test.mjs
 *
 * Faqat kassa bilan bog'liq qism to'liq taqlid qilinadi; qolgan modellar —
 * import xatolik bermasligi uchun bo'sh stublar.
 */
import { createFakeModel, runPipeline, matches } from './fakeMongo.js';

export const transactions = [];
export const products = [];
export const clients = [];
export const orders = [];
export const users = [];

let idCounter = 0;
export function nextId() {
    idCounter += 1;
    return `000000000000000000000${String(idCounter).padStart(3, '0')}`.slice(-24);
}

export const kassaDoc = {
    _id: '000000000000000000000001',
    balance: 0,
    async save() { return this; },
};

export const KassaTransaction = createFakeModel(transactions);
KassaTransaction.findById = async (id) => {
    const doc = transactions.find((item) => String(item._id) === String(id)) || null;
    if (!doc) return null;
    return {
        ...doc,
        async save() { return this; },
        async deleteOne() {
            const index = transactions.findIndex((item) => String(item._id) === String(id));
            if (index >= 0) transactions.splice(index, 1);
            return { deletedCount: 1 };
        },
        toObject() { return { ...doc }; },
    };
};

export const Kassa = createFakeModel([]);
export const Product = createFakeModel(products);
export const Client = createFakeModel(clients);
export const Order = createFakeModel(orders);
export const User = createFakeModel(users);

export async function getKassaDoc() {
    return kassaDoc;
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalize(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export async function kassaAddIncome(amount, { client = null, clientName = null, note = '', user = null } = {}) {
    const value = round2(amount);
    kassaDoc.balance = round2(kassaDoc.balance + value);
    transactions.push({
        _id: nextId(),
        type: 'KIRIM',
        amount: value,
        reason: normalize(note),
        client,
        clientName,
        user,
        balanceAfter: kassaDoc.balance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return kassaDoc;
}

export async function kassaAddExpense(amount, { reason = '', user = null } = {}) {
    const value = round2(amount);
    kassaDoc.balance = round2(kassaDoc.balance - value);
    transactions.push({
        _id: nextId(),
        type: 'CHIQIM',
        amount: value,
        reason: normalize(reason),
        client: null,
        clientName: null,
        user,
        balanceAfter: kassaDoc.balance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return kassaDoc;
}

/** Test yordamchilari */
export function seedTransaction(doc) {
    const record = {
        _id: doc._id || nextId(),
        type: doc.type || 'CHIQIM',
        amount: Number(doc.amount) || 0,
        reason: doc.reason ?? '',
        client: doc.client || null,
        clientName: doc.clientName || null,
        user: doc.user || null,
        balanceAfter: Number(doc.balanceAfter) || 0,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
        updatedAt: new Date(),
    };
    transactions.push(record);
    return record;
}

export function resetAll() {
    transactions.length = 0;
    products.length = 0;
    clients.length = 0;
    orders.length = 0;
    users.length = 0;
    kassaDoc.balance = 0;
    idCounter = 0;
}

export { runPipeline, matches };
