# myuzip.py — Zip Utility Technical Documentation & Test Plan

> **File**: `src/back/util/myuzip.py`
> **Language**: Python 3
> **Lines**: ~83
> **Dependencies**: `os`, `sys`, `shutil`, `zipfile` (all stdlib)
> **Callers**: `mediaHandle-tool.js`, `api-tool-google.js`, `api-tool-playlist.js`
> **Test File**: `src/back/util/myuzip.test.py`
> **Priority**: 🟢 Medium (per OUTLINE §11.2)

---

## Overview

`myuzip.py` is a CLI-invoked Python script that handles zip archive operations with **CJK filename encoding recovery** (CP437 → GBK → Big5 fallback). It is executed as a child process from Node.js via `Child_process.exec()`.

The script is structured as a proper Python module with three importable functions (`decode_filename()`, `extract_entry()`, `main()`) and a `if __name__ == "__main__":` guard, enabling both CLI usage and unit-test imports.

### Three Operating Modes

| Mode | Arguments | Behavior |
|------|-----------|----------|
| **List** | `myuzip.py <zip>` | Print all filenames in the archive (decoded) |
| **Extract All** | `myuzip.py <zip> <folder>` | Extract every file to `<folder>` |
| **Extract Single** | `myuzip.py <zip> <folder> <filename>` | Extract only `<filename>` to `<folder>` |

An optional 5th argument (`sys.argv[4]`) sets the **zip password**.

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Bad zip file / file not found / no arguments (usage error) |
| `3` | Other unexpected errors |

---

## Detailed Logic Flow

```
START
│
├─ IF argc < 2:
│   └─ Print usage message → sys.exit(1)
│
├─ Print "Processing File <zip_path>"
│
├─ TRY:
│   ├─ WITH zipfile.ZipFile(sys.argv[1], "r") as zf:
│   │
│   │   ├─ IF sys.argv[4] exists (5th arg):
│   │   │   └─ Set password: zf.setpassword(argv[4].encode('cp437'))
│   │   │
│   │   └─ FOR each entry name in zf.namelist():
│   │       │
│   │       ├─ utf8name = decode_filename(name)
│   │       │
│   │       ├─ IF argc >= 3 (extraction mode):
│   │       │   ├─ dest = sys.argv[2]
│   │       │   ├─ IF argc >= 4 (extract single):
│   │       │   │   ├─ IF utf8name == sys.argv[3]:
│   │       │   │   │   └─ extract_entry(zf, name, utf8name, dest)
│   │       │   │   └─ ELSE: skip
│   │       │   └─ ELSE (extract all):
│   │       │       └─ extract_entry(zf, name, utf8name, dest)
│   │       │
│   │       └─ ELSE (list mode):
│   │           └─ Print utf8name
│   │
│   ├─ EXCEPT BadZipFile → print error → sys.exit(1)
│   ├─ EXCEPT FileNotFoundError → print error → sys.exit(1)
│   └─ EXCEPT Exception → print error → sys.exit(3)
│
└─ sys.exit(0)
END
```

---

## Function-Level Analysis

> Note: `myuzip.py` is structured as a proper Python module with three importable functions and a `if __name__ == "__main__":` entry point guard.

---

### 1. `decode_filename(name)`

**Purpose**: Decode zip entry names from CP437 to GBK (Simplified Chinese), falling back to Big5 (Traditional Chinese), then raw name.

**Signature**:
```python
def decode_filename(name):
    """Decode CJK filenames: try cp437→gbk, then cp437→big5, fallback to raw name."""
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `name` | `str` | Raw filename from the zip archive's namelist |

**Returns**: `str` — the best-effort decoded filename.

**Side Effects**: None (pure function).

**Key Code** (lines 15–23):
```python
def decode_filename(name):
    try:
        return name.encode('cp437').decode('gbk')
    except (UnicodeDecodeError, UnicodeEncodeError):
        try:
            return name.encode('cp437').decode('big5')
        except (UnicodeDecodeError, UnicodeEncodeError):
            return name
