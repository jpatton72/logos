#!/usr/bin/env python3
"""Test direct decompression of SWORD bzz/bzs streams."""
import struct, zlib, re

def scan_streams_from_bzz(bzz_path, bzs_path, label, max_show=5):
    """Scan bzz at bzs offsets, decompress each stream."""
    with open(bzz_path, 'rb') as f:
        bzz_data = f.read()
    with open(bzs_path, 'rb') as f:
        bzs_data = f.read()
    
    num_entries = len(bzs_data) // 8
    print(f"\n=== {label} ===")
    print(f"bzz size: {len(bzz_data)}, bzs entries: {num_entries}")
    
    streams = []
    for i in range(num_entries):
        off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
        if off >= len(bzz_data):
            print(f"  Entry {i}: offset {off} >= size, skipping")
            continue
        try:
            # Decompress from offset with given size
            compressed = bzz_data[off:off+size]
            text = zlib.decompress(compressed)
            # Check if it has OSIS content
            is_content = b'<verse' in text or b'<chapter' in text or b'<title' in text
            print(f"  Entry {i}: off={off}, size={size}, extra={extra}, decompressed={len(text)}, has_osis={is_content}")
            if is_content and len(streams) < max_show:
                streams.append((off, size, text.decode('utf-8', errors='replace')[:300]))
        except Exception as e:
            print(f"  Entry {i}: off={off}, size={size}, extra={extra} - FAILED: {e}")
    
    print(f"\n  Content samples:")
    for i, (off, sz, preview) in enumerate(streams):
        print(f"    Stream {i}: {preview[:200]}")
    return streams

# KJV OT
kjv_ot = scan_streams_from_bzz(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzs',
    "KJV OT")
print(f"\nKJV OT: found {len(kjv_ot)} content streams")

# KJV NT
kjv_nt = scan_streams_from_bzz(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzs',
    "KJV NT")
print(f"\nKJV NT: found {len(kjv_nt)} content streams")

# TR Greek
tr_nt = scan_streams_from_bzz(
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz',
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzs',
    "TR Greek NT")
print(f"\nTR Greek NT: found {len(tr_nt)} content streams")

# Deep dive: full text of first KJV OT content stream
print("\n=== KJV OT FIRST CONTENT STREAM (full preview) ===")
if kjv_ot:
    print(kjv_ot[0][2][:2000])

print("\n=== KJV NT FIRST CONTENT STREAM (full preview) ===")
if kjv_nt:
    print(kjv_nt[0][2][:2000])

print("\n=== TR FIRST CONTENT STREAM (full preview) ===")
if tr_nt:
    print(tr_nt[0][2][:2000])

# Westminster genbook
print("\n=== WESTMINSTER GENBOOK .bdt ===")
bdt_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.bdt'
dat_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.dat'
idx_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.idx'

for path, label in [(dat_path,'dat'), (bdt_path,'bdt'), (idx_path,'idx')]:
    if path:
        with open(path, 'rb') as f:
            data = f.read()
        print(f"\n{label}: {len(data)} bytes")
        print(data[:500].decode('utf-8', errors='replace'))