"""Cooperative project ownership using a persistent, reserved OS lock inode."""
from contextlib import contextmanager
from contextvars import ContextVar
import errno
import os
from pathlib import Path
import stat

LOCK_FILENAME = '.prosaic-operation.lock'
_held = ContextVar('prosaic_project_locks', default={})


class ProjectLockError(RuntimeError):
    """Project ownership cannot be safely established or retained."""


class ProjectBusyError(ProjectLockError):
    def __init__(self):
        super().__init__('Project is busy: another Prosaic mutation owns the project lock.')


def _regular(metadata):
    return (stat.S_ISREG(metadata.st_mode)
            and not getattr(metadata, 'st_file_attributes', 0)
            & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400))


def _verify(path, descriptor):
    try:
        named, opened = path.lstat(), os.fstat(descriptor)
    except OSError:
        raise ProjectLockError('Project lock path is missing or unreadable.') from None
    if (not _regular(named) or not _regular(opened)
            or (named.st_dev, named.st_ino) != (opened.st_dev, opened.st_ino)
            or opened.st_nlink != 1):
        raise ProjectLockError('Project lock path is unsafe or its inode was replaced.')


def verify_project_lock(project_root):
    """Check a held descriptor before mutation, without acquiring another lock."""
    root = Path(project_root).resolve(strict=True)
    descriptor = _held.get().get(str(root))
    if descriptor is not None:
        _verify(root / LOCK_FILENAME, descriptor)


def _open(path):
    try:
        if os.path.lexists(path) and not _regular(path.lstat()):
            raise ProjectLockError('Project lock must be a regular file, without a symlink or reparse point.')
        flags = (os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0)
                 | getattr(os, 'O_CLOEXEC', 0) | getattr(os, 'O_NONBLOCK', 0))
        descriptor = os.open(path, flags, 0o600)
    except OSError:
        raise ProjectLockError('Cannot open the project lock safely.') from None
    try:
        _verify(path, descriptor)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _acquire(descriptor):
    try:
        if os.name == 'posix':
            import fcntl
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif os.name == 'nt':
            import msvcrt
            # Windows permits locking the fixed region beyond EOF. No content
            # write occurs before ownership and the persistent file stays empty.
            os.lseek(descriptor, 0, os.SEEK_SET)
            msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
        else:
            raise ProjectLockError('Project locking is unsupported on this platform.')
    except OSError as error:
        contention = ((os.name == 'posix' and error.errno in (errno.EAGAIN, errno.EWOULDBLOCK))
                      or (os.name == 'nt' and error.errno in (errno.EACCES, errno.EDEADLK)))
        if contention:
            raise ProjectBusyError() from None
        raise ProjectLockError('Cannot acquire the project lock.') from None


def _release(descriptor):
    if os.name == 'posix':
        import fcntl
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    elif os.name == 'nt':
        import msvcrt
        os.lseek(descriptor, 0, os.SEEK_SET)
        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)


@contextmanager
def project_mutation_lock(project_root):
    """Own one canonical project until completion; never unlink its lock file."""
    try:
        root = Path(project_root).resolve(strict=True)
    except OSError:
        raise ProjectLockError('Project root is missing or unreadable.') from None
    if not root.is_dir():
        raise ProjectLockError('Project root must be a directory.')
    path = root / LOCK_FILENAME
    descriptor = _open(path)
    acquired, token = False, None
    try:
        _acquire(descriptor)
        acquired = True
        _verify(path, descriptor)
        token = _held.set({**_held.get(), str(root): descriptor})
        yield
        _verify(path, descriptor)
    finally:
        if token is not None:
            _held.reset(token)
        try:
            if acquired:
                _release(descriptor)
        finally:
            os.close(descriptor)