```

**Design Note**: The `except` clauses specifically catch `UnicodeDecodeError` and `UnicodeEncodeError`, targeting only encoding-related failures while allowing other unexpected exceptions to propagate.

#### Test Scenarios — `decode_filename()`

| ID | Scenario | Input Name | Expected Return |
|----|----------|------------|-----------------|
| DF-1 | GBK-encoded Chinese filename | CP437 bytes decodable as GBK | Correctly decoded Simplified Chinese string |
| DF-2 | Big5-encoded Chinese filename | CP437 bytes fail GBK, succeed Big5 | Correctly decoded Traditional Chinese string |
| DF-3 | Pure ASCII filename | `"readme.txt"` | `"readme.txt"` (GBK decode succeeds — ASCII is subset) |
| DF-4 | UTF-8 native filename (modern zip) | Already UTF-8 string | Falls through to raw `name` if CP437 encode fails |
| DF-5 | Japanese Shift-JIS filename | Bytes not valid GBK or Big5 | Falls to raw `name` (possibly garbled) |
| DF-6 | Filename with path separators | `"dir/subdir/文件.txt"` | Path separators preserved through decode |
| DF-7 | Empty string filename | `""` | Empty string returned |
| DF-8 | Filename with mixed encodings | Partial GBK-valid bytes | May decode incorrectly (mojibake) — no validation |
| DF-9 | Very long filename (255+ chars) | Long CJK string | No length check — decoded as-is |
| DF-10 | Non-encoding exception | Input triggers non-Unicode error | Exception propagates (not caught by the specific except clauses) |

**Testability**: As a standalone pure function, `decode_filename()` can be imported and tested directly without subprocess invocation:
```python
from myuzip import decode_filename
assert decode_filename("readme.txt") == "readme.txt"
```

---

### 2. `extract_entry(zf, name, utf8name, dest)`

**Purpose**: Extract a single zip entry to a destination directory, with **Zip Slip protection** and skip-if-exists semantics.

**Signature**:
```python
def extract_entry(zf, name, utf8name, dest):
    """Extract a single zip entry to dest, with Zip Slip protection."""
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `zf` | `zipfile.ZipFile` | Open zip file object |
| `name` | `str` | Raw entry name from the zip archive |
| `utf8name` | `str` | Decoded filename (output of `decode_filename()`) |
| `dest` | `str` | Destination directory path |

**Returns**: `None`. Extraction is a side effect.

**Side Effects**:
- Constructs the full path using `os.path.join(dest, utf8name)` (platform-safe)
- **Zip Slip guard**: validates `os.path.realpath(fullname)` starts with `os.path.realpath(dest) + os.sep`; prints warning and returns early for unsafe paths
- Creates parent directories via `os.makedirs()` as needed
- Opens the zip entry and output file **only** when the destination does not already exist (no wasted I/O)
- Writes file content via `shutil.copyfileobj()` using nested `with` statement for both source and output handles

**Key Code** (lines 26–40):
```python
def extract_entry(zf, name, utf8name, dest):
    fullname = os.path.join(dest, utf8name)
    real_dest = os.path.realpath(dest)
    real_path = os.path.realpath(fullname)
    if not real_path.startswith(real_dest + os.sep) and real_path != real_dest:
        print("Skipping unsafe path: " + utf8name)
        return
    pathname = os.path.dirname(fullname)
    if pathname and not os.path.exists(pathname):
        os.makedirs(pathname)
    if not os.path.exists(fullname):
        print("Extracting " + utf8name)
        with zf.open(name) as source, open(fullname, "wb") as fo:
            shutil.copyfileobj(source, fo)
```

