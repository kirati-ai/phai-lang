"""Which files are source programs: .apsi (Apsi) and .phai (Phai Lang, the same language).

Every tool that finds, runs or scans source files asks here, so adding an extension is a one-line change.
"""
import os

SOURCE_EXTS = (".apsi", ".phai")


def is_source(path):
    """True for a path ending in a source extension (case-insensitive)."""
    return str(path).lower().endswith(SOURCE_EXTS)


def module_candidates(base):
    """Files that `use base` may load, in order: base.apsi, base.phai, base/__init__.apsi, base/__init__.phai."""
    return [base + e for e in SOURCE_EXTS] + [os.path.join(base, "__init__" + e) for e in SOURCE_EXTS]


def find_with_ext(path):
    """`path` as given if it exists, else the first existing path + extension (`run hello` finds hello.phai)."""
    if os.path.exists(path):
        return path
    for e in SOURCE_EXTS:
        if os.path.exists(path + e):
            return path + e
    return path


def default_ext():
    """The extension for new files: .phai when started as `phai`, otherwise .apsi."""
    from .cli import command_name
    return ".phai" if command_name() == "phai" else ".apsi"


def is_package_init(path):
    return os.path.splitext(os.path.basename(str(path)))[0] == "__init__" and is_source(path)
