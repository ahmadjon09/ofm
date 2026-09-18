import { ApiError } from '../../lib/helpers.js';
import { currentMonthKey, localParts, monthKeyRange } from '../../lib/datetime.js';

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
    // Standart oy — serverning mahalliy vaqti emas, ish mintaqasi bo'yicha
    // (aks holda oy boshida hisobot noto'g'ri oyga tushadi).
    const nowParts = localParts(now);
    const defaultKey = currentMonthKey(now);
    const defaultParts = { year: Number(defaultKey.slice(0, 4)), month: Number(defaultKey.slice(5, 7)) };
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
        m = defaultParts.month;
    }

    if (!Number.isInteger(m) || m < 1 || m > 12) {
        throw new ApiError(400, "Oy 1 dan 12 gacha (yoki oy nomi) bo'lishi kerak.");
    }

    let y = defaultParts.year;
    if (query.year !== undefined && query.year !== null && String(query.year).trim() !== '') {
        y = parseInt(query.year, 10);
        if (Number.isNaN(y)) throw new ApiError(400, "Yil noto'g'ri formatda.");
    }

    const range = monthKeyRange(`${y}-${String(m).padStart(2, '0')}`, undefined);
    const monthName = UZ_MONTHS[m - 1];

    // start/end — ish mintaqasi bo'yicha oy chegaralari (UTC instants).
    return {
        month: m,
        year: y,
        monthName,
        start: range.start,
        end: range.end,
        monthKey: range.monthKey,
        nowParts,
    };
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
