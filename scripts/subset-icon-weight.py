"""צמצום ציר המשקל בפועל; Google עשוי להחזיר 100–700 גם כשמבקשים 300–400.

נדרש רק לרענון הגופן: python3 -m pip install 'fonttools[woff]'
הבנייה הרגילה משתמשת בקובץ WOFF2 המחויב ואינה זקוקה ל-Python.
"""

import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

source, target, minimum, maximum = sys.argv[1:]
font = TTFont(source)
instantiateVariableFont(font, {"wght": (float(minimum), float(maximum))}, inplace=True)
font.save(target)
