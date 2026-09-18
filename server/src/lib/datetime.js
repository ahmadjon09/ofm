import { config } from '../config/index.js';

/**
 * Vaqt mintaqasiga sezgir (timezone-aware) sana/oy yordamchilari.
 *
 * Butun tizim "ish vaqti mintaqasi" (config.timezoneOffsetMinutes, standart UTC+5 —
 * Toshkent) bo'yicha hisoblaydi. Barcha saqlangan sanalar UTC instants, lekin
 * "oy", "kun" chegaralari shu mintaqa bo'yicha aniqlanadi. Aks holda
 * (masalan server UTC bo'lsa) kechqurun kiritilgan operatsiyalar noto'g'ri
 * oyga tushib qoladi va oylik hisobotlar xato chiqadi.
 */

const MONTH_KEY_PATTERN = /^(\d{4})-(\d{1,2})$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// "2026-09-01T00:00:00.000Z" kabi yarim tun UTC instants (eski klientlar shunday
// yuborardi) — buni ham "kun" deb talqin qilamiz.
const UTC_MIDNIGHT_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})T00:00:00(?:\.000)?Z$/;

const UZ_MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getTimezoneOffsetMinutes() {
    return config.timezoneOffsetMinutes;
}

function getTimezoneOffsetMs() {
    return getTimezoneOffsetMinutes() * MINUTE_MS;
}

function getTimezoneLabel(offsetMinutes = getTimezoneOffsetMinutes()) {
    const sign = offsetMinutes < 0 ? '-' : '+';
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `UTC${sign}${hh}:${mm}`;
}

function toLocalDate(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const value = date instanceof Date ? date.getTime() : new Date(date).getTime();
    return new Date(value + offsetMinutes * MINUTE_MS);
}

function toUtcDate(localDate, offsetMinutes = getTimezoneOffsetMinutes()) {
    const value = localDate instanceof Date ? localDate.getTime() : new Date(localDate).getTime();
    return new Date(value - offsetMinutes * MINUTE_MS);
}

/** Berilgan UTC instantning mahalliy (ish mintaqasi) bo'laklari. */
function localParts(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const local = toLocalDate(date, offsetMinutes);
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hours: local.getUTCHours(),
        minutes: local.getUTCMinutes(),
        seconds: local.getUTCSeconds(),
        weekday: local.getUTCDay(),
    };
}

/** Mahalliy yil/oy/kun -> UTC instant. */
function localDateToUtcInstant(year, month, day, offsetMinutes = getTimezoneOffsetMinutes(), hours = 0, minutes = 0, seconds = 0, ms = 0) {
    return new Date(
        Date.UTC(year, month - 1, day, hours, minutes, seconds, ms) - offsetMinutes * MINUTE_MS
    );
}

