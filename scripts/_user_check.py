"""Privilege-level guard shared by every ingest script.

Running ingest scripts under `sudo` (or as root) places the database under
`/root/.local/share/aletheia/...` instead of the user's home directory, and
populates `node_modules/` and `target/` with root-owned files. The Logos
app then runs as the regular user, can't see the populated DB, and the
project tree is half-uninstallable. This is the single most common
installation footgun, so we refuse to run as root by default.

Pass `--allow-root` to override (containers, CI environments where root
is the only available account, debugging).
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import NoReturn


def add_allow_root_flag(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--allow-root",
        action="store_true",
        help="Permit running as root. Only use if you really know what you're "
             "doing — this script writes to the running user's home directory.",
    )


def is_root() -> bool:
    """True on POSIX when effective uid is 0; always False on Windows."""
    return hasattr(os, "geteuid") and os.geteuid() == 0  # type: ignore[attr-defined]


def assert_not_root(allow_root: bool, script_name: str | None = None) -> None:
    """Abort with a clear message if running as root and --allow-root absent."""
    if not is_root():
        return
    if allow_root:
        sys.stderr.write(
            "WARNING: running as root because --allow-root was passed.\n"
            "         The DB and any generated files will be created under root's home,\n"
            "         not your normal user's home. The Aletheia app, when launched as a\n"
            "         regular user, will not see this database.\n\n"
        )
        return
    _abort(script_name)


def _abort(script_name: str | None) -> NoReturn:
    name = script_name or os.path.basename(sys.argv[0]) or "this script"
    sudo_user = os.environ.get("SUDO_USER")
    hint = (
        f"\nLooks like you ran this with `sudo` as user `{sudo_user}`. "
        "Drop the sudo and re-run:\n"
        f"    python3 {sys.argv[0]}\n"
    ) if sudo_user else (
        f"\nRe-run as your normal user (no sudo):\n"
        f"    python3 {sys.argv[0]}\n"
    )
    sys.stderr.write(
        f"ERROR: {name} must not be run as root.\n"
        "\n"
        "Running as root creates the database under /root/.local/share/aletheia/\n"
        "instead of your home directory, leaves root-owned files in node_modules/\n"
        "and src-tauri/target/, and the Logos app won't be able to read the DB\n"
        "when it launches as your regular user.\n"
        f"{hint}"
        "\n"
        "If you really need to run as root (e.g. in a container or single-user\n"
        "system), pass --allow-root.\n"
    )
    raise SystemExit(2)
