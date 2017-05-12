#!/usr/bin/env python
# -*- coding: utf-8 -*-
# uzip.py
# list: xxx.zip
# unzip all: xxx.zip folder
# unzip single: xxx.zip folder unzip_file

import os
import sys
import shutil
import zipfile

reload(sys)
sys.setdefaultencoding('utf8')

print "Processing File " + sys.argv[1]

file=zipfile.ZipFile(sys.argv[1],"r");

if len(sys.argv) >= 5:
    file.setpassword(sys.argv[4])

for name in file.namelist():
    try:
        utf8name=name.decode('gbk')
    except:
        try:
            utf8name=name.decode('big5')
        except:
            utf8name=name
    if len(sys.argv) >= 3:
        if len(sys.argv) >= 4:
            if utf8name == sys.argv[3]:
                print "Extracting " + utf8name
                fullname = sys.argv[2] + "/" + utf8name
                pathname = os.path.dirname(fullname)
                if not os.path.exists(pathname) and pathname!= "":
                    os.makedirs(pathname)
                source = file.open(name)
                if not os.path.exists(fullname):
                    fo = open(fullname, "wb")
                    with source, fo:
                        shutil.copyfileobj(source, fo)
        else:
            print "Extracting " + utf8name
            fullname = sys.argv[2] + "/" + utf8name
            pathname = os.path.dirname(fullname)
            if not os.path.exists(pathname) and pathname!= "":
                os.makedirs(pathname)
            source = file.open(name)
            if not os.path.exists(fullname):
                fo = open(fullname, "wb")
                with source, fo:
                    shutil.copyfileobj(source, fo)
    else:
        print utf8name
file.close()

