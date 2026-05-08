// Stub browser globals not provided by jsdom
if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers {
    constructor() { this._h = {}; }
    append(k, v) { this._h[k] = v; }
  };
}

// Stub WebSocket
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class WebSocket {
    constructor() { this.readyState = 1; }
    send() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
}

// Stub window.CustomEvent if needed (IE polyfill in utility.js)
if (typeof window.CustomEvent !== 'function') {
  window.CustomEvent = class CustomEvent extends Event {
    constructor(event, params = {}) {
      super(event, params);
      this.detail = params.detail || null;
    }
  };
}

// Stub localStorage
if (!global.localStorage) {
  const store = {};
  global.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => Object.keys(store).forEach(k => delete store[k]),
  };
}
