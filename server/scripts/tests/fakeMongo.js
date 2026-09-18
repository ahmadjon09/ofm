/**
 * Test uchun "mini Mongo" — faqat shu repodagi kassa aggregation pipeline'larini
 * bajarish uchun yetarli bo'lgan kichik to'plam.
 *
 * NEGA KERAK: bu muhitda MongoDB binari mavjud emas (fastdl.mongodb.org yopiq),
 * shuning uchun `scripts/smoke-test.mjs` ishlamaydi. Bu modul orqali esa
 * kassa controller'ini (haqiqiy kodni) to'liq ma'lumot bilan tekshirish mumkin:
 * sahifalash, oy chegaralari, guruhlash va yaxlitlash.
 *
 * Qo'llab-quvvatlanadigan operatorlar ataylab cheklangan: qo'llab-quvvatlanmagan
 * operator uchrasa — xatolik tashlanadi (jimgina noto'g'ri natija bermasin).
 */

function fail(op) {
    throw new Error(`fakeMongo: qo'llab-quvvatlanmaydigan operator/amal: ${JSON.stringify(op)}`);
}

const isPlainObject = (value) => value !== null && typeof value === 'object'
    && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);

function getPath(doc, path) {
    if (path === undefined || path === null) return undefined;
    return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), doc);
}

function setPath(doc, path, value) {
    const keys = String(path).split('.');
    let cursor = doc;
    keys.slice(0, -1).forEach((key) => {
        if (!isPlainObject(cursor[key])) cursor[key] = {};
        cursor = cursor[key];
    });
    cursor[keys[keys.length - 1]] = value;
}

function toComparable(value) {
    if (value instanceof Date) return value.getTime();
    return value;
}

function matchesCondition(value, cond) {
    if (isPlainObject(cond)) {
        const operators = Object.keys(cond);
        if (operators.length > 0 && operators.every((op) => op.startsWith('$'))) {
            return operators.every((op) => {
                const expected = cond[op];
                const actual = toComparable(value);
                switch (op) {
                    case '$gte': return actual !== undefined && actual !== null && actual >= toComparable(expected);
                    case '$gt': return actual !== undefined && actual !== null && actual > toComparable(expected);
                    case '$lte': return actual !== undefined && actual !== null && actual <= toComparable(expected);
                    case '$lt': return actual !== undefined && actual !== null && actual < toComparable(expected);
                    case '$ne': return value !== expected;
                    case '$in': return expected.some((item) => item === value);
                    case '$nin': return !expected.some((item) => item === value);
                    case '$exists': return expected ? value !== undefined : value === undefined;
                    case '$regex': return new RegExp(expected, cond.$options || '').test(String(value ?? ''));
                    case '$options': return true; // $regex bilan birga ishlatiladi
                    default: return fail({ $match: op });
                }
            });
        }
    }
    return value === cond;
}

function matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, cond]) => matchesCondition(getPath(doc, key), cond));
}