#### Test Scenarios — `extract_entry()`

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| EX-1 | Normal extraction | Valid entry, empty target dir | File created at `dest/utf8name` |
| EX-2 | Nested directories | `utf8name = "a/b/file.txt"` | `a/b/` directories created, file extracted |
| EX-3 | File already exists | Pre-existing file at `fullname` | File is **skipped** (no overwrite, no I/O opened) |
| EX-4 | Zip Slip — relative traversal | `utf8name = "../../etc/passwd"` | Prints "Skipping unsafe path: …" and returns without extraction |
| EX-5 | Zip Slip — absolute path | `utf8name = "/etc/passwd"` | Prints "Skipping unsafe path: …" and returns without extraction |
| EX-6 | Zip Slip — symlink traversal | `dest` contains symlink pointing outside | `os.path.realpath()` resolves symlink; path validated against real dest |
| EX-7 | Directory entry in zip | Entry name ending in `/` | `os.makedirs` creates the directory; no file written |
| EX-8 | CJK filename creates path | GBK-decoded name with `/` | Directory structure from decoded name is created via `os.path.join()` |
| EX-9 | Disk full during extraction | Filesystem has no space | `OSError` raised during write (propagates to caller) |
| EX-10 | Permission denied on target dir | Target dir is read-only | `PermissionError` on `os.makedirs` or `open()` (propagates to caller) |
| EX-11 | `dest` equals `fullname` (root entry) | `utf8name = ""` or entry is dest itself | `real_path == real_dest` check allows it (no false positive skip) |

**Testability**: `extract_entry()` can be tested directly by passing a real or mock `ZipFile` object:
```python
from myuzip import extract_entry
import zipfile, tempfile, os

with tempfile.TemporaryDirectory() as tmp:
    zf = zipfile.ZipFile("test.zip", "r")
    extract_entry(zf, "file.txt", "file.txt", tmp)
    assert os.path.exists(os.path.join(tmp, "file.txt"))
```

---

### 3. `main()`

**Purpose**: CLI entry point. Parses arguments, opens the zip, dispatches to list/extract-all/extract-single mode, and handles errors with distinct exit codes.

**Signature**:
```python
def main():
```

**Parameters**: None (reads from `sys.argv`).

**Returns**: Never returns normally — always calls `sys.exit()`.

**Exit Codes**:
| Code | Condition |
|------|-----------|
| `0` | Successful completion |
| `1` | No arguments / `BadZipFile` / `FileNotFoundError` |
| `3` | Any other `Exception` |

**Side Effects**:
- Prints usage message if no arguments provided
- Opens zip archive in a `with` block (auto-closed on exit or exception)
- Delegates filename decoding to `decode_filename()`
- Delegates extraction to `extract_entry()`
- Prints error messages to stdout on failure

**Key Code** (lines 43–82):
```python
def main():
    if len(sys.argv) < 2:
        print("Usage: myuzip.py <zipfile> [dest] [single_file] [password]")
        sys.exit(1)

    zip_path = sys.argv[1]
    print("Processing File " + zip_path)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            if len(sys.argv) >= 5:
                zf.setpassword(sys.argv[4].encode('cp437'))

            for name in zf.namelist():
                utf8name = decode_filename(name)

                if len(sys.argv) >= 3:
                    dest = sys.argv[2]
                    if len(sys.argv) >= 4:
                        if utf8name == sys.argv[3]:
                            extract_entry(zf, name, utf8name, dest)
                    else:
                        extract_entry(zf, name, utf8name, dest)
                else:
                    print(utf8name)
    except zipfile.BadZipFile:
        print("Error: not a valid zip file")
        sys.exit(1)
    except FileNotFoundError:
        print("Error: file not found: " + zip_path)
        sys.exit(1)
    except Exception as e:
        print("Error: " + str(e))
        sys.exit(3)

    sys.exit(0)

if __name__ == "__main__":
    main()
```

**Invocation** (CLI):
```bash
python3 myuzip.py <zip_path> [folder] [filename] [password]
```

