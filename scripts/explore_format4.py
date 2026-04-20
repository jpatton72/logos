#!/usr/bin/env python3
"""Deep dive into KJV text - parse full OSIS content."""
import struct, zlib, re

def decompress_at_bzs_offsets(bzz_path, bzs_path):
    """Use bzs offsets to decompress all content entries."""
    with open(bzz_path, 'rb') as f:
        bzz_data = f.read()
    with open(bzs_path, 'rb') as f:
        bzs_data = f.read()
    
    num_entries = len(bzs_data) // 8
    results = []
    
    for i in range(num_entries):
        off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
        if off >= len(bzz_data):
            continue
        try:
            compressed = bzz_data[off:off+size]
            text = zlib.decompress(compressed)
            text_str = text.decode('utf-8', errors='replace')
            
            # Check if content
            if '<verse' in text_str or ('<chapter' in text_str and '<div' in text_str):
                book_match = re.search(r'osisID="([A-Za-z1-9]+)"', text_str)
                book_name = book_match.group(1) if book_match else "?"
                if book_name in ['KJV', 'module'] or book_name == '?':
                    # Might be module header
                    pass
                else:
                    results.append((i, off, size, extra, len(text), book_name, text_str))
        except:
            pass
    
    return results

# KJV OT
kjv_ot_books = decompress_at_bzs_offsets(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzs')

print("=== KJV OT BOOKS FOUND ===")
for item in kjv_ot_books:
    idx, off, sz, extra, uncomp_size, book, text = item
    print(f"  [{idx}] {book}: off={off}, sz={sz}, uncompressed={uncomp_size}")

# KJV NT
kjv_nt_books = decompress_at_bzs_offsets(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzs')

print("\n=== KJV NT BOOKS FOUND ===")
for item in kjv_nt_books:
    idx, off, sz, extra, uncomp_size, book, text = item
    print(f"  [{idx}] {book}: off={off}, sz={sz}, uncompressed={uncomp_size}")

# TR Greek NT
tr_nt_books = decompress_at_bzs_offsets(
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz',
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzs')

print("\n=== TR GREEK NT BOOKS FOUND ===")
for item in tr_nt_books:
    idx, off, sz, extra, uncomp_size, book, text = item
    print(f"  [{idx}] {book}: off={off}, sz={sz}, uncompressed={uncomp_size}")

# Now dig into one KJV OT book text to understand verse structure
print("\n=== KJV OT BOOK TEXT ANALYSIS ===")
if kjv_ot_books:
    idx, off, sz, extra, uncomp_size, book, text = kjv_ot_books[0]
    print(f"Book: {book}")
    print(f"First 2000 chars:\n{text[:2000]}")
    print(f"\n--- Chapter markers ---")
    chapters = re.findall(r'<chapter[^>]+>', text)
    for ch in chapters[:5]:
        print(f"  {ch}")
    print(f"Total chapters: {len(chapters)}")
    
    print(f"\n--- Verse markers ---")
    verses = re.findall(r'<verse[^>]+osisID="[^"]+"[^>]*/>', text)
    print(f"Total verse milestones: {len(verses)}")
    for v in verses[:10]:
        print(f"  {v}")

# Dig into one NT book (TR) for verse structure
print("\n=== TR BOOK TEXT ANALYSIS (Rom) ===")
if tr_nt_books:
    for item in tr_nt_books:
        if item[5] == 'Rom':
            idx, off, sz, extra, uncomp_size, book, text = item
            print(f"First 2000 chars:\n{text[:2000]}")
            print(f"\n--- Verse markers ---")
            verses = re.findall(r'<verse[^>]+osisID="[^"]+"[^>]*/>', text)
            print(f"Total verse milestones: {len(verses)}")
            for v in verses[:10]:
                print(f"  {v}")
            break