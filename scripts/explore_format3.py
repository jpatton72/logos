#!/usr/bin/env python3
"""Test SWORD stream scanning - decompress chunks sequentially."""
import struct, zlib, re

def scan_all_streams(bzz_path, max_streams=None, label=""):
    """Scan through bzz decompressing sequential chunks, detect book boundaries."""
    with open(bzz_path, 'rb') as f:
        data = f.read()
    
    streams = []
    pos = 0
    stream_num = 0
    
    while pos < len(data):
        d = zlib.decompressobj()
        try:
            # Try to decompress a chunk
            chunk_end = min(pos + 65536, len(data))
            dec = d.decompress(data[pos:chunk_end])
            
            # Figure out how much was consumed
            if d.unused_data:
                consumed = len(data) - len(d.unused_data) - pos
            else:
                consumed = chunk_end - pos
            
            if consumed <= 0:
                break
            
            if dec:
                text = dec.decode('utf-8', errors='replace')
                # Check what this stream contains
                book_match = re.search(r'osisID="([A-Za-z1-9]+)"', text)
                book_name = book_match.group(1) if book_match else "?"
                chap_count = len(re.findall(r'<chapter[^>]+>', text))
                streams.append((pos, consumed, len(dec), book_name, chap_count))
                
            pos += consumed
            stream_num += 1
            
            if max_streams and stream_num >= max_streams:
                break
        except Exception as e:
            pos += 1  # Skip bad byte and try again
    
    print(f"\n=== {label} ({len(streams)} streams) ===")
    print(f"bzz size: {len(data)}")
    for i, (pos, comp, uncomp, book, chaps) in enumerate(streams[:20]):
        print(f"  [{i:2d}] pos={pos:7d}, comp={comp:6d}, uncomp={uncomp:7d}, book={book:8s}, chapters={chaps}")
    if len(streams) > 20:
        print(f"  ... ({len(streams)} total streams)")
    
    return streams

# KJV OT
kjv_ot = scan_all_streams(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz',
    max_streams=60, label="KJV OT")

# KJV NT
kjv_nt = scan_all_streams(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz',
    max_streams=30, label="KJV NT")

# TR Greek NT
tr_nt = scan_all_streams(
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz',
    max_streams=30, label="TR Greek NT")

# Now check what Westminster genbook .dat looks like (uncompressed?)
print("\n=== WESTMINSTER GENBOOK ===")
dat_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.dat'
idx_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.idx'

with open(idx_path, 'rb') as f:
    idx_data = f.read()
print(f"idx size: {len(idx_data)} bytes")
# Try to parse as index: entries of some size
# Check for different entry sizes
for entry_size in [8, 12, 16, 20]:
    n = len(idx_data) // entry_size
    print(f"  entry_size={entry_size} -> {n} entries")
    if n > 0:
        for i in range(min(5, n)):
            entry = idx_data[i*entry_size:(i+1)*entry_size]
            print(f"    [{i}] hex={entry.hex()}")

with open(dat_path, 'rb') as f:
    dat_data = f.read()
print(f"\ndat size: {len(dat_data)} bytes")
# Check if compressed
try:
    text = zlib.decompress(dat_data)
    print(f"  Decompressed: {len(text)} bytes")
    print(f"  Preview: {text[:300].decode('utf-8', errors='replace')}")
except:
    # Try plain text
    text = dat_data.decode('utf-8', errors='replace')
    print(f"  Not zlib compressed. Trying as plain text:")
    print(f"  Preview: {text[:500]}")

# Show full content of .bdt
bdt_path = '/tmp/sword_modules/westminster_ext/modules/genbook/rawgenbook/westminster/westminster.bdt'
with open(bdt_path, 'rb') as f:
    bdt_data = f.read()
print(f"\nbdt size: {len(bdt_data)} bytes")
print(f"Preview: {bdt_data[:1000].decode('utf-8', errors='replace')}")
print(f"\n\nFull text sample (lines):")
text = bdt_data.decode('utf-8', errors='replace')
for line in text.split('\n')[:50]:
    print(f"  {line}")