**Parameters** (via `sys.argv`):
| Arg | Index | Required | Description |
|-----|-------|----------|-------------|
| `zip_path` | `sys.argv[1]` | ✅ | Path to the `.zip` file |
| `folder` | `sys.argv[2]` | ❌ | Destination directory for extraction |
| `filename` | `sys.argv[3]` | ❌ | Specific file to extract (decoded name) |
| `password` | `sys.argv[4]` | ❌ | Zip password, encoded via CP437 |

#### Test Scenarios — `main()` / Archive Opening & Error Handling

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| M-1 | Valid zip file | Existing `.zip` path | Opens successfully, prints "Processing File …", exits with code `0` |
| M-2 | Non-existent zip file | Path to missing file | Prints "Error: file not found: …", exits with code `1` |
| M-3 | Corrupt/invalid zip file | Non-zip binary file | Prints "Error: not a valid zip file", exits with code `1` |
| M-4 | No arguments at all | `python3 myuzip.py` | Prints usage message, exits with code `1` |
| M-5 | Password provided (5th arg) | `… archive.zip out/ file.txt p@ss` | `setpassword()` called with `b'p@ss'` (CP437-encoded), exits `0` |
| M-6 | No password (≤4 args) | `… archive.zip out/` | `setpassword()` is never called |
| M-7 | Password with special characters | Unicode password string | `encode('cp437')` may raise `UnicodeEncodeError` → caught by generic `except Exception`, exits `3` |
| M-8 | Password-protected zip without password | Encrypted zip, no 4th arg | `RuntimeError: File is encrypted` → caught by generic `except Exception`, exits `3` |
| M-9 | Empty string password | `… archive.zip out/ file.txt ''` | `setpassword(b'')` called — behavior depends on zip encryption |
| M-10 | Read permissions denied on zip | Zip with `chmod 000` | `PermissionError` → caught by generic `except Exception`, exits `3` |
| M-11 | Usage message content | `python3 myuzip.py` | Stdout contains `"Usage: myuzip.py <zipfile> [dest] [single_file] [password]"` |

---

### 4. List Mode (argc < 3)

**Purpose**: Print all decoded filenames in the zip archive to stdout.

**Invocation**:
```bash
python3 myuzip.py archive.zip
```

**Returns**: Prints each `utf8name` to stdout, one per line. Exits with code `0`.

**Side Effects**: Stdout output only. No filesystem writes.

**Callers**: `mediaHandle-tool.js:322` — used to list zip contents for media handling.

#### Test Scenarios — List Mode

