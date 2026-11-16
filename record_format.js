var GolfLabRecordFormat = (function () {
  "use strict";

  var MAGIC = Object.freeze([0x47, 0x4c, 0x52, 0x43]);
  var IV_BYTES = 12;
  var TAG_BITS = 128;
  var TAG_BYTES = 16;
  var FIXED_BYTES = 14;
  var U32_MAX = 4294967295;
  var AES_KEY = Object.freeze({ name: "AES-GCM", length: 256 });

  var FORM_VERSION = 1;
  var ITERATIONS = 600000;
  var SALT_BYTES = 16;
  var LIMITS = Object.freeze({
    iterMin: 100000, iterMax: 10000000,
    saltMin: 16, saltMax: 64,
    fileMax: 4194304,
  });

  function readU32(u8, pos) {
    return new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(pos, false);
  }

  function writeU32(u8, pos, value) {
    new DataView(u8.buffer, u8.byteOffset, u8.byteLength).setUint32(pos, value, false);
  }

  function parseHeader(bytes) {
    var tag = Object.prototype.toString.call(bytes);
    var u8;
    if (tag === "[object ArrayBuffer]") u8 = new Uint8Array(bytes);
    else if (tag === "[object Uint8Array]") u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    else return { ok: false, reason: "記録の型が違う" };
    if (u8.length > LIMITS.fileMax) return { ok: false, reason: "記録が大きすぎる" };
    if (u8.length < FIXED_BYTES) return { ok: false, reason: "記録が短い" };
    for (var i = 0; i < MAGIC.length; i++) {
      if (u8[i] !== MAGIC[i]) return { ok: false, reason: "目じるしが違う" };
    }
    var form = u8[4];
    if (form !== FORM_VERSION) return { ok: false, reason: "形の版が違う" };
    var iterations = readU32(u8, 5);
    if (iterations < LIMITS.iterMin || iterations > LIMITS.iterMax) {
      return { ok: false, reason: "反復回数が範囲の外" };
    }
    var n = readU32(u8, 9);
    if (n < 1) return { ok: false, reason: "公開の番号が範囲の外" };
    var ls = u8[13];
    if (ls < LIMITS.saltMin || ls > LIMITS.saltMax) return { ok: false, reason: "salt の長さが範囲の外" };
    var h = FIXED_BYTES + ls + IV_BYTES;
    if (u8.length < h + TAG_BYTES + 1) return { ok: false, reason: "記録が短い" };
    return {
      ok: true,
      header: {
        form: form, iterations: iterations, n: n,
        salt: u8.slice(FIXED_BYTES, FIXED_BYTES + ls),
        iv: u8.slice(FIXED_BYTES + ls, h),
      },
      aad: u8.slice(0, h),
      body: u8.slice(h),
    };
  }

  function readFixed(bytes) {
    var tag = Object.prototype.toString.call(bytes);
    var u8;
    if (tag === "[object ArrayBuffer]") u8 = new Uint8Array(bytes);
    else if (tag === "[object Uint8Array]") u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    else return { ok: false, reason: "記録の型が違う" };
    if (u8.length > LIMITS.fileMax) return { ok: false, reason: "記録が大きすぎる" };
    if (u8.length < FIXED_BYTES) return { ok: false, reason: "記録が短い" };
    for (var i = 0; i < MAGIC.length; i++) {
      if (u8[i] !== MAGIC[i]) return { ok: false, reason: "目じるしが違う" };
    }
    var n = readU32(u8, 9);
    if (n < 1) return { ok: false, reason: "公開の番号が範囲の外" };
    return { ok: true, form: u8[4], n: n };
  }

  function encodeHeader(h) {
    if (h === null || typeof h !== "object") return { ok: false, reason: "頭の値が無い" };
    if (h.form !== FORM_VERSION) return { ok: false, reason: "形の版が違う" };
    var it = h.iterations;
    if (typeof it !== "number" || !Number.isInteger(it) || it < LIMITS.iterMin || it > LIMITS.iterMax) {
      return { ok: false, reason: "反復回数が範囲の外" };
    }
    var n = h.n;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > U32_MAX) {
      return { ok: false, reason: "公開の番号が範囲の外" };
    }
    var salt = h.salt;
    if (Object.prototype.toString.call(salt) !== "[object Uint8Array]") return { ok: false, reason: "salt の型が違う" };
    if (salt.length < LIMITS.saltMin || salt.length > LIMITS.saltMax) return { ok: false, reason: "salt の長さが範囲の外" };
    var iv = h.iv;
    if (Object.prototype.toString.call(iv) !== "[object Uint8Array]") return { ok: false, reason: "IV の型が違う" };
    if (iv.length !== IV_BYTES) return { ok: false, reason: "IV の長さが違う" };
    var ls = salt.length;
    var out = new Uint8Array(FIXED_BYTES + ls + IV_BYTES);
    for (var i = 0; i < MAGIC.length; i++) out[i] = MAGIC[i];
    out[4] = FORM_VERSION;
    writeU32(out, 5, it);
    writeU32(out, 9, n);
    out[13] = ls;
    out.set(salt, FIXED_BYTES);
    out.set(iv, FIXED_BYTES + ls);
    return { ok: true, bytes: out };
  }

  function joinRecord(headerBytes, body) {
    var out = new Uint8Array(headerBytes.length + body.length);
    out.set(headerBytes, 0);
    out.set(body, headerBytes.length);
    return out;
  }

  function versionOf(form, dataV) {
    if (typeof form !== "number" || !Number.isSafeInteger(form) || form < 1) return null;
    if (typeof dataV !== "number" || !Number.isSafeInteger(dataV) || dataV < 1) return null;
    return String(form) + "." + String(dataV);
  }

  function kdfParams(header) {
    return { name: "PBKDF2", hash: "SHA-256", salt: header.salt, iterations: header.iterations };
  }

  function gcmParams(header, aad) {
    return { name: "AES-GCM", iv: header.iv, additionalData: aad, tagLength: TAG_BITS };
  }

  function params() {
    return {
      FORM_VERSION: FORM_VERSION,
      ITERATIONS: ITERATIONS,
      SALT_BYTES: SALT_BYTES,
      LIMITS: {
        iterMin: LIMITS.iterMin, iterMax: LIMITS.iterMax,
        saltMin: LIMITS.saltMin, saltMax: LIMITS.saltMax,
        fileMax: LIMITS.fileMax,
      },
      IV_BYTES: IV_BYTES,
      TAG_BITS: TAG_BITS,
    };
  }

  return Object.freeze({
    MAGIC: MAGIC, FORM_VERSION: FORM_VERSION, ITERATIONS: ITERATIONS, SALT_BYTES: SALT_BYTES,
    LIMITS: LIMITS, IV_BYTES: IV_BYTES, TAG_BITS: TAG_BITS, AES_KEY: AES_KEY,
    parseHeader: parseHeader, readFixed: readFixed, encodeHeader: encodeHeader, joinRecord: joinRecord,
    versionOf: versionOf, kdfParams: kdfParams, gcmParams: gcmParams, params: params,
  });
})();

if (typeof module !== "undefined" && module.exports) module.exports = GolfLabRecordFormat;
