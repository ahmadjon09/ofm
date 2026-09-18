/**
 * ESM loader: `src/models/index.js` importini test modeliga almashtiradi
 * (bu muhitda MongoDB yo'q, lekin controller mantiqini haqiqiy kod bilan
 * tekshirish kerak).
 */
export async function resolve(specifier, context, nextResolve) {
    // bcrypt native binari bu muhitda yig'ilmaydi — test uchun stub.
    if (specifier === 'bcrypt') {
        return {
            url: new URL('./fakeBcrypt.js', import.meta.url).href,
            shortCircuit: true,
        };
    }

    if (/(^|\/)models\/index\.js$/.test(specifier)) {
        return {
            url: new URL('./fakeModels.js', import.meta.url).href,
            shortCircuit: true,
        };
    }
    return nextResolve(specifier, context);
}
