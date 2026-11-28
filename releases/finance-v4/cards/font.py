"""Bake the card typefaces once during the Worker build."""
import base64
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

alphabet = ''.join(chr(i) for i in range(32, 127)) + '‘’ʻʼ−–—·✓⚠↙↗‹›' + ''.join(chr(i) for i in range(0x400, 0x460))
font_dir = Path('/usr/share/fonts/truetype/dejavu')
atlas = {}
for key, size, face in [('meta', 22, 'DejaVuSans'), ('body', 30, 'DejaVuSans'), ('bold', 33, 'DejaVuSans-Bold'), ('hero', 58, 'DejaVuSans-Bold')]:
    font = ImageFont.truetype(str(font_dir / (face + '.ttf')), size)
    atlas[key] = {}
    for char in alphabet:
        if key == 'hero' and char not in "0123456789., +−-so‘m": continue
        x, y, right, bottom = font.getbbox(char, anchor='ls')
        width, height = right - x, bottom - y
        image = Image.new('L', (width, height))
        if width and height: ImageDraw.Draw(image).text((-x, -y), char, font=font, fill=255, anchor='ls')
        pixels = list(image.getdata())
        # One byte describes a run of up to 16 equal four-bit coverage values.
        runs = bytearray()
        for value in pixels:
            level = value >> 4
            if runs and runs[-1] >> 4 == level and runs[-1] % 16 < 15:
                runs[-1] += 1
            else:
                runs.append(level << 4)
        atlas[key][char] = [round(font.getlength(char)), x, y, width, base64.b64encode(runs).decode()]
license_text = Path('/usr/share/doc/fonts-dejavu-core/copyright').read_text()
Path(sys.argv[1]).write_text('/*\n' + license_text.replace('*/', '* /') + '\n*/\nexport default ' + json.dumps(atlas, ensure_ascii=False, separators=(',', ':')) + ';\n')