| ID | Scenario | Input | Expected Output |
|----|----------|-------|-----------------|
| L-1 | Normal zip with multiple files | Zip containing 3 files | 3 lines printed (after "Processing File …"), exit code `0` |
| L-2 | Empty zip archive | Zip with 0 entries | Only "Processing File …" printed, exit code `0` |
| L-3 | Zip with directory entries | Zip containing dirs (`folder/`) | Directory entry names printed (e.g., `"folder/"`) |
| L-4 | Zip with CJK filenames | GBK/Big5-encoded names | Correctly decoded names printed |
| L-5 | Zip with nested directory structure | `a/b/c/file.txt` | Full path printed |
| L-6 | Large zip (1000+ entries) | Zip with many files | All names printed; no memory issues |
| L-7 | Password-protected zip (list only) | Encrypted zip, no password | Names are listed (namelist doesn't require password, only content reading does) |

---

### 5. Extract All Mode (argc == 3)

**Purpose**: Extract every file from the zip archive into the specified output directory, preserving directory structure. Delegates to `extract_entry()` for each entry.

**Invocation**:
```bash
python3 myuzip.py archive.zip /output/folder
```

**Returns**: Prints `"Extracting <utf8name>"` for each file. Exits with code `0`.

**Side Effects**:
- Delegates to `extract_entry()` for each entry, which:
  - Validates paths against Zip Slip
  - Creates directories via `os.makedirs()` as needed
  - Constructs paths via `os.path.join()` (platform-safe)
  - Opens source and dest file handles **only** when destination does not exist (no wasted I/O)
  - Writes files to disk via `shutil.copyfileobj()`
- **Skips** files that already exist at the destination (no overwrite)
- **Skips** entries with unsafe traversal paths (Zip Slip protection)

**Callers**:
- `mediaHandle-tool.js:276` — extract zip for media processing
- `api-tool-google.js:734` — extract Google Drive backup zips

#### Test Scenarios — Extract All

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| EA-1 | Normal extraction | Zip with 3 files, empty target dir | All 3 files created in target dir, exit code `0` |
| EA-2 | Nested directories | Zip with `a/b/file.txt` | `a/b/` directories created, file extracted |
| EA-3 | File already exists at destination | Pre-existing file at `fullname` | File is **skipped** (no overwrite, no file handles opened) |
| EA-4 | Empty zip archive | Zip with 0 entries | No files created; only "Processing File …" output, exit code `0` |
| EA-5 | Target directory doesn't exist | Non-existent output folder | Subdirectories created by `os.makedirs` — works if parent exists |
| EA-6 | Directory entry in zip | Entry name ending in `/` | `os.makedirs` creates the directory |
| EA-7 | Large file extraction | Zip containing a 1GB+ file | `shutil.copyfileobj` streams — no full memory load |
| EA-8 | Disk full during extraction | Filesystem has no space | `OSError` raised → caught by generic `except Exception`, exit code `3` |
| EA-9 | Permission denied on target dir | Target dir is read-only | `PermissionError` → caught by generic `except Exception`, exit code `3` |
| EA-10 | CJK filename creates path | GBK-decoded name with `/` | Directory structure from decoded name is created via `os.path.join()` |
| EA-11 | Path traversal in zip (`../`) | Zip with `../../etc/passwd` | **Blocked**: Zip Slip protection prints "Skipping unsafe path: …", no file written |
| EA-12 | Symlink in zip archive | Zip containing symbolic links | Behavior depends on zipfile module version |
| EA-13 | Password-protected zip, correct password | Encrypted zip + matching argv[4] | Files extracted successfully, exit code `0` |
| EA-14 | Password-protected zip, wrong password | Encrypted zip + wrong argv[4] | `RuntimeError` → caught by generic `except Exception`, exit code `3` |
| EA-15 | Zip with duplicate entry names | Two entries with same name | First extracted, second skipped (exists check) |

---

### 6. Extract Single Mode (argc >= 4)

**Purpose**: Extract only a specific file (matched by decoded name) from the zip archive. Delegates to `extract_entry()` for the matching entry.

**Invocation**:
```bash
python3 myuzip.py archive.zip /output/folder "target_file.txt"
# With password:
python3 myuzip.py archive.zip /output/folder "target_file.txt" "password"
```

**Returns**: Prints `"Extracting <utf8name>"` only for the matched file. Exits with code `0`.

**Side Effects**: Same as Extract All, but limited to a single matching file.

**Callers**:
- `api-tool-playlist.js:431,437` — extract specific files from playlists

**Important**: The match compares the **decoded** `utf8name` against `sys.argv[3]`. Callers must supply the decoded name, not the raw zip entry name.

#### Test Scenarios — Extract Single

| ID | Scenario | Input | Expected Outcome |
|----|----------|-------|------------------|
| ES-1 | Exact filename match | Zip has `file.txt`, argv[3] = `"file.txt"` | Single file extracted, exit code `0` |
| ES-2 | No matching filename | Zip has `a.txt`, argv[3] = `"b.txt"` | Nothing extracted; no error, exit code `0` |
| ES-3 | Case-sensitive mismatch | Zip has `File.TXT`, argv[3] = `"file.txt"` | Not matched — no extraction |
| ES-4 | Match with CJK decoded name | Decoded name is `"文件.txt"`, argv[3] = `"文件.txt"` | File extracted |
| ES-5 | Match file in subdirectory | Decoded name is `"sub/file.txt"`, argv[3] = `"sub/file.txt"` | File extracted, directory `sub/` created |
| ES-6 | Multiple entries with same decoded name | Two entries decode to same name | First match extracted, second skipped (exists check) |
| ES-7 | File already exists at destination | Pre-existing file at fullname | File skipped (no overwrite) |
| ES-8 | Password required for single file | Encrypted zip, correct password | File decrypted and extracted |
| ES-9 | Empty filename argument | argv[3] = `""` | Matches only if a zip entry decodes to empty string |
| ES-10 | Filename with spaces and special chars | argv[3] = `"my file (1).txt"` | Exact string match required |
| ES-11 | Path traversal in target filename | argv[3] = `"../../etc/passwd"` | **Blocked**: Zip Slip protection in `extract_entry()` skips the file |

---

## Cross-Cutting Concerns

### Error Handling Summary

| Error Condition | Behavior | Exit Code |
|----------------|----------|-----------|
| No arguments provided | Prints usage message | `1` |
| Invalid zip file (`BadZipFile`) | Prints "Error: not a valid zip file" | `1` |
| File not found (`FileNotFoundError`) | Prints "Error: file not found: …" | `1` |
| Permission denied (`PermissionError`) | Caught by generic `except Exception` | `3` |
| Wrong password (`RuntimeError`) | Caught by generic `except Exception` | `3` |
| Disk full (`OSError`) | Caught by generic `except Exception` | `3` |
| Encoding failures (`UnicodeDecodeError`, `UnicodeEncodeError`) | Caught in `decode_filename()` | N/A (fallback, no exit) |
| Successful completion | All entries processed | `0` |

> **Note**: The script has explicit error handling with distinct exit codes. Common errors (`BadZipFile`, `FileNotFoundError`) exit with code `1`. Other unexpected errors are caught by a generic `except Exception` handler and exit with code `3`. The Node.js callers rely on `Child_process.exec()` callback `err` parameter to detect failures.

### Resource Management

| Resource | Acquired | Released | Risk |
|----------|----------|----------|------|
| `ZipFile` handle | `with zipfile.ZipFile(…) as zf:` | Auto-closed by `with` block | ✅ No leak — `with` ensures cleanup on any exit path |
| `source` (zip entry stream) | `zf.open(name)` inside `with` | Auto-closed by nested `with` | ✅ Only opened when dest doesn't exist |
| `fo` (output file) | `open(fullname, "wb")` inside `with` | Auto-closed by nested `with` | ✅ Only opened when dest doesn't exist |

### Security Considerations

| Risk | Description | Severity |
|------|-------------|----------|
| **Zip Slip (Path Traversal)** | ✅ **Mitigated** — `extract_entry()` validates `os.path.realpath(fullname)` stays within `os.path.realpath(dest)`. Unsafe paths are skipped with a warning. | 🟢 Resolved |
| **Zip Bomb** | No size limits on extraction. A decompression bomb could exhaust disk space. | 🟡 Medium |
| **Exception handling** | ✅ **Fixed** — encoding recovery uses specific `except (UnicodeDecodeError, UnicodeEncodeError):` clauses instead of bare `except:`. | 🟢 Resolved |

---

## Integration Context

### How Node.js Callers Invoke myuzip.py

```javascript
// List mode (mediaHandle-tool.js:322)
`${PathJoin(__dirname, 'util/myuzip.py')} ${filePath}`

// Extract all (mediaHandle-tool.js:276)
`${PathJoin(__dirname, 'util/myuzip.py')} ${zipPath} ${tempPath} '123'`

// Extract single with password (api-tool-playlist.js:431)
`${PathJoin(__dirname, 'util/myuzip.py')} ${filePath}_zip ${realPath} "${regName}"${pwd ? ` '${pwd}'` : " '123'"}`

// Extract all (api-tool-google.js:734)
Child_process.exec(`${PathJoin(__dirname, 'util/myuzip.py')} ${zip} ${dir}`, callback)
```

All callers use `Child_process.exec()` and check the `err` callback for failure. With the new distinct exit codes, callers can differentiate between input errors (exit `1`) and runtime errors (exit `3`).

---

## Test Implementation Strategy

### Framework & Tooling

| Tool | Purpose |
|------|---------|
| `pytest` | Test runner and assertions |
| `subprocess` | Invoke `myuzip.py` as a CLI command (black-box testing) |
| `zipfile` | Create test fixtures programmatically |
| `tempfile` | Isolated temporary directories per test |
| `os` / `shutil` | Filesystem assertions and cleanup |
| `unittest.mock` | Optional — for white-box testing of internal logic |
| `import myuzip` | Direct import for unit-testing `decode_filename()` and `extract_entry()` |

### Test File Location

Per OUTLINE §11.8: `src/back/util/myuzip.test.py`

### Fixture Strategy

```python
import zipfile, tempfile, os

def create_test_zip(tmp_path, entries, password=None):
    """
    Create a zip file with given entries for testing.
    entries: dict of {filename: content_bytes}
    Returns: path to created zip file
    """
    zip_path = os.path.join(tmp_path, "test.zip")
    with zipfile.ZipFile(zip_path, 'w') as zf:
        if password:
            zf.setpassword(password.encode('cp437'))
        for name, content in entries.items():
            zf.writestr(name, content)
    return zip_path
```

### Execution Patterns

**CLI black-box testing** (via subprocess):
```python
import subprocess

def run_myuzip(*args):
    """Run myuzip.py with given arguments, return (returncode, stdout, stderr)."""
    result = subprocess.run(
        ["python3", "src/back/util/myuzip.py", *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout, result.stderr
```

**Unit testing** (via direct import):
```python
# decode_filename() — pure function, no setup needed
from myuzip import decode_filename

def test_ascii_passthrough():
    assert decode_filename("readme.txt") == "readme.txt"

# extract_entry() — needs a real ZipFile and temp directory
from myuzip import extract_entry
import zipfile, tempfile, os

def test_zip_slip_blocked():
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = os.path.join(tmp, "evil.zip")
        with zipfile.ZipFile(zip_path, 'w') as wf:
            wf.writestr("../../etc/passwd", "pwned")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            extract_entry(zf, "../../etc/passwd", "../../etc/passwd", tmp)
            assert not os.path.exists("/etc/passwd_test")  # path was blocked

# main() — exit code assertions via subprocess
def test_no_args_exits_1():
    rc, stdout, _ = run_myuzip()
    assert rc == 1
    assert "Usage:" in stdout

def test_missing_file_exits_1():
    rc, stdout, _ = run_myuzip("/nonexistent/file.zip")
    assert rc == 1
    assert "file not found" in stdout

def test_bad_zip_exits_1(tmp_path):
    bad = os.path.join(str(tmp_path), "bad.zip")
    with open(bad, 'w') as f:
        f.write("not a zip")
    rc, stdout, _ = run_myuzip(bad)
    assert rc == 1
    assert "not a valid zip file" in stdout
```

### Coverage Priority Matrix

| Priority | Category | Test IDs | Rationale |
|----------|----------|----------|-----------|
| 🔴 P0 | Core extraction (happy path) | EA-1, EA-2, ES-1, L-1 | Primary functionality used by all callers |
| 🔴 P0 | Exit codes & error handling | M-2, M-3, M-4, M-11 | Callers depend on exit codes for error detection |
| 🔴 P0 | Zip Slip protection | EX-4, EX-5, EX-6, EA-11, ES-11 | Security-critical — must verify traversal is blocked |
| 🔴 P0 | Password handling | M-5, EA-13, EA-14, M-8 | Used by `mediaHandle-tool.js` and `api-tool-playlist.js` |
| 🟡 P1 | Encoding recovery (`decode_filename`) | DF-1, DF-2, DF-3, DF-4, DF-10 | Core differentiator from stdlib `zipfile.extractall()` |
| 🟡 P1 | Skip-existing behavior | EA-3, EX-3, ES-7, EA-15 | Affects idempotency of repeated extraction |
| 🟡 P1 | No-args usage message | M-4, M-11 | Validates user-facing help |
| 🟢 P2 | Edge cases | L-2, EA-4, ES-2, ES-9, DF-7 | Empty/missing/no-match scenarios |
| 🟢 P2 | Resource management | EX-3, EA-3 | Verify no file handles opened when dest exists |

### Branch Coverage Map

```
Line 17: name.encode('cp437').decode('gbk')       → Success (DF-1) / UnicodeError → line 20
Line 20: name.encode('cp437').decode('big5')       → Success (DF-2) / UnicodeError → line 23 (DF-4)
Line 31: real_path.startswith(real_dest + os.sep)   → True (EX-1) / False → skip (EX-4)
Line 35: pathname and not os.path.exists(pathname)  → True (EX-2) / False
Line 37: not os.path.exists(fullname)              → True (EX-1) / False (EX-3)
Line 44: len(sys.argv) < 2                         → True (M-4) / False (M-1)
Line 52: with zipfile.ZipFile(…)                   → Success / BadZipFile (M-3) / FileNotFoundError (M-2)
Line 53: len(sys.argv) >= 5                        → True (M-5) / False (M-6)
Line 59: len(sys.argv) >= 3                        → True (EA-*) / False (L-*)
Line 61: len(sys.argv) >= 4                        → True (ES-*) / False (EA-*)
Line 62: utf8name == sys.argv[3]                   → True (ES-1) / False (ES-2)
```

**Minimum tests for 100% branch coverage**: 10 tests covering all True/False branches above.

---

## Appendix: Known Limitations — Resolved

All six previously identified limitations have been addressed in the refactored code:

| # | Issue (Previously) | Resolution | How |
|---|-------------------|------------|-----|
| 1 | No `with` statement for `ZipFile` — handle leaks on exception | ✅ **Fixed** | `ZipFile` is now opened via `with zipfile.ZipFile(…) as zf:` — auto-closed on any exit path |
| 2 | `file.open(name)` called before exists-check — wasted I/O | ✅ **Fixed** | `zf.open(name)` moved inside the `if not os.path.exists(fullname)` block within `extract_entry()` |
| 3 | No path traversal protection (Zip Slip) | ✅ **Fixed** | `extract_entry()` validates `os.path.realpath(fullname)` against `os.path.realpath(dest) + os.sep`; unsafe paths are skipped |
| 4 | Bare `except:` catches all exceptions | ✅ **Fixed** | Exception clauses now use `except (UnicodeDecodeError, UnicodeEncodeError):` |
| 5 | Duplicated extraction logic | ✅ **Fixed** | Extraction logic consolidated into `extract_entry()` helper function |
| 6 | No exit code differentiation | ✅ **Fixed** | Distinct exit codes: `0` (success), `1` (bad zip / not found / no args), `3` (other errors) |

### Remaining Considerations

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | **Zip Bomb** — no size limits on extraction | 🟡 Medium | A decompression bomb could exhaust disk space. Consider adding max file size or total extraction size limits. |
| 2 | **No logging** — errors print to stdout only | 🟢 Low | Node.js callers capture stdout; structured logging could aid debugging. |
| 3 | **No progress reporting** — large archives extract silently | 🟢 Low | Could add entry count or byte progress for large extractions. |