/** Aggregation ifodalarini bajaradi ($ifNull, $trim, $toLower, $subtract, ...). */
function evalExpr(expr, doc) {
    if (expr instanceof Date) return expr;
    // Maydon yo'li: '$amount', '$_id.key'
    if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1));
    if (Array.isArray(expr)) return expr.map((item) => evalExpr(item, doc));
    if (!isPlainObject(expr)) return expr;

    const keys = Object.keys(expr);
    const operators = keys.filter((key) => key.startsWith('$'));
    if (operators.length === 0) {
        // Maydon yo'li yoki oddiy obyekt
        return keys.reduce((acc, key) => {
            acc[key] = evalExpr(expr[key], doc);
            return acc;
        }, {});
    }

    const op = operators[0];
    const arg = expr[op];
    switch (op) {
        case '$literal': return arg;
        case '$ifNull': return evalExpr(arg[0], doc) ?? evalExpr(arg[1], doc);
        case '$toLower': return String(evalExpr(arg, doc) ?? '').toLowerCase();
        case '$toUpper': return String(evalExpr(arg, doc) ?? '').toUpperCase();
        case '$trim': return String(evalExpr(arg.input, doc) ?? '').trim();
        case '$subtract': {
            const left = evalExpr(arg[0], doc);
            const right = evalExpr(arg[1], doc);
            if (left instanceof Date) return new Date(left.getTime() - Number(right));
            return Number(left) - Number(right);
        }
        case '$multiply': return arg.reduce((acc, item) => acc * Number(evalExpr(item, doc)), 1);
        case '$add': return arg.reduce((acc, item) => acc + Number(evalExpr(item, doc)), 0);
        case '$sum': {
            const values = evalExpr(arg, doc);
            return (Array.isArray(values) ? values : [values]).reduce((acc, v) => acc + (Number(v) || 0), 0);
        }
        case '$max': {
            const values = evalExpr(arg, doc);
            return (Array.isArray(values) ? values : [values]).reduce(
                (acc, v) => (acc === null || toComparable(v) > toComparable(acc) ? v : acc),
                null
            );
        }
        case '$cond': {
            if (Array.isArray(arg)) {
                return evalExpr(arg[0], doc) ? evalExpr(arg[1], doc) : evalExpr(arg[2], doc);
            }
            return evalExpr(arg.if, doc) ? evalExpr(arg.then, doc) : evalExpr(arg.else, doc);
        }
        case '$eq': return toComparable(evalExpr(arg[0], doc)) === toComparable(evalExpr(arg[1], doc));
        case '$ne': return toComparable(evalExpr(arg[0], doc)) !== toComparable(evalExpr(arg[1], doc));
        case '$gte': return toComparable(evalExpr(arg[0], doc)) >= toComparable(evalExpr(arg[1], doc));
        case '$gt': return toComparable(evalExpr(arg[0], doc)) > toComparable(evalExpr(arg[1], doc));
        case '$lt': return toComparable(evalExpr(arg[0], doc)) < toComparable(evalExpr(arg[1], doc));
        case '$dateToString': {
            const date = evalExpr(arg.date, doc);
            const value = date instanceof Date ? date : new Date(date);
            const pad = (n) => String(n).padStart(2, '0');
            if (arg.format === '%Y-%m-%d') {
                return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
            }
            if (arg.format === '%Y-%m') {
                return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`;
            }
            return fail({ $dateToString: arg.format });
        }
        case '$year': return (evalExpr(arg, doc) instanceof Date ? evalExpr(arg, doc) : new Date(evalExpr(arg, doc))).getUTCFullYear();
        case '$month': return (evalExpr(arg, doc) instanceof Date ? evalExpr(arg, doc) : new Date(evalExpr(arg, doc))).getUTCMonth() + 1;
        case '$dayOfMonth': return (evalExpr(arg, doc) instanceof Date ? evalExpr(arg, doc) : new Date(evalExpr(arg, doc))).getUTCDate();
        default:
            return fail({ expression: op });
    }
}

/** Guruh kalitini barqaror satrga aylantiradi. */
function groupKey(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') {
        const sorted = Object.keys(value).sort().reduce((acc, key) => {
            acc[key] = value[key];
            return acc;
        }, {});
        return JSON.stringify(sorted);
    }
    return JSON.stringify(value);
}

function runPipeline(documents, stages = []) {
    let docs = documents;

    stages.forEach((stage) => {
        const [op] = Object.keys(stage);
        const arg = stage[op];

        switch (op) {
            case '$match':
                docs = docs.filter((doc) => matches(doc, arg));
                break;

            case '$addFields':
                docs = docs.map((doc) => {
                    const next = { ...doc };
                    Object.entries(arg).forEach(([field, expr]) => setPath(next, field, evalExpr(expr, doc)));
                    return next;
                });
                break;

            case '$group': {
                const buckets = new Map();
                docs.forEach((doc) => {
                    const idValue = evalExpr(arg._id, doc);
                    const key = groupKey(idValue);
                    if (!buckets.has(key)) {
                        buckets.set(key, { id: idValue, buffer: {} });
                    }
                    const bucket = buckets.get(key);
                    Object.entries(arg).forEach(([field, accumulator]) => {
                        if (field === '_id') return;
                        const [accOp] = Object.keys(accumulator);
                        const accArg = accumulator[accOp];
                        if (!bucket.buffer[field]) bucket.buffer[field] = { $sum: 0, $max: null, $push: [] };
                        const store = bucket.buffer[field];
                        switch (accOp) {
                            case '$sum': store.$sum += Number(evalExpr(accArg, doc)) || 0; break;
                            case '$max': {
                                const value = evalExpr(accArg, doc);
                                store.$max = store.$max === null || toComparable(value) > toComparable(store.$max) ? value : store.$max;
                                break;
                            }
                            case '$push': store.$push.push(evalExpr(accArg, doc)); break;
                            default: fail({ $group: accOp });
                        }
                    });
                });
                docs = [...buckets.values()].map((bucket) => {
                    const out = { _id: bucket.id };
                    Object.entries(bucket.buffer).forEach(([field, store]) => {
                        if (arg[field].$sum !== undefined) out[field] = store.$sum;
                        else if (arg[field].$max !== undefined) out[field] = store.$max;
                        else if (arg[field].$push !== undefined) out[field] = store.$push;
                    });
                    return out;
                });
                break;
            }

            case '$project': {
                const inclusions = Object.entries(arg).filter(([, value]) => value === 1 || value === true);
                const exclusions = Object.entries(arg).filter(([, value]) => value === 0 || value === false);
                // Boshqa qiymatlar — hisoblanadigan maydonlar (masalan key: '$_id')
                const computed = Object.entries(arg).filter(
                    ([, value]) => value !== 1 && value !== true && value !== 0 && value !== false
                );
                docs = docs.map((doc) => {
                    if (inclusions.length > 0 || computed.length > 0) {
                        const out = {};
                        inclusions.forEach(([field]) => setPath(out, field, getPath(doc, field)));
                        computed.forEach(([field, expr]) => setPath(out, field, evalExpr(expr, doc)));
                        if (arg._id !== 0 && !inclusions.some(([field]) => field === '_id')) out._id = doc._id;
                        return out;
                    }
                    const out = { ...doc };
                    exclusions.forEach(([field]) => {
                        const keys = String(field).split('.');
                        delete out[keys[0]];
                    });
                    return out;
                });
                break;
            }

            case '$sort': {
                const criteria = Object.entries(arg);
                docs = [...docs].sort((a, b) => {
                    for (const [field, direction] of criteria) {
                        const left = toComparable(getPath(a, field));
                        const right = toComparable(getPath(b, field));
                        if (left === right) continue;
                        if (left === undefined || left === null) return 1;
                        if (right === undefined || right === null) return -1;
                        return (left > right ? 1 : -1) * direction;
                    }
                    return 0;
                });
                break;
            }

            case '$limit':
                docs = docs.slice(0, arg);
                break;

            case '$skip':
                docs = docs.slice(arg);
                break;

            default:
                fail({ stage: op });
        }
    });

    return docs;
}

class FakeQuery {
    constructor(source, filter, { single = false } = {}) {
        this.source = source;
        this.filter = filter || {};
        this.single = single;
        this.sortSpec = null;
        this.skipCount = 0;
        this.limitCount = null;
        this.selected = null;
    }

    sort(spec) { this.sortSpec = spec; return this; }
    skip(count) { this.skipCount = count; return this; }
    limit(count) { this.limitCount = count; return this; }
    select() { return this; }
    populate() { return this; }
    lean() { return this.resolve(); }

    resolve() {
        let docs = this.source.filter((doc) => matches(doc, this.filter));
        if (this.sortSpec) docs = runPipeline(docs, [{ $sort: this.sortSpec }]);
        if (this.skipCount) docs = docs.slice(this.skipCount);
        if (this.limitCount !== null) docs = docs.slice(0, this.limitCount);
        const copy = docs.map((doc) => ({ ...doc }));
        // findOne — bitta hujjat (yoki null) qaytaradi, massiv emas.
        return Promise.resolve(this.single ? (copy[0] ?? null) : copy);
    }

    then(resolve, reject) { return this.resolve().then(resolve, reject); }
}

/**
 * Mongoose model o'rnini bosuvchi yengil model.
 */
export function createFakeModel(collection) {
    const Model = {
        __collection: collection,
        find(filter = {}) { return new FakeQuery(collection, filter); },
        findOne(filter = {}) { return new FakeQuery(collection, filter, { single: true }).limit(1); },
        countDocuments(filter = {}) {
            return Promise.resolve(collection.filter((doc) => matches(doc, filter)).length);
        },
        aggregate(pipeline = []) { return Promise.resolve(runPipeline(collection.map((d) => ({ ...d })), pipeline)); },
        findById(id) {
            return new FakeQuery(collection, { _id: id }, { single: true }).limit(1);
        },
        async create(doc) { collection.push({ ...doc }); return doc; },
    };
    return Model;
}

export { runPipeline, matches, evalExpr, getPath, setPath };
