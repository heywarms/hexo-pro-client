// The theme preview runs in a sandboxed iframe without allow-same-origin, where reading
// localStorage or sessionStorage throws. Many themes (e.g. anzhiyu) read them while starting up,
// so their scripts stop and the preview stays blank. This script runs before any theme script and
// swaps in per-preview memory storage; nothing is shared with the admin page.
// Kept as a plain ES5 string so the build cannot rewrite it to depend on bundler helpers.
export const previewStorageScript = `(function (win) {
  function memoryStorage() {
    var data = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[String(key)] = String(value); },
      removeItem: function (key) { delete data[key]; },
      clear: function () { data = {}; },
      key: function (index) { var keys = Object.keys(data); return index < keys.length ? keys[index] : null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { void win[name]; } catch (error) {
      Object.defineProperty(win, name, { value: memoryStorage(), configurable: true });
    }
  });
})(window);`
