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

const API_VERSION = '2';
const API_VERSION_MSG = 'API v2';

function sendSuccess(res, statusCode, message, data = {}, meta = null) {
    const payload = { success: true, version: API_VERSION, apiMessage: API_VERSION_MSG, message, data };
    if (meta) payload.meta = meta;
    res.setHeader('X-Api-Version', API_VERSION);
    return res.status(statusCode).json(payload);
}

function sendError(res, statusCode, message, error = null) {
    res.setHeader('X-Api-Version', API_VERSION);
    return res.status(statusCode).json({ success: false, version: API_VERSION, apiMessage: API_VERSION_MSG, message, error });
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
    API_VERSION,
    API_VERSION_MSG,
    ApiError,
    sendSuccess,
    sendError,
    isValidObjectId,
    isValidPhone,
    requireFields,
    parsePagination,
    buildMeta,
};
