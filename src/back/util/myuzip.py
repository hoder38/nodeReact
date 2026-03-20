#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# uzip.py
# list: xxx.zip
# unzip all: xxx.zip folder
# unzip single: xxx.zip folder unzip_file
# optional password: xxx.zip folder [unzip_file] password

import os
import sys
import shutil
import zipfile


def decode_filename(name):
    """Decode CJK filenames: try cp437→gbk, then cp437→big5, fallback to raw name."""
    try:
        return name.encode('cp437').decode('gbk')
    except (UnicodeDecodeError, UnicodeEncodeError):
        try:
            return name.encode('cp437').decode('big5')
        except (UnicodeDecodeError, UnicodeEncodeError):
            return name


def extract_entry(zf, entry, utf8name, dest):
    """Extract a single zip entry to dest, with Zip Slip protection.
    entry: ZipInfo object or raw name string for zf.open()"""
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
        with zf.open(entry) as source, open(fullname, "wb") as fo:
            shutil.copyfileobj(source, fo)


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

            for info in zf.infolist():
                name = info.filename
                utf8name = decode_filename(name)

                if len(sys.argv) >= 3:
                    dest = sys.argv[2]
                    if len(sys.argv) >= 4:
                        if utf8name == sys.argv[3]:
                            extract_entry(zf, info, utf8name, dest)
                    else:
                        extract_entry(zf, info, utf8name, dest)
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

