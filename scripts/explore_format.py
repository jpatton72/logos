#!/usr/bin/env python3
"""Explore SWORD zText and Westminster genbook formats."""
import struct, zlib, re, os

# 1. Explore Westminster genbook
print("=== WESTMINSTER GENBOOK ===")
dat_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.dat'
bdt_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.bdt'
idx_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.idx'

for path in [dat_path, bdt_path, idx_path]:
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        print(f"\n{path} ({len(data)} bytes):")
        # Show hex of first 200 bytes
        hex_str = ' '.join(f'{b:02x}' for b in data[:200])
        print(f"  Hex: {hex_str}")
        # Try to decode as text
        text = data[:2000].decode('utf-8', errors='replace')
        print(f"  Text preview:\n{text[:500]}")

print("\n=== KJV OT bzz/bzs ===")
kjv_ot_bzz = '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz'
kjv_ot_bzs = '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzs'

with open(kjv_ot_bzs, 'rb') as f:
    bzs_data = f.read()
print(f"bzs size: {len(bzs_data)} bytes")
# Each entry: 4 bytes offset, 2 bytes size, 2 bytes something
entry_size = 8
num_entries = len(bzs_data) // entry_size
print(f"Number of entries: {num_entries}")
print(f"First 10 entries (offset, size):")
for i in range(min(10, num_entries)):
    off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
    print(f"  [{i}] offset={off}, size={size}, extra={extra}")

# Now decompress streams
with open(kjv_ot_bzz, 'rb') as f:
    bzz_data = f.read()
print(f"\nbzz size: {len(bzz_data)} bytes")

streams = []
pos = 0
stream_num = 0
while pos < len(bzz_data):
    try:
        d = zlib.decompressobj()
        chunk = bzz_data[pos:pos+65536]
        dec = d.decompress(chunk)
        consumed = len(chunk) - len(d.unused_data)
        if consumed > 0 and (dec or consumed < len(chunk)):
            streams.append((pos, consumed, dec[:200].decode('utf-8', errors='replace')))
            pos += consumed
            stream_num += 1
            if stream_num >= 5:
                break
        else:
            break
    except Exception as e:
        print(f"Error at pos {pos}: {e}")
        break

print(f"\nFirst {len(streams)} streams:")
for i, (pos, size, preview) in enumerate(streams):
    print(f"  Stream {i}: pos={pos}, size={size}")
    print(f"    Preview: {preview[:150]}")

print("\n=== KJV NT bzz/bzs ===")
kjv_nt_bzz = '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz'
kjv_nt_bzs = '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzs'

with open(kjv_nt_bzs, 'rb') as f:
    bzs_data = f.read()
print(f"NT bzs size: {len(bzs_data)} bytes")
num_entries = len(bzs_data) // 8
print(f"Number of NT entries: {num_entries}")
for i in range(min(3, num_entries)):
    off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
    print(f"  [{i}] offset={off}, size={size}, extra={extra}")

# Decompress NT
with open(kjv_nt_bzz, 'rb') as f:
    bzz_data = f.read()
print(f"NT bzz size: {len(bzz_data)} bytes")

streams = []
pos = 0
stream_num = 0
while pos < len(bzz_data):
    try:
        d = zlib.decompressobj()
        chunk = bzz_data[pos:pos+65536]
        dec = d.decompress(chunk)
        consumed = len(chunk) - len(d.unused_data)
        if consumed > 0 and (dec or consumed < len(chunk)):
            streams.append((pos, consumed, dec.decode('utf-8', errors='replace')[:500]))
            pos += consumed
            stream_num += 1
            if stream_num >= 3:
                break
        else:
            break
    except Exception as e:
        print(f"Error at pos {pos}: {e}")
        break

print(f"\nFirst {len(streams)} NT streams:")
for i, (pos, size, preview) in enumerate(streams):
    print(f"  Stream {i}: pos={pos}, size={size}")
    print(f"    Preview: {preview[:400]}")

print("\n=== TR Greek NT bzz/bzs ===")
tr_bzz = '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz'
tr_bzs = '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzs'

with open(tr_bzs, 'rb') as f:
    bzs_data = f.read()
print(f"TR bzs size: {len(bzs_data)} bytes")
num_entries = len(bzs_data) // 8
print(f"Number of TR entries: {num_entries}")
for i in range(min(3, num_entries)):
    off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
    print(f"  [{i}] offset={off}, size={size}, extra={extra}")

with open(tr_bzz, 'rb') as f:
    bzz_data = f.read()
print(f"TR bzz size: {len(bzz_data)} bytes")

streams = []
pos = 0
stream_num = 0
while pos < len(bzz_data):
    try:
        d = zlib.decompressobj()
        chunk = bzz_data[pos:pos+65536]
        dec = d.decompress(chunk)
        consumed = len(chunk) - len(d.unused_data)
        if consumed > 0 and (dec or consumed < len(chunk)):
            streams.append((pos, consumed, dec.decode('utf-8', errors='replace')[:500]))
            pos += consumed
            stream_num += 1
            if stream_num >= 3:
                break
        else:
            break
    except Exception as e:
        print(f"Error at pos {pos}: {e}")
        break

print(f"\nFirst {len(streams)} TR streams:")
for i, (pos, size, preview) in enumerate(streams):
    print(f"  Stream {i}: pos={pos}, size={size}")
    print(f"    Preview: {preview[:400]}")