# Technical Documentation: `myuzip.py` Utility (`src/back/util/myuzip.py`)

## 1. Overview
`myuzip.py` is a standalone Python utility designed to handle ZIP archives with a specific focus on correcting filename encoding issues common in archives created on legacy Chinese systems (using GBK or Big5). It provides functionality for listing, full extraction, and targeted single-file extraction, supporting password-protected archives.

**Testing Reference:** This documentation aligns with the **Utility Functions** and **Functional Testing** (Media Processing) sections defined in `doc/OUTLINE.md`.

---

## 2. Module: Main Initialization & Encoding Correction

### Purpose
To initialize the ZIP archive interface, handle password authentication, and resolve "mojibake" (encoding errors) in filenames.

### Logic Flow
1. **Argument Parsing**: Reads the target ZIP path from `sys.argv[1]`.
2. **Archive Opening**: Initializes `zipfile.ZipFile` in read mode.
3. **Password Configuration**: If a 4th argument exists, it encodes the string to `cp437` and sets it as the archive password.
4. **Encoding Decision Tree (Per File)**:
   - Attempt: `encode('cp437').decode('gbk')`.
   - If Fail: Attempt `encode('cp437').decode('big5')`.
   - If Fail: Fallback to the raw `name` string.

### Invocation & Authentication
- **Signature**: `python3 myuzip.py <zip_path> [output_dir] [target_file] [password]`
- **Authentication**: Uses the 4th command-line argument for archive-level password decryption.
- **Permissions**: Requires read permission on the source file and execution permission for the Python interpreter.

### Returns & Side Effects
- **Returns**: Prints "Processing File [path]" to stdout.
- **Side Effects**: Consumes system memory relative to the ZIP central directory size.

### Snapshot Testing Data
```python
# Representative file name mapping for snapshot validation
{
    "raw_cp437": "test\u00b0\u00a1.txt", 
    "decoded_gbk": "测试.txt",
    "decoded_big5": "測試.big5"
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Branch: Password Provided**: Verify `file.setpassword()` is called when `len(sys.argv) >= 5`.
- **Branch: No Password**: Verify script proceeds without password when arguments are $< 5$.
- **Branch: Encoding Path (GBK)**: Trigger the first `try` block with a GBK-encoded filename.
- **Branch: Encoding Path (Big5)**: Trigger the first `except` and second `try` block with a Big5-encoded filename.
- **Branch: Encoding Path (Fallback)**: Trigger both `except` blocks with a non-Chinese/standard UTF-8 filename.

#### Edge Cases
- **Non-ZIP File**: Provide a valid path to a text file. Expected: `zipfile.BadZipFile` error.
- **Zero-Length Filenames**: ZIP entry with an empty name.
- **Very Long Filenames**: Filenames exceeding OS limits (e.g., > 255 chars).

#### Error Handling
- **Missing Argument**: Run script without any arguments. Expected: `IndexError`.
- **Invalid Password**: Provide a password that doesn't match the archive. Expected: `RuntimeError` during extraction.

#### Auth/Login Scenarios
- **Unauthenticated**: Attempt to open a password-protected ZIP without providing the 4th argument.
- **Authorized**: Provide correct password for a protected ZIP.

---

## 3. Module: Mode - Directory Listing (Default)

### Purpose
To output the correctly decoded filenames of all entries within the ZIP archive to the console.

### Logic Flow
1. Detects that `sys.argv` length is less than 3.
2. Iterates through the archive.
3. Prints each `utf8name` to `stdout`.

### Invocation & Authentication
- **Trigger**: `python3 myuzip.py <zip_path>` (Arg count < 3).

### Returns & Side Effects
- **Returns**: A stream of decoded filenames.
- **Side Effects**: None.

### Comprehensive Test Scenarios

#### Logical Branches
- **Branch: Root Entries**: Verify files in the ZIP root are listed.
- **Branch: Nested Entries**: Verify files inside internal directories are listed.

---

## 4. Module: Mode - Batch & Targeted Extraction

### Purpose
To extract either the entire contents of an archive or a specific named file into a designated output directory.

### Logic Flow
1. **Directory Validation**: 
   - Checks if `sys.argv[2]` (output folder) exists.
   - Calculates `fullname` (output folder + decoded filename).
   - Extracts the directory path from `fullname`.
2. **Sub-directory Management**: If the internal path for a file doesn't exist, it creates it using `os.makedirs`.
3. **Filtering (Targeted Mode)**:
   - If `sys.argv[3]` exists, it only proceeds if `utf8name == sys.argv[3]`.
   - If `sys.argv[3]` is absent, it extracts every file.
4. **File Writing**: 
   - Checks `if not os.path.exists(fullname)` to avoid overwriting.
   - Opens the ZIP source stream.
   - Writes binary data to the destination using `shutil.copyfileobj`.

### Invocation & Authentication
- **Batch Signature**: `python3 myuzip.py <zip_path> <output_dir>`
- **Targeted Signature**: `python3 myuzip.py <zip_path> <output_dir> <target_filename>`

### Returns & Side Effects
- **Returns**: Prints "Extracting [filename]" to stdout for each successful match.
- **Side Effects**: Creates directories and writes files to the local file system.

### Comprehensive Test Scenarios

#### Logical Branches
- **Branch: Targeted Match**: Verify extraction only happens when `utf8name` exactly matches `sys.argv[3]`.
- **Branch: Batch Extraction**: Verify all files are extracted when `sys.argv[3]` is omitted.
- **Branch: Recursive Directory Creation**: Verify `os.makedirs` is called for files in nested ZIP folders.

#### Edge Cases
- **Existing File**: Attempt to extract into a folder where a file with the same name already exists. Expected: Script skips extraction (no overwrite).
- **Target File with Spaces**: Verify `sys.argv[3]` handles filenames with spaces correctly when quoted in CLI.
- **Relative vs Absolute Paths**: Test `sys.argv[2]` with both `.` (current dir) and `/tmp/output`.

#### Error Handling
- **ReadOnly Filesystem**: Attempt extraction into a directory without write permissions. Expected: `OSError`.
- **Disk Full**: Verify behavior when storage is exhausted during `shutil.copyfileobj`.
