import mongoose from 'mongoose';
import validator from 'validator';

class ApiError extends Error {
    constructor(statusCode, message, errors = null) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

function sendSuccess(res, statusCode, message, data = {}, meta = null) {
    const payload = { success: true, message, data };
    if (meta) payload.meta = meta;
    return res.status(statusCode).json(payload);
}

function sendError(res, statusCode, message, error = null) {
    return res.status(statusCode).json({ success: false, message, error });
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function isValidPhone(phone) {
    return validator.isMobilePhone(String(phone).replace(/\s/g, ''), 'any') ||
        /^(\+?998)?[0-9]{9}$/.test(String(phone).replace(/\s/g, ''));
}

function requireFields(obj, fields) {
    const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
    return missing;
}

function parsePagination(query) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function buildMeta(total, page, limit) {
    return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
    };
}

export {
    ApiError,
    sendSuccess,
    sendError,
    isValidObjectId,
    isValidPhone,
    requireFields,
    parsePagination,
    buildMeta,
};
