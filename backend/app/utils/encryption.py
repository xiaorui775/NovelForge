import asyncio
import logging
from collections import OrderedDict

from cryptography.fernet import Fernet

from app.config import settings

logger = logging.getLogger(__name__)

# LRU cache keyed by ciphertext. Decryption is idempotent for a given ciphertext,
# so the plaintext is stable and safe to cache. Capped to bound memory.
_DECRYPT_CACHE: OrderedDict[str, str] = OrderedDict()
_CACHE_MAX = 256
_cache_hits = 0


def _get_fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY
    if not key:
        raise ValueError("ENCRYPTION_KEY environment variable is not set")
    return Fernet(key.encode())


def encrypt_api_key(key: str) -> str:
    return _get_fernet().encrypt(key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Synchronous decrypt. Use only from sync contexts (e.g. model write paths).

    Prefer ``decrypt_api_key_async`` from async request handlers to avoid
    blocking the event loop.
    """
    return _get_fernet().decrypt(encrypted_key.encode()).decode()


def clear_decrypt_cache() -> None:
    """Invalidate the decrypt cache. Call after a model's key changes or is deleted."""
    _DECRYPT_CACHE.clear()


def decrypt_cache_stats() -> tuple[int, int]:
    """Return (hits, current_size) for diagnostics."""
    return _cache_hits, len(_DECRYPT_CACHE)


async def decrypt_api_key_async(encrypted_key: str) -> str:
    """Async decrypt with an in-memory LRU cache.

    Fernet decrypt is CPU-bound; running it in a thread avoids blocking the
    event loop, and the cache skips repeated decrypts for the same ciphertext
    (e.g. one model reused across many generation requests).
    """
    global _cache_hits
    cached = _DECRYPT_CACHE.get(encrypted_key)
    if cached is not None:
        _cache_hits += 1
        # Refresh LRU recency.
        _DECRYPT_CACHE.move_to_end(encrypted_key)
        return cached

    plaintext = await asyncio.to_thread(decrypt_api_key, encrypted_key)
    _DECRYPT_CACHE[encrypted_key] = plaintext
    if len(_DECRYPT_CACHE) > _CACHE_MAX:
        _DECRYPT_CACHE.popitem(last=False)
    return plaintext
