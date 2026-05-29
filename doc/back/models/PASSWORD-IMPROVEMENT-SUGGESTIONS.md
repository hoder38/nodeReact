# Password Mechanism — Improvement & Fix Suggestions

> **Scope**: `src/back/models/password-tool.js`, `src/back/controllers/password-router.js`, `src/back/util/utility.js` (`userPWCheck`)  
> **References**: [OUTLINE.md §7](../../OUTLINE.md) (Authentication & Authorization), [PASSWORD-TOOL.md](./PASSWORD-TOOL.md) (Testing Strategy)  
> **Date**: 2026-05-28

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical — Credential Leaks via console.log](#2-critical--credential-leaks-via-consolelog)
3. [Critical — User Password Hashing (MD5 → bcrypt/argon2)](#3-critical--user-password-hashing-md5--bcryptargon2)
4. [High — Encryption Mode (AES-256-CTR → AES-256-GCM)](#4-high--encryption-mode-aes-256-ctr--aes-256-gcm)
5. [High — Key Derivation (zero-pad → proper KDF)](#5-high--key-derivation-zero-pad--proper-kdf)
6. [High — Deprecated createDecipher in Migration Code](#6-high--deprecated-createdecipher-in-migration-code)
7. [Medium — Password Generation Strength](#7-medium--password-generation-strength)
8. [Medium — Logging Migration (console.log → pino)](#8-medium--logging-migration-consolelog--pino)
9. [Medium — 2FA Improvements](#9-medium--2fa-improvements)
10. [Low — prePassword History Mechanism](#10-low--prepassword-history-mechanism)
11. [Low — userPWCheck Timing & Session Scope](#11-low--userpwcheck-timing--session-scope)
12. [Low — Session Security Hardening](#12-low--session-security-hardening)
13. [Migration Strategy](#13-migration-strategy)
14. [Summary Table](#14-summary-table)

---

## 1. Executive Summary

The password mechanism in ANoMoPi serves two roles:

1. **User authentication**: Login passwords stored as MD5 hashes, verified by `userPWCheck()` in `utility.js`.
2. **Password manager**: Encrypted credential storage using AES-256-CTR, implemented in `password-tool.js`.

Both subsystems have security issues ranging from critical (credential leaks in logs, MD5 hashing) to low (limited password history). This document catalogs each issue with its location in source code, impact assessment, and a concrete fix recommendation.

---

## 2. Critical — Credential Leaks via console.log

### Problem

Both `password-tool.js` and `password-router.js` use `console.log` to dump objects that contain encrypted (or plaintext) password data to stdout. In Docker production environments, stdout is captured to container logs, creating a persistent record of sensitive data.

### Locations

**password-tool.js:**

| Line | Code | Leaked Data |
|------|------|-------------|
| 91–92 | `console.log(item); console.log('save end');` | Full MongoDB insert result including encrypted password |
| 194 | `console.log(update_data);` | Update object with encrypted password, prePassword |
| 315 | `console.log(item);` | MongoDB update result during cipher migration |

**password-router.js** (12 occurrences):

| Lines | Example | Data |
|-------|---------|------|
| 16, 26, 40, 48, 53, 65, 79, 93, 104, 115, 126, 131 | `console.log('password');` | Route identification strings — low risk individually, but combined create a log pattern revealing password manager access patterns |

### Impact

- Encrypted passwords in production Docker logs are accessible to anyone with `docker logs` access.
- Even encrypted values are sensitive — an attacker with log access plus the `PASSWORD_PRIVATE_KEY` (from `ver.js`) can decrypt all logged passwords.
- Access pattern logging reveals which users access the password manager and when.

### Recommendation

1. **Immediately remove** all `console.log` calls from `password-tool.js` that dump password data (lines 91–92, 194, 315).
2. **Replace** `password-router.js` console.log calls with structured pino logging at `debug` level, following the pattern already used in `stock-tool.js` and `bitfinex-tool.js`:
   ```javascript
   import createLogger from '../util/logger.js';
   const log = createLogger('password');
   
   // Replace: console.log('password');
   // With:    log.debug('password query');
   ```
3. **Never log** password fields — even encrypted — in any log level. If debugging is needed, log only the record `_id`.

---

## 3. Critical — User Password Hashing (MD5 → bcrypt/argon2)

### Problem

User login passwords are stored as unsalted MD5 hashes and verified by `userPWCheck()` at `utility.js:110`:

```javascript
if (user.password === createHash('md5').update(pw).digest('hex')) {
```

MD5 is cryptographically broken:
- No salt → identical passwords produce identical hashes (rainbow table attack).
- Fast computation → modern GPUs can compute billions of MD5 hashes/second.
- Known collision attacks since 2004.

### Impact

If the MongoDB database is compromised, all user passwords can be recovered trivially with rainbow tables or brute force.

### Recommendation

1. **Replace with bcrypt** (or argon2id for maximum security):
   ```javascript
   import bcrypt from 'bcrypt';
   
   // Registration/password change:
   const hash = await bcrypt.hash(password, 12);  // cost factor 12
   
   // Login verification:
   const match = await bcrypt.compare(pw, user.password);
   ```
2. **Migration**: On first successful MD5 login, rehash with bcrypt and update the stored hash. Add a field `hashVersion` to user records to distinguish legacy MD5 from bcrypt hashes.
3. **Audit `userPWCheck` callers**: `password-tool.js` uses `userPWCheck` as a gate for important password records. This gate also benefits from the bcrypt upgrade.

### Migration path

```javascript
export async function userPWCheck(user, pw) {
    let valid = false;
    if (user.hashVersion === 2) {
        valid = await bcrypt.compare(pw, user.password);
    } else {
        // Legacy MD5 path
        valid = user.password === createHash('md5').update(pw).digest('hex');
        if (valid) {
            // Upgrade hash on successful login
            const newHash = await bcrypt.hash(pw, 12);
            await Mongo('update', USERDB, { _id: user._id }, {
                $set: { password: newHash, hashVersion: 2 }
            });
        }
    }
    if (valid) {
        pwCheck[user._id] = 1;
        setTimeout(() => pwCheck[user._id] = 0, 70000);
        return true;
    }
    return pwCheck[user._id] === 1;
}
```

---

## 4. High — Encryption Mode (AES-256-CTR → AES-256-GCM)

### Problem

The password manager uses AES-256-CTR (`ALGORITHM = 'aes-256-ctr'` in `constants.js:52`):

```javascript
// password-tool.js:271-276
function encrypt(text) {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
```

CTR mode provides **confidentiality only**, not **authenticity**. This means:
- An attacker who can modify stored ciphertext can flip specific bits to alter the plaintext without detection (bit-flipping attack).
- There is no integrity check — `decrypt()` will happily produce corrupted plaintext without error.

### Recommendation

Switch to **AES-256-GCM**, which provides both confidentiality and authenticity:

```javascript
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
    const iv = randomBytes(12);  // GCM standard: 12-byte IV
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();  // 16-byte authentication tag
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);  // throws on tamper
    return decrypted.toString('utf8');
}
```

**Storage format change**: `ivHex:ciphertextHex` → `ivHex:authTagHex:ciphertextHex`

This requires a migration step (decrypt with old CTR, re-encrypt with GCM) — see [§13 Migration Strategy](#13-migration-strategy).

---

## 5. High — Key Derivation (zero-pad → proper KDF)

### Problem

The encryption key is derived by zero-padding the raw `PASSWORD_PRIVATE_KEY`:

```javascript
// password-tool.js:273
Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex')
```

This:
1. Treats `PASSWORD_PRIVATE_KEY` as a hex string and pads with zero bytes to 32 bytes.
2. Uses **no key derivation function** (KDF) — the key material is used directly.
3. If `PASSWORD_PRIVATE_KEY` is shorter than 64 hex characters (32 bytes), the remaining key bytes are all `0x00`, drastically reducing effective key entropy.

### Recommendation

Use a proper KDF to derive the encryption key from the secret:

```javascript
import { scryptSync } from 'crypto';

// Derive once at module load:
const SALT = Buffer.from(PASSWORD_SALT, 'hex');  // store a fixed salt in ver.js
const derivedKey = scryptSync(PASSWORD_PRIVATE_KEY, SALT, 32, {
    N: 16384, r: 8, p: 1
});
```

**Alternative (simpler)**: If `PASSWORD_PRIVATE_KEY` is already 64 hex chars of high entropy, HKDF (available in Node 15+) is a lighter option:

```javascript
import { hkdfSync } from 'crypto';

const derivedKey = Buffer.from(hkdfSync('sha256', PASSWORD_PRIVATE_KEY, PASSWORD_SALT, 'password-tool', 32));
```

**Note**: Changing the key derivation requires re-encrypting all existing records — coordinate with the CTR→GCM migration in [§13](#13-migration-strategy).

---

## 6. High — Deprecated createDecipher in Migration Code

### Problem

The `updatePasswordCipher` function (lines 289–324) uses the deprecated `createDecipher()` API:

```javascript
// password-tool.js:297, 303
const decipher = createDecipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
```

`createDecipher` was deprecated in Node.js 10 and uses a weak key derivation internally (single iteration of MD5-based EVP_BytesToKey). It exists only to decrypt legacy records that were encrypted with the matching `createCipher`.

### Current Status

This function migrates old-format records (`password.split(':').length === 1`) to the current IV-based format. If all records have been migrated, this code path is dead.

### Recommendation

1. **Verify migration completeness**: Run a query to check for any legacy records:
   ```javascript
   Mongo('find', PASSWORDDB, {
       $or: [
           { password: { $not: /^[0-9a-f]+:[0-9a-f]+$/ } },
           { prePassword: { $not: /^[0-9a-f]+:[0-9a-f]+$/ } },
       ]
   });
   ```
2. **If no legacy records remain**: Remove the `createDecipher` import and the legacy branches in `updatePasswordCipher`. Keep only the current-format re-encryption logic (for future CTR→GCM migration).
3. **If legacy records exist**: Run `updatePasswordCipher` to complete the migration, then remove the deprecated code.

---

## 7. Medium — Password Generation Strength

### Problem

`generatePW` (line 266–268) generates 12-character passwords with three tiers:

```javascript
generatePW: function(type) {
    return (type === 3) ? PasswordGenerator(12, false, /[0-9]/)
         : (type === 2) ? PasswordGenerator(12, false, /[0-9a-zA-Z]/)
         : PasswordGenerator(12, false, /[0-9a-zA-Z!@#$%]/);
}
```

| Type | Charset Size | Entropy (12 chars) |
|------|-------------|-------------------|
| 3 (digits only) | 10 | ~39.9 bits |
| 2 (alphanumeric) | 62 | ~71.4 bits |
| 1 (+ special) | 67 | ~72.4 bits |

### Issues

1. **Type 3 (digits only)**: 39.9 bits is trivially brutable. Even for PIN-style uses, this is weak.
2. **12-character default**: Below the NIST SP 800-63B recommendation of 15+ characters for generated secrets.
3. **Limited special characters**: Only `!@#$%` — many sites require broader special character sets.
4. **No length configurability**: UI cannot request longer passwords.

### Recommendation

```javascript
generatePW: function(type, length = 16) {
    const len = Math.max(length, 12);
    switch (type) {
        case 3: return PasswordGenerator(len, false, /[0-9]/);
        case 2: return PasswordGenerator(len, false, /[0-9a-zA-Z]/);
        default: return PasswordGenerator(len, false, /[0-9a-zA-Z!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
    }
}
```

Alternatively, use `crypto.randomBytes` directly for higher entropy:

```javascript
import { randomBytes } from 'crypto';

function generatePW(type, length = 16) {
    const charsets = {
        3: '0123456789',
        2: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        1: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:,.<>?',
    };
    const charset = charsets[type] || charsets[1];
    const bytes = randomBytes(length);
    return Array.from(bytes, b => charset[b % charset.length]).join('');
}
```

---

## 8. Medium — Logging Migration (console.log → pino)

### Problem

`password-tool.js` and `password-router.js` are among the last modules still using `console.log`. The project's standard logging system uses **pino** via `createLogger()` (see [OUTLINE.md §3.6](../../OUTLINE.md)).

### Current State

| Module | console.log count | Uses pino? |
|--------|------------------|------------|
| `password-tool.js` | 4 | No |
| `password-router.js` | 12 | No |
| `stock-tool.js` | 0 | Yes (`createLogger('stock')`) |
| `bitfinex-tool.js` | 0 | Yes (`createLogger('bitfinex')`) |

### Recommendation

1. Add `import createLogger from '../util/logger.js'` (or `../../util/logger.js` for models) to both files.
2. Replace all `console.log` with structured `log.debug()` calls.
3. **Never include password fields** in log payloads — only `_id`, `name`, `owner`, and non-sensitive metadata.

```javascript
// password-tool.js
import createLogger from '../../util/logger.js';
const log = createLogger('password');

// Line 91-92: Replace console.log(item) / 'save end'
log.debug({ id: item[0]._id }, 'password row saved');

// Line 194: Replace console.log(update_data)
log.debug({ id: pws[0]._id, fields: Object.keys(update_data) }, 'password row updated');

// Line 315: Replace console.log(item)
log.debug({ id: items[index]._id }, 'cipher migrated');
```

```javascript
// password-router.js
import createLogger from '../util/logger.js';
const log = createLogger('password-router');

// Line 16: Replace console.log('password')
log.debug('password query');
```

---

## 9. ~~Medium — 2FA Improvements~~ (REMOVED)

> **Status**: The entire 2FA verification mechanism was removed from the codebase as of Phase 1 implementation.
> The 4-digit verify code feature (`VERIFYDB`, `/api/user/verify`, frontend verify button) has been
> deleted from both frontend and backend. This section is no longer applicable.

---

## 10. Low — prePassword History Mechanism

### Current Implementation

Each password record stores exactly one previous password:

```javascript
// newRow (line 83): initial prePassword = password (same value)
prePassword: crypted_password,

// editRow (line 191): on update, old password becomes prePassword
prePassword: pws[0].password,
```

Users can retrieve the previous password via `getPassword(uid, userPW, user, session, 'pre')`.

### Issues

1. **History depth of 1**: Only the immediately previous password is stored. Multi-generation history would help users recall older credentials.
2. **Initial state**: On creation, `prePassword === password` — the "previous" password is the current one, which is misleading.
3. **No timestamp on prePassword**: No way to know when the previous password was active.

### Recommendation

If password history is a valued feature:

```javascript
// Replace prePassword with a history array (most recent first)
passwordHistory: [
    { password: encryptedValue, changedAt: unixTimestamp },
    // ... up to N entries
]
```

If it's rarely used, consider deprecating it in favor of simpler CRUD. The current implementation is functional but minimal.

---

## 11. Low — userPWCheck Timing & Session Scope

### Current Implementation

```javascript
// utility.js:109-118
export function userPWCheck(user, pw) {
    if (user.password === createHash('md5').update(pw).digest('hex')) {
        pwCheck[user._id] = 1;
        setTimeout(() => pwCheck[user._id] = 0, 70000);
        return true;
    } else if (pwCheck[user._id] === 1) {
        return true;
    } else {
        return false;
    }
}
```

### Issues

1. **In-memory cache (`pwCheck`)**: The 70-second window is stored in process memory, not Redis. If the server restarts, all active windows are lost. In a multi-process or multi-server deployment, the window is not shared.
2. **No brute-force protection**: No attempt counter; an attacker can call `userPWCheck` unlimited times.
3. **Constant-time comparison missing**: String `===` comparison is vulnerable to timing attacks (though the MD5 hash makes this less practical).
4. **70-second window**: After one successful `userPWCheck`, all subsequent calls for that user pass for 70 seconds — regardless of which password entry is being accessed. This could allow access to other important entries without re-verification.

### Recommendation

1. **Move cache to Redis** with TTL:
   ```javascript
   await Redis.set(`pwcheck:${user._id}`, '1', 'EX', 70);
   ```
2. **Add attempt limiting**: After 5 failed attempts, lock for 5 minutes.
3. **Use `crypto.timingSafeEqual`** for hash comparison (after bcrypt migration, bcrypt.compare handles this internally).
4. **Consider per-entry scoping**: Tie the verification window to a specific password record `_id`, not just the user.

---

## 12. Low — Session Security Hardening

### Current State (from OUTLINE.md §7.3)

- Redis-backed sessions with 3-day secure cookies
- HTTPS-only cookies

### Recommendation

1. **Add `sameSite: 'strict'`** (or `'lax'`) to session cookie configuration to prevent CSRF.
2. **Rotate session ID** on login (`req.session.regenerate()`) to prevent session fixation.
3. **Implement session invalidation** on password change — force re-login on all devices.
4. **Add IP binding** (optional, strict): Store client IP in session; reject if it changes.

---

## 13. Migration Strategy

Upgrading the encryption (§4, §5) and hashing (§3) requires careful migration. Recommended order:

### Phase 1: Immediate fixes (no data migration) — ✅ IMPLEMENTED

1. ✅ Removed `console.log` credential leaks from `password-tool.js` — replaced with pino `log.debug`/`log.info` (§2)
2. ✅ Migrated `password-router.js` to pino structured logging (§8)
3. ✅ Removed deprecated `createDecipher` — `updatePasswordCipher` now validates that no legacy records remain instead of migrating (§6)
4. ✅ Removed 2FA verification mechanism entirely (§9) — deleted `VERIFYDB`, `/api/user/verify`, frontend verify button, login verify fallback

### Phase 2: User password hashing upgrade

1. Add `hashVersion` field to user schema (default `1` for MD5).
2. Deploy upgraded `userPWCheck` with dual-path verification.
3. As users log in, their hashes are transparently upgraded to bcrypt.
4. After sufficient time, force remaining users to reset passwords.

### Phase 3: Password manager encryption upgrade

1. **Deploy new encrypt/decrypt** supporting both CTR (legacy read) and GCM (new write).
2. **Run batch migration**: Modify `updatePasswordCipher` to:
   a. Decrypt with old key derivation + CTR.
   b. Re-encrypt with new KDF + GCM.
   c. Update storage format to include auth tag.
3. **Remove CTR support** after all records are migrated.
4. **Verify**: Count records not matching the new `ivHex:authTagHex:ciphertextHex` format.

### Storage format evolution

```
v1 (legacy):   ciphertextHex                     (createCipher, no IV)
v2 (current):  ivHex:ciphertextHex               (createCipheriv, AES-256-CTR)
v3 (target):   ivHex:authTagHex:ciphertextHex    (createCipheriv, AES-256-GCM + KDF)
```

---

## 14. Summary Table

| # | Issue | Severity | Effort | Section |
|---|-------|----------|--------|---------|
| 1 | console.log leaks encrypted passwords | 🔴 Critical | Low | [§2](#2-critical--credential-leaks-via-consolelog) |
| 2 | MD5 user password hashing | 🔴 Critical | Medium | [§3](#3-critical--user-password-hashing-md5--bcryptargon2) |
| 3 | AES-256-CTR lacks authentication | 🟠 High | Medium | [§4](#4-high--encryption-mode-aes-256-ctr--aes-256-gcm) |
| 4 | No key derivation function | 🟠 High | Medium | [§5](#5-high--key-derivation-zero-pad--proper-kdf) |
| 5 | Deprecated createDecipher API | 🟠 High | Low | [§6](#6-high--deprecated-createdecipher-in-migration-code) |
| 6 | Weak password generation defaults | 🟡 Medium | Low | [§7](#7-medium--password-generation-strength) |
| 7 | Unmigrated logging (console.log) | 🟡 Medium | Low | [§8](#8-medium--logging-migration-consolelog--pino) |
| 8 | ~~2FA: 4-digit code, no rate limit~~ | ~~🟡 Medium~~ | ~~Medium~~ | [§9](#9-medium--2fa-improvements) — **REMOVED** |
| 9 | prePassword history depth of 1 | 🔵 Low | Low | [§10](#10-low--prepassword-history-mechanism) |
| 10 | userPWCheck in-memory, no brute-force limit | 🔵 Low | Medium | [§11](#11-low--userpwcheck-timing--session-scope) |
| 11 | Session cookie hardening | 🔵 Low | Low | [§12](#12-low--session-security-hardening) |

---

> **Document Version**: 1.1  
> **Created**: 2026-05-28  
> **Updated**: 2026-05-29 — Phase 1 implemented, §9 (2FA) removed  
> **Source Analysis**: `password-tool.js` (324 lines), `password-router.js` (135 lines), `utility.js:109-118` (`userPWCheck`), OUTLINE.md §7, PASSWORD-TOOL.md
