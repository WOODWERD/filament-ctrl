// This device's store: the connection, and the last record read, so the shelf opens offline. Nothing here leaves the device.
const KEY = 'filamentctrl.';
export function getMeta(k) { try { return JSON.parse(localStorage.getItem(KEY + k)); } catch { return null; } }
export function setMeta(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
export function delMeta(k) { try { localStorage.removeItem(KEY + k); } catch { /* storage unavailable */ } }
