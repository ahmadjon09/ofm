// Test uchun bcrypt o'rnini bosuvchi (bu muhitda bcrypt native binari yig'ilmaydi).
// Faqat import xatolik bermasligi uchun ishlatiladi.
export default {
    async hash(value) { return `fake-hash:${value}`; },
    async compare(value, hash) { return hash === `fake-hash:${value}`; },
};
