# Davr bo‘yicha filtrlash — Dashboard va Buyurtmalar

Ushbu hujjat 2026-yil oktabrida kiritilgan o‘zgarishlarni tushuntiradi:
**barcha asosiy ko‘rsatkichlar endi standart holatda FAQAT JORIY OY uchun hisoblanadi.**

---

## 1. Asosiy qoida

| So‘rov | Natija |
| --- | --- |
| Parametrsiz (standart) | **Joriy oy** — oyning 1-kunidan **bugungi kungacha** |
| `range=current-month` | Joriy oy (1-kunidan bugungacha) |
| `range=previous-month` | O‘tgan oyning to‘liq davri |
| `range=all` | Barcha vaqt (butun tarix) |
| `range=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | Aniq tanlangan davr |
| `startDate` / `endDate` (range`siz) | Aniq davr (eski `from` / `to` ham qabul qilinadi) |
| `month=YYYY-MM` | Bitta oy (eski klientlar uchun moslik) |

- Barcha chegaralar **biznes vaqt mintaqasi** bo‘yicha hisoblanadi
  (`TIMEZONE_OFFSET_MINUTES`, standart `300` = UTC+5, Toshkent).
- Klient preset bilan birga `startDate`/`endDate` yuborishi mumkin — so‘rov
  o‘z-o‘zini izohlaydi, lekin preset chegaralari **serverda qayta hisoblanadi**
  (foydalanuvchi qurilmasining soati xato bo‘lsa ham natija to‘g‘ri qoladi).
- Sana formati: `YYYY-MM-DD`. Noto‘g‘ri yoki mavjud bo‘lmagan sana
  (masalan `2026-02-31`) → **400** va tushunarli xabar.

---

## 2. Endpointlar

### `GET /api/v2/dashboard/stats`

Javob (asosiy qismlari):

```json
{
  "range": {
    "mode": "current-month",
    "modeLabel": "Joriy oy",
    "label": "1–31 oktabr 2026",
    "startDate": "2026-10-01",
    "endDate": "2026-10-31",
    "start": "2026-09-30T19:00:00.000Z",
    "endExclusive": "2026-10-31T19:00:00.000Z",
    "days": 31,
    "isCurrentMonth": true,
    "includesToday": true,
    "timezoneLabel": "UTC+05:00"
  },
  "period": {
    "orders": 24,
    "revenue": 12500000,
    "avgOrderValue": 520833.33,
    "activeClients": 9,
    "newClients": 2,
    "completedOrders": 18,
    "pendingOrders": 5,
    "cancelledOrders": 1,
    "cancelledAmount": 400000,
    "totalKg": 1850,
    "totalBoxes": 185,
    "hasOrders": true
  },
  "previous": { "range": { "...": "..." }, "orders": 20, "revenue": 11000000 },
  "growth": {
    "revenuePercent": 13.6,
    "ordersPercent": 20,
    "comparisonLabel": "O‘tgan oyning shu kunlariga nisbatan",
    "previousRevenue": 11000000,
    "previousOrders": 20
  },
  "stock": { "products": 14, "value": 42000000, "kg": 3200, "boxes": 320 },
  "debts": { "total": 7800000, "debtors": 6 },
  "today": { "orders": 2, "revenue": 1500000, "inRange": true },
  "topProducts": [],
  "latestOrders": [],
  "charts": {
    "monthlyRevenueTrend": [],
    "dailyRevenueTrend": [],
    "daily": { "mode": "period", "label": "1–31 oktabr 2026" },
    "orderStatusChart": [],
    "topClientsByDebt": []
  }
}
```

Muhim: `totalOrders`, `totalClients`, `revenue` kabi **eski maydonlar ham**
qoldirilgan, lekin ular endi davr bo‘yicha hisoblanadi (orqaga moslik uchun).

### `GET /api/v2/orders`

Query parametrlari: `page`, `limit`, `status`, `clientId`, `range`, `startDate`, `endDate`.

