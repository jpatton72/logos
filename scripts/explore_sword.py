#!/usr/bin/env python3
import zipfile, os, sys

# Extract westminster
with zipfile.ZipFile('/tmp/sword_modules/westminster.zip', 'r') as z:
    print('Files in westminster.zip:')
    for name in z.namelist():
        print(' ', name)
    print()
    z.extractall('/tmp/sword_modules/')
print('Extracted.')

# Find westminster files
for root, dirs, files in os.walk('/tmp/sword_modules/westminster_ext'):
    for f in files:
        fp = os.path.join(root, f)
        print(f'  {fp} ({os.path.getsize(fp)} bytes)')