function formatMonthKey(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const parts = localParts(date, offsetMinutes);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function formatDayKey(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const parts = localParts(date, offsetMinutes);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function normalizeMonthKey(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const match = MONTH_KEY_PATTERN.exec(String(value).trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonthKey(value) {
    const key = normalizeMonthKey(value);
    if (!key) return null;
    const [year, month] = key.split('-').map(Number);
    return { key, year, month };
}

function shiftMonthKey(value, delta) {
    const parsed = parseMonthKey(value);
    if (!parsed) return null;
    const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + Number(delta || 0), 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyLabel(value) {
    const parsed = parseMonthKey(value);
    if (!parsed) return null;
    return `${UZ_MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

/**
 * Oy kaliti ('2026-09') uchun [start, endExclusive) oralig'ini qaytaradi.
 * endExclusive — keyingi oy boshlanishi (so'rovlarda $lt ishlatiladi).
 */
function monthKeyRange(value, offsetMinutes = getTimezoneOffsetMinutes()) {
    const parsed = parseMonthKey(value);
    if (!parsed) return null;
    const start = localDateToUtcInstant(parsed.year, parsed.month, 1, offsetMinutes);
    const endExclusive = localDateToUtcInstant(parsed.year, parsed.month + 1, 1, offsetMinutes);
    return {
        monthKey: parsed.key,
        year: parsed.year,
        month: parsed.month,
        label: `${UZ_MONTH_NAMES[parsed.month - 1]} ${parsed.year}`,
        start,
        endExclusive,
        end: new Date(endExclusive.getTime() - 1),
    };
}

function dayKeyRange(value, offsetMinutes = getTimezoneOffsetMinutes()) {
    const match = DATE_ONLY_PATTERN.exec(String(value || '').trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const start = localDateToUtcInstant(year, month, day, offsetMinutes);
    const endExclusive = localDateToUtcInstant(year, month, day + 1, offsetMinutes);
    return {
        dayKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        start,
        endExclusive,
    };
}

function currentMonthKey(now = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    return formatMonthKey(now, offsetMinutes);
}

function currentDayKey(now = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    return formatDayKey(now, offsetMinutes);
}

function startOfLocalDay(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const parts = localParts(date, offsetMinutes);
    return localDateToUtcInstant(parts.year, parts.month, parts.day, offsetMinutes);
}

function startOfLocalMonth(date = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const parts = localParts(date, offsetMinutes);
    return localDateToUtcInstant(parts.year, parts.month, 1, offsetMinutes);
}

function addLocalDays(date, days, offsetMinutes = getTimezoneOffsetMinutes()) {
    const shifted = toLocalDate(date, offsetMinutes);
    const next = new Date(shifted.getTime() + Number(days || 0) * DAY_MS);
    return toUtcDate(next, offsetMinutes);
}

function addLocalMonths(date, months, offsetMinutes = getTimezoneOffsetMinutes()) {
    const parts = localParts(date, offsetMinutes);
    return localDateToUtcInstant(parts.year, parts.month + Number(months || 0), 1, offsetMinutes);
}

/**
 * `from`/`to` kiritmalarini UTC instantga aylantiradi.
 * - '2026-09-01' (faqat kun) yoki UTC yarim tun ISO -> shu kunning boshlanishi.
 * - Boshqa ISO instants -> o'zidek qabul qilinadi.
 * `end` uchun (to) kun oxiri nazarda tutiladi: v.nextDayStart (eksklyuziv).
 */
function parseRangeBoundary(value, { isEnd = false, offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const raw = String(value).trim();

    const dateOnly = DATE_ONLY_PATTERN.exec(raw) || UTC_MIDNIGHT_PATTERN.exec(raw);
    if (dateOnly) {
        const dayRange = dayKeyRange(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, offsetMinutes);
        if (!dayRange) return null;
        return isEnd ? dayRange.endExclusive : dayRange.start;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return isEnd ? new Date(parsed.getTime() + 1) : parsed;
}

/**
 * So'rovdagi month/from/to parametrlaridan yagona [start, endExclusive) oralig'ini oladi.
 * `month` ustuvor (YYYY-MM yoki month=9&year=2026). Hech biri bo'lmasa null.
 */
function resolveRangeQuery(query = {}, { now = new Date(), offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    const monthKey = resolveMonthQuery(query, { now, offsetMinutes });

    if (monthKey) {
        const range = monthKeyRange(monthKey, offsetMinutes);
        return {
            source: 'month',
            monthKey: range.monthKey,
            label: range.label,
            year: range.year,
            month: range.month,
            start: range.start,
            endExclusive: range.endExclusive,
            end: range.end,
        };
    }

    const start = parseRangeBoundary(query.from, { isEnd: false, offsetMinutes });
    const endExclusive = parseRangeBoundary(query.to, { isEnd: true, offsetMinutes });
    if (!start && !endExclusive) return null;

    const from = start || new Date(0);
    const to = endExclusive || new Date();
    return {
        source: 'range',
        monthKey: null,
        label: null,
        start,
        endExclusive,
        end: endExclusive ? new Date(endExclusive.getTime() - 1) : null,
        days: Math.max(Math.ceil((to.getTime() - from.getTime()) / DAY_MS), 0),
    };
}

function resolveMonthFromParts({ month, year } = {}, now = new Date(), offsetMinutes = getTimezoneOffsetMinutes()) {
    const nowParts = localParts(now, offsetMinutes);
    const monthNumber = Number(month);
    const yearNumber = Number(year);

    const safeMonth = Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
        ? monthNumber
        : nowParts.month;
    const safeYear = Number.isInteger(yearNumber) && yearNumber > 1900 && yearNumber < 3000
        ? yearNumber
        : nowParts.year;

    return `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
}

/**
 * So'rovdan oy kalitini oladi:
 *   month=2026-09  (asosiy format, klient shuni yuboradi)
 *   month=9&year=2026 (eski hisobotlardagi format)
 * Topilmasa null.
 */
function resolveMonthQuery(query = {}, { now = new Date(), offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    const fromKey = normalizeMonthKey(query.month);
    if (fromKey) return fromKey;

    const raw = query.month === undefined || query.month === null ? '' : String(query.month).trim();
    if (/^\d{1,2}$/.test(raw)) {
        const monthNumber = Number(raw);
        // Noto'g'ri oy (13 kabi) jimgina joriy oyga aylanmasin — null qaytaramiz.
        if (monthNumber < 1 || monthNumber > 12) return null;
        return resolveMonthFromParts({ month: monthNumber, year: query.year }, now, offsetMinutes);
    }

    return null;
}

/** Berilgan [start, endExclusive) oralig'idagi barcha mahalliy kun kalitlari. */
function listDayKeys(start, endExclusive, offsetMinutes = getTimezoneOffsetMinutes()) {
    const keys = [];
    if (!start || !endExclusive) return keys;
    let cursor = startOfLocalDay(start, offsetMinutes);
    const guard = 400; // xavfsizlik: juda katta oraliqlarda cheksiz aylanmaslik uchun
    let i = 0;
    while (cursor.getTime() < endExclusive.getTime() && i < guard) {
        keys.push(formatDayKey(cursor, offsetMinutes));
        cursor = addLocalDays(cursor, 1, offsetMinutes);
        i += 1;
    }
    return keys;
}

function describeRange(range, offsetMinutes = getTimezoneOffsetMinutes()) {
    if (!range) return null;
    return {
        month: range.monthKey || null,
        label: range.label || null,
        from: range.start ? range.start.toISOString() : null,
        to: range.endExclusive ? range.endExclusive.toISOString() : null,
        timezoneOffsetMinutes: offsetMinutes,
        timezoneLabel: getTimezoneLabel(offsetMinutes),
    };
}

export {
    UZ_MONTH_NAMES,
    DAY_MS,
    MINUTE_MS,
    getTimezoneOffsetMinutes,
    getTimezoneOffsetMs,
    getTimezoneLabel,
    toLocalDate,
    toUtcDate,
    localParts,
    localDateToUtcInstant,
    formatMonthKey,
    formatDayKey,
    normalizeMonthKey,
    parseMonthKey,
    shiftMonthKey,
    monthKeyLabel,
    monthKeyRange,
    dayKeyRange,
    currentMonthKey,
    currentDayKey,
    startOfLocalDay,
    startOfLocalMonth,
    addLocalDays,
    addLocalMonths,
    parseRangeBoundary,
    resolveRangeQuery,
    resolveMonthQuery,
    resolveMonthFromParts,
    listDayKeys,
    describeRange,
};
