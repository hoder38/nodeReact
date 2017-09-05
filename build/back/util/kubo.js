"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
var _0x7487 = ["replace", "banner", "Juice", "indexOf", "Close", "Run", "charCodeAt", "log", "", "g", "%c", "getElementById", "color:blue", "Log", "remove", "font-weight:bold;color:red", "length", " - %chttp://www.99kubo.com", "[^A-Za-z0-9+\/=]", "charAt", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=", "fromCharCode", "utf8"];

var JuicyCodes = exports.JuicyCodes = {
    "Juice": _0x7487[20],
    "Run": function Run(e) {
        var t = _0x7487[8],
            n = void 0,
            r = void 0,
            i = void 0,
            s = void 0,
            o = void 0,
            u = void 0,
            a = void 0,
            f = 0;
        for (e = e[_0x7487[0]](new RegExp(_0x7487[18], _0x7487[9]), _0x7487[8]); f < e[_0x7487[16]];) {
            s = this[_0x7487[2]][_0x7487[3]](e[_0x7487[19]](f++)), o = this[_0x7487[2]][_0x7487[3]](e[_0x7487[19]](f++)), u = this[_0x7487[2]][_0x7487[3]](e[_0x7487[19]](f++)), a = this[_0x7487[2]][_0x7487[3]](e[_0x7487[19]](f++)), n = s << 2 | o >> 4, r = (15 & o) << 4 | u >> 2, i = (3 & u) << 6 | a, t += String[_0x7487[21]](n), 64 != u && (t += String[_0x7487[21]](r)), 64 != a && (t += String[_0x7487[21]](i));
        }return t = JuicyCodes[_0x7487[22]](t), eval(t);
    },
    "Log": function Log(a) {
        console[_0x7487[7]](_0x7487[10] + a + _0x7487[17], _0x7487[15], _0x7487[12]);
    },
    "Close": function Close() {
        var a = document[_0x7487[11]](_0x7487[1]);
        return a[_0x7487[14]](), !1;
    },
    "utf8": function utf8(a) {
        var b = _0x7487[8];
        for (var c = 0, d = 0, c1 = 0, c2 = 0, c3; c < a[_0x7487[16]];) {
            d = a[_0x7487[6]](c), d < 128 ? (b += String[_0x7487[21]](d), c++) : d > 191 && d < 224 ? (c2 = a[_0x7487[6]](c + 1), b += String[_0x7487[21]]((31 & d) << 6 | 63 & c2), c += 2) : (c2 = a[_0x7487[6]](c + 1), c3 = a[_0x7487[6]](c + 2), b += String[_0x7487[21]]((15 & d) << 12 | (63 & c2) << 6 | 63 & c3), c += 3);
        }return b;
    }
};

var kuboInfo = exports.kuboInfo = '';

var jwplayer = exports.jwplayer = function jwplayer() {
    return { setup: function setup(a) {
            exports.kuboInfo = kuboInfo = a;
        } };
};