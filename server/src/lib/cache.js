const dashboardStore = { data: null, expiresAt: 0 };
const kassaStore = { data: null, expiresAt: 0 };

function getCache(store) {
    if (store.data && Date.now() < store.expiresAt) return store.data;
    return null;
}

function setCache(store, data, ttl) {
    store.data = data;
    store.expiresAt = Date.now() + ttl * 1000;
}

function clearDashboardCache() {
    dashboardStore.data = null;
    dashboardStore.expiresAt = 0;
}

function clearKassaCache() {
    kassaStore.data = null;
    kassaStore.expiresAt = 0;
}

export {
    dashboardStore,
    kassaStore,
    getCache,
    setCache,
    clearDashboardCache,
    clearKassaCache,
};
