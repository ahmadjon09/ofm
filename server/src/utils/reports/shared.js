import { ApiError } from '../../lib/helpers.js';

const REPORT_COLORS = {
    headerBg: '1F4E78',
    tableHeaderBg: '2E75B6',
    stripeBg: 'F2F6FA',
    danger: 'C0392B',
};

const UZ_MONTHS = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const STATUS_LABELS_UZ = {
    pending: 'Kutilmoqda',
    completed: 'Bajarilgan',
    cancelled: 'Bekor qilingan',
};

function resolveMonthYear(query = {}) {
    const now = new Date();
    let m;

    if (query.month !== undefined && query.month !== null && String(query.month).trim() !== '') {
        const raw = String(query.month).trim().toLowerCase();
        if (/^\d+$/.test(raw)) {
            m = parseInt(raw, 10);
        } else {
            const idx = UZ_MONTHS.findIndex((name) => name === raw);
            if (idx === -1) {
                throw new ApiError(400, `Oy nomi tushunarsiz: "${query.month}". Masalan: iyul yoki 7.`);
            }
            m = idx + 1;
        }
    } else {
        m = now.getMonth() + 1;
    }

    if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw new ApiError(400, "Oy 1 dan 12 gacha (yoki oy nomi) bo'lishi kerak.");
    }

    let y = now.getFullYear();
    if (query.year !== undefined && query.year !== null && String(query.year).trim() !== '') {
        y = parseInt(query.year, 10);
        if (Number.isNaN(y)) throw new ApiError(400, "Yil noto'g'ri formatda.");
    }

    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const monthName = UZ_MONTHS[m - 1];

    return { month: m, year: y, monthName, start, end };
}

function resolveFormat(query = {}) {
    const format = String(query.format || 'excel').trim().toLowerCase();
    if (!['excel', 'xlsx', 'pdf'].includes(format)) {
        throw new ApiError(400, "format 'excel' yoki 'pdf' bo'lishi kerak.");
    }
    return format === 'xlsx' ? 'excel' : format;
}

function formatMoney(n) {
    return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}

function setDownloadHeaders(res, filename, format) {
    const mime = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
}

export {
    REPORT_COLORS,
    UZ_MONTHS,
    STATUS_LABELS_UZ,
    resolveMonthYear,
    resolveFormat,
    formatMoney,
    setDownloadHeaders,
};
