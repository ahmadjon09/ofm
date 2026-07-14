// ============================================================================
// utils/reportExcel.js — Excel (.xlsx) hisobotlarini yaratish
// Barcha funksiyalar Buffer qaytaradi — bot shu bufferni to'g'ridan-to'g'ri
// Telegramga fayl sifatida yuboradi (diskka yozmasdan).
// ============================================================================

import ExcelJS from 'exceljs';
import dayjs from 'dayjs';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeaderRow(row) {
    row.eachCell((cell) => {
        cell.font = HEADER_FONT;
        cell.fill = HEADER_FILL;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    row.height = 20;
}

function addTitle(sheet, title, span) {
    sheet.mergeCells(1, 1, 1, span);
    const cell = sheet.getCell(1, 1);
    cell.value = title;
    cell.font = { size: 15, bold: true };
    cell.alignment = { horizontal: 'center' };
    sheet.addRow([]);
}

// ---------------------------------------------------------------------------
// 1) MAHSULOTLAR (ombordagi joriy holat) — har bir o'lcham alohida qatorda
// ---------------------------------------------------------------------------
export async function buildProductsExcel(products, title = "Mahsulotlar hisoboti (ombor)") {
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Mahsulotlar');

    addTitle(sheet, `${title} — ${dayjs().format('YYYY-MM-DD HH:mm')}`, 8);

    const headerRow = sheet.addRow(['#', 'Kategoriya', 'Mahsulot', "O'lcham", 'Narx (kg)', 'Quti soni', 'Quti/kg', 'Jami (kg)', 'Jami summa']);
    styleHeaderRow(headerRow);

    let n = 1;
    let grandKg = 0;
    let grandSum = 0;

    products.forEach((p) => {
        (p.sizes || []).forEach((s) => {
            const rowSum = (s.total || 0) * (s.price || 0);
            sheet.addRow([n++, p.category, p.name, s.size, s.price, s.boxes, s.box_kg, s.total, rowSum]);
            grandKg += s.total || 0;
            grandSum += rowSum;
        });
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['', '', '', '', '', '', 'JAMI:', grandKg, grandSum]);
    totalRow.font = { bold: true };

    sheet.columns.forEach((c) => (c.width = 15));
    sheet.getColumn(3).width = 26;

    return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// 2) BUYURTMALAR / SAVDO (tanlangan oy uchun) — har bir mahsulot alohida qatorda
// ---------------------------------------------------------------------------
export async function buildOrdersExcel(orders, title = "Savdo hisoboti") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Savdo');

    addTitle(sheet, title, 9);

    const headerRow = sheet.addRow(['#', 'Sana', 'Mijoz', 'Telefon', 'Mahsulot', "O'lcham", 'Miqdor (kg)', 'Narx/kg', 'Summa']);
    styleHeaderRow(headerRow);

    let n = 1;
    let grandTotal = 0;
    const statusLabels = { pending: 'Kutilmoqda', completed: 'Bajarilgan', cancelled: 'Bekor qilingan' };

    orders.forEach((o) => {
        (o.items || []).forEach((item) => {
            sheet.addRow([
                n++,
                dayjs(o.createdAt).format('YYYY-MM-DD HH:mm'),
                o.client?.name || '—',
                o.client?.phone || '—',
                item.productName,
                item.size,
                item.quantityKg,
                item.pricePerKg,
                item.subtotal,
            ]);
        });
        if (o.status !== 'cancelled') grandTotal += o.orderTotal || 0;
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['', '', '', '', '', '', '', 'JAMI SAVDO:', grandTotal]);
    totalRow.font = { bold: true };

    const cancelledCount = orders.filter((o) => o.status === 'cancelled').length;
    if (cancelledCount) {
        sheet.addRow(['', '', '', '', '', '', '', 'Bekor qilingan buyurtmalar:', cancelledCount]);
    }

    sheet.columns.forEach((c) => (c.width = 16));
    sheet.getColumn(3).width = 22;
    sheet.getColumn(5).width = 24;

    return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// 3) QARZDOR MIJOZLAR
// ---------------------------------------------------------------------------
export async function buildDebtorsExcel(clients, title = "Qarzdor mijozlar") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Qarzdorlar');

    addTitle(sheet, `${title} — ${dayjs().format('YYYY-MM-DD')}`, 4);

    const headerRow = sheet.addRow(['#', 'Mijoz', 'Telefon', 'Qarz summasi']);
    styleHeaderRow(headerRow);

    let total = 0;
    clients.forEach((c, i) => {
        sheet.addRow([i + 1, c.name, c.phone, c.debt]);
        total += c.debt || 0;
    });

    sheet.addRow([]);
    const totalRow = sheet.addRow(['', '', 'JAMI QARZ:', total]);
    totalRow.font = { bold: true };

    sheet.columns.forEach((c) => (c.width = 22));
    return workbook.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// 4) KASSA TARIXI
// ---------------------------------------------------------------------------
export async function buildKassaExcel(history, title = "Kassa hisoboti") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Kassa');

    addTitle(sheet, `${title} — ${dayjs().format('YYYY-MM-DD HH:mm')}`, 7);

    const headerRow = sheet.addRow(['#', 'Sana', 'Turi', 'Summa', 'Sabab / izoh', 'Mijoz', 'Balans (keyin)']);
    styleHeaderRow(headerRow);

    let kirimJami = 0;
    let chiqimJami = 0;

    history.forEach((h, i) => {
        sheet.addRow([
            i + 1,
            dayjs(h.createdAt).format('YYYY-MM-DD HH:mm'),
            h.type === 'KIRIM' ? 'Kirim' : 'Chiqim',
            h.amount,
            h.reason || h.clientName || '—',
            h.client?.name || h.clientName || '—',
            h.balanceAfter,
        ]);
        if (h.type === 'KIRIM') kirimJami += h.amount;
        else chiqimJami += h.amount;
    });

    sheet.addRow([]);
    const r1 = sheet.addRow(['', '', '', 'Kirim jami:', kirimJami]);
    r1.font = { bold: true };
    const r2 = sheet.addRow(['', '', '', 'Chiqim jami:', chiqimJami]);
    r2.font = { bold: true };

    sheet.columns.forEach((c) => (c.width = 18));
    sheet.getColumn(5).width = 26;

    return workbook.xlsx.writeBuffer();
}