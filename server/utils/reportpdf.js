// ============================================================================
// utils/reportPdf.js — PDF hisobotlarini yaratish (pdfkit)
// Barcha funksiyalar Buffer qaytaradi.
// ============================================================================

import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';

function docToBuffer(doc) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
    });
}

/**
 * Umumiy jadval chizish funksiyasi. Sahifa tugasa avtomatik yangi sahifa ochadi
 * va sarlavha qatorini qayta chizadi.
 */
function drawTable(doc, { title, headers, rows, colWidths, marginLeft = 40 }) {
    const rowHeight = 22;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    let y = doc.y;

    function drawHeader() {
        doc.font('Helvetica-Bold').fontSize(9);
        let x = marginLeft;
        doc.rect(marginLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#2F5597');
        doc.fillColor('#FFFFFF');
        headers.forEach((h, i) => {
            doc.text(String(h), x + 4, y + 6, { width: colWidths[i] - 8, ellipsis: true });
            x += colWidths[i];
        });
        doc.fillColor('#000000');
        y += rowHeight;
    }

    if (title) {
        doc.font('Helvetica-Bold').fontSize(14).text(title, marginLeft, y, { align: 'left' });
        y = doc.y + 10;
    }

    drawHeader();

    doc.font('Helvetica').fontSize(8.5);
    rows.forEach((row, idx) => {
        if (y + rowHeight > pageBottom) {
            doc.addPage();
            y = doc.page.margins.top;
            drawHeader();
            doc.font('Helvetica').fontSize(8.5);
        }

        if (idx % 2 === 0) {
            doc.rect(marginLeft, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#F2F2F2');
            doc.fillColor('#000000');
        }

        let x = marginLeft;
        row.forEach((cell, i) => {
            doc.text(String(cell ?? '—'), x + 4, y + 6, { width: colWidths[i] - 8, ellipsis: true });
            x += colWidths[i];
        });
        y += rowHeight;
    });

    doc.y = y + 10;
}

function newDoc() {
    return new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
}

// ---------------------------------------------------------------------------
// 1) MAHSULOTLAR
// ---------------------------------------------------------------------------
export async function buildProductsPdf(products, title = 'Mahsulotlar hisoboti (ombor)') {
    const doc = newDoc();
    const rows = [];
    let grandKg = 0;
    let grandSum = 0;

    products.forEach((p) => {
        (p.sizes || []).forEach((s) => {
            const rowSum = (s.total || 0) * (s.price || 0);
            rows.push([p.category, p.name, s.size, s.price, s.boxes, s.box_kg, s.total, rowSum]);
            grandKg += s.total || 0;
            grandSum += rowSum;
        });
    });

    drawTable(doc, {
        title: `${title} — ${dayjs().format('YYYY-MM-DD HH:mm')}`,
        headers: ['Kategoriya', 'Mahsulot', "O'lcham", 'Narx', 'Quti', 'Quti/kg', 'Jami kg', 'Jami summa'],
        rows,
        colWidths: [90, 140, 60, 70, 60, 70, 80, 100],
    });

    doc.font('Helvetica-Bold').fontSize(11).text(
        `JAMI: ${grandKg.toLocaleString('ru-RU')} kg — ${grandSum.toLocaleString('ru-RU')} $`,
        { align: 'right' }
    );

    return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// 2) BUYURTMALAR / SAVDO
// ---------------------------------------------------------------------------
export async function buildOrdersPdf(orders, title = 'Savdo hisoboti') {
    const doc = newDoc();
    const rows = [];
    let grandTotal = 0;

    orders.forEach((o) => {
        (o.items || []).forEach((item) => {
            rows.push([
                dayjs(o.createdAt).format('YYYY-MM-DD HH:mm'),
                o.client?.name || '—',
                item.productName,
                item.size,
                item.quantityKg,
                item.pricePerKg,
                item.subtotal,
            ]);
        });
        if (o.status !== 'cancelled') grandTotal += o.orderTotal || 0;
    });

    drawTable(doc, {
        title,
        headers: ['Sana', 'Mijoz', 'Mahsulot', "O'lcham", 'Miqdor (kg)', 'Narx/kg', 'Summa'],
        rows,
        colWidths: [110, 130, 160, 60, 90, 90, 100],
    });

    doc.font('Helvetica-Bold').fontSize(11).text(
        `JAMI SAVDO: ${grandTotal.toLocaleString('ru-RU')} $`,
        { align: 'right' }
    );

    return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// 3) QARZDOR MIJOZLAR
// ---------------------------------------------------------------------------
export async function buildDebtorsPdf(clients, title = 'Qarzdor mijozlar') {
    const doc = newDoc();
    let total = 0;
    const rows = clients.map((c) => {
        total += c.debt || 0;
        return [c.name, c.phone, c.debt];
    });

    drawTable(doc, {
        title: `${title} — ${dayjs().format('YYYY-MM-DD')}`,
        headers: ['Mijoz', 'Telefon', 'Qarz summasi'],
        rows,
        colWidths: [220, 160, 160],
    });

    doc.font('Helvetica-Bold').fontSize(11).text(
        `JAMI QARZ: ${total.toLocaleString('ru-RU')} $`,
        { align: 'right' }
    );

    return docToBuffer(doc);
}

// ---------------------------------------------------------------------------
// 4) KASSA TARIXI
// ---------------------------------------------------------------------------
export async function buildKassaPdf(history, title = 'Kassa hisoboti') {
    const doc = newDoc();
    let kirimJami = 0;
    let chiqimJami = 0;

    const rows = history.map((h) => {
        if (h.type === 'KIRIM') kirimJami += h.amount;
        else chiqimJami += h.amount;
        return [
            dayjs(h.createdAt).format('YYYY-MM-DD HH:mm'),
            h.type === 'KIRIM' ? 'Kirim' : 'Chiqim',
            h.amount,
            h.reason || h.clientName || '—',
            h.client?.name || h.clientName || '—',
            h.balanceAfter,
        ];
    });

    drawTable(doc, {
        title: `${title} — ${dayjs().format('YYYY-MM-DD HH:mm')}`,
        headers: ['Sana', 'Turi', 'Summa', 'Sabab / izoh', 'Mijoz', 'Balans'],
        rows,
        colWidths: [110, 70, 90, 200, 130, 100],
    });

    doc.font('Helvetica-Bold').fontSize(11).text(
        `Kirim jami: ${kirimJami.toLocaleString('ru-RU')} $   |   Chiqim jami: ${chiqimJami.toLocaleString('ru-RU')} $`,
        { align: 'right' }
    );

    return docToBuffer(doc);
}