- Standart: **faqat joriy oy** buyurtmalari.
- Javobda har bir sahifa uchun buyurtmalar + butun davr bo‘yicha yig‘indi:

```json
{
  "data": {
    "orders": [],
    "summary": { "orders": 24, "amount": 12500000, "kg": 1850, "boxes": 185, "cancelled": 1, "completed": 18, "pending": 5 }
  },
  "meta": {
    "total": 24,
    "page": 1,
    "limit": 10,
    "totalPages": 3,
    "range": { "mode": "current-month", "label": "1–31 oktabr 2026" }
  }
}
```

- Noto‘g‘ri `status` qiymati → **400** (jimgina e’tiborsiz qoldirilmaydi).

---

## 3. Hisoblash qoidalari

| Ko‘rsatkich | Qanday hisoblanadi |
| --- | --- |
| **Buyurtmalar soni** | Tanlangan davrda yaratilgan barcha buyurtmalar (bekor qilinganlar ham) |
| **Tushum** | Tanlangan davrdagi buyurtmalar summasi, **bekor qilinganlarsiz** |
| **Aktiv mijozlar** | Shu davrda kamida bitta (bekor qilinmagan) buyurtma bergan mijozlar |
| **Yangi mijozlar** | Shu davrda birinchi marta qo‘shilgan mijozlar |
| **O‘rtacha buyurtma summasi** | `Tushum ÷ (barcha buyurtmalar − bekor qilinganlar)` |
| **O‘sish foizi** | Joriy oy uchun — o‘tgan oyning **xuddi shu kunlarigacha** bo‘lgan davri; tugagan oy uchun — oldingi to‘liq oy; aniq davr uchun — oldingi shu uzunlikdagi davr. Baza `0` bo‘lsa, foiz ko‘rsatilmaydi (`null`). |
| **Ombordagi mahsulotlar / qiymat / vazn** | **Bugungi holat** — davrga bog‘liq emas |
| **Mijozlar qarzi** | **Bugungi holat** — davrga bog‘liq emas |
| **Kassa balansi** | **Bugungi holat** — alohida `/kassa` endpointidan |

> Davrga bog‘liq bo‘lmagan ko‘rsatkichlar interfeysda alohida
> **“Bugungi holat”** blokida turadi va har bir kartochkada shu izoh yozilgan.

---

## 4. Interfeysda o‘zgargan qismlar

- `client/src/pages/Dashboard.jsx`
  - Yangi davr tanlagichi: **Shu oy / O‘tgan oy / Barcha vaqt / Sana bo‘yicha**.
  - Har bir kartochkada davr yozuvi, `?` tooltip va o‘sish foizi.
  - “Shu davr uchun ko‘rsatkichlar” va “Bugungi holat” bloklari ajratildi.
  - Bo‘sh holat: *“Joriy oyda hali buyurtmalar mavjud emas”* + CTA.
  - Grafiklar ham tanlangan davr bo‘yicha (TOP-5, holatlar, kunlik/oylik trend).
- `client/src/pages/Orders.jsx`
  - Standart filtr — **joriy oy**; sahifa ochilganda eski yozuvlar yuklanmaydi.
  - Davr tugmalari, aniq sana tanlash, davr yig‘indisi (summa/kg/bekor).
  - Bo‘sh holatlar va “Barcha vaqtni ko‘rish” / “Shu oyga qaytish” amallari.
- `client/src/lib/period.js` — umumiy davr yordamchilari (preset, sana kalitlari, izohlar).
- `server/src/lib/period.js` — yagona server davr mantiqi.
- `server/src/controllers/dashboard.controller.js` — davr bo‘yicha hisoblash.
- `server/src/controllers/order.controller.js` — davr filtri + yig‘indi.
- `server/src/lib/datetime.js` — noto‘g‘ri kalendar sanalarini rad etish.

---

## 5. Testlar

```bash
cd server
npm run test:period   # Dashboard/Orders davr mantiqi (14 tekshiruv)
npm test              # kassa testlari (mavjud)
```
