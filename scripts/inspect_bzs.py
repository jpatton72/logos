#!/usr/bin/env python3
"""Inspect SWORD bzs file format."""
import struct

for path, name in [
    ('/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzs', 'KJV OT.bzs'),
    ('/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzs', 'KJV NT.bzs'),
    ('/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzs', 'TR NT.bzs'),
]:
    with open(path, 'rb') as f:
        data = f.read()
    count = len(data) // 8
    print(f'{name}: {len(data)} bytes = {count} entries')
    for i in range(min(20, count)):
        off, v1, v2 = struct.unpack('<IHH', data[i*8:i*8+8])
        print(f'  [{i:3d}] offset={off:8d} (0x{off:08x})  v1={v1:5d}  v2={v2:5d}')
    print()
