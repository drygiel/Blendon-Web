"""Cuts static Archivo instances for the headlines out of the Fontsource variable files.

The page uses only three weight/width pairs, and one static face per pair is far smaller than the variable font.
Needs fontTools and brotli: `pip install fonttools brotli`, then run from Web~: `python scripts/archivo-instances.py`.
Keep INSTANCES in step with the @font-face rules in src/styles/archivo.scss.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = Path('node_modules/@fontsource-variable/archivo/files')
OUT = Path('src/assets/fonts/archivo')
SUBSETS = ['latin', 'latin-ext', 'vietnamese']
# (weight, width %) pairs set by `@include display` rules.
INSTANCES = [(700, 100), (800, 100), (800, 112)]

OUT.mkdir(parents=True, exist_ok=True)
for subset in SUBSETS:
    for wght, wdth in INSTANCES:
        font = instantiateVariableFont(TTFont(SRC / f'archivo-{subset}-wdth-normal.woff2'), {'wght': wght, 'wdth': wdth})
        font.flavor = 'woff2'
        path = OUT / f'archivo-{wght}-{wdth}-{subset}.woff2'
        font.save(path)
        print(f'{path}  {path.stat().st_size // 1024} KiB')
