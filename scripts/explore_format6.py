#!/usr/bin/env python3
"""Find ALL zlib stream starts in bzz by scanning for zlib headers."""
import struct, zlib, re

def scan_zlib_streams(bzz_path, max_show=50):
    """Scan bzz for all zlib stream starts."""
    with open(bzz_path, 'rb') as f:
        data = f.read()
    
    print(f"File size: {len(data)}")
    
    # Scan for zlib headers (0x78 followed by 0x01, 0x5E, 0x9C, or 0xDA)
    zlib_markers = [b'\x78\x01', b'\x78\x5e', b'\x78\x9c', b'\x78\xda']
    
    streams = []
    pos = 0
    while pos < len(data):
        found = False
        for marker in zlib_markers:
            if data[pos:pos+2] == marker:
                found = True
                break
        if found:
            # Try to decompress from here
            try:
                d = zlib.decompressobj()
                chunk = data[pos:pos+65536]
                dec = d.decompress(chunk)
                consumed = len(chunk) - len(d.unused_data)
                if consumed > 0 and len(dec) > 10:
                    text = dec.decode('utf-8', errors='replace')
                    book_match = re.search(r'osisID="([A-Za-z1-9]+)"', text)
                    book = book_match.group(1) if book_match else "?"
                    chaps = len(re.findall(r'<chapter[^>]+>', text))
                    is_content = len(dec) > 1000
                    streams.append((pos, consumed, len(dec), book, chaps, is_content))
                    pos += consumed
                else:
                    pos += 1
            except:
                pos += 1
        else:
            pos += 1
    
    print(f"Streams found: {len(streams)}")
    for i, s in enumerate(streams[:max_show]):
        marker = "*" if s[5] else " "
        print(f"  [{i:2d}]{marker} pos={s[0]:8d} consumed={s[1]:7d} uncomp={s[2]:8d} book={s[3]:8s} chaps={s[4]}")
    
    content_streams = [s for s in streams if s[5]]
    print(f"\nContent streams: {len(content_streams)}")
    for s in content_streams[:20]:
        print(f"  {s[3]}: {s[4]} chapters")
    
    return streams

kjv_ot = scan_zlib_streams('/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz')
kjv_nt = scan_zlib_streams('/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz')
tr_nt = scan_zlib_streams('/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz')