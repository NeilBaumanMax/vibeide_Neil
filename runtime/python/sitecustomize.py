"""Restore normal script imports for VibeIDE's isolated portable Python.

The Windows embeddable distribution uses python312._pth to avoid loading a
machine-wide Python installation. That isolation also removes the directory of
the script being executed from sys.path, which breaks ESP-IDF helper scripts.
Keep the isolation and add back only the active script's own directory.
"""

from pathlib import Path
import sys


if sys.argv and sys.argv[0] not in {"", "-c", "-m"}:
    script_dir = str(Path(sys.argv[0]).resolve().parent)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
