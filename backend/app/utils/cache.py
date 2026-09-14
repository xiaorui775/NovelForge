"""Simple in-memory TTL cache for repeated expensive operations.

Used for Phase 4.3 to avoid re-calling AI for identical inputs (e.g. quality scoring on unchanged content).
Not distributed; single-process only. Sufficient for personal deployment.
"""
import time
from functools import wraps
from typing import Any, Callable, Optional


class TTLCache:
    def __init__(self, ttl_seconds: int = 3600, max_size: int = 256):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self._store: dict[str, tuple[float, Any]] = {}

    def _evict_if_needed(self):
        if len(self._store) <= self.max_size:
            return
        # Evict oldest by insertion order (Python 3.7+ dicts preserve order)
        oldest_key = next(iter(self._store))
        self._store.pop(oldest_key, None)

    def get(self, key: str) -> Optional[Any]:
        item = self._store.get(key)
        if not item:
            return None
        ts, value = item
        if time.time() - ts > self.ttl:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any):
        self._evict_if_needed()
        self._store[key] = (time.time(), value)

    def clear(self):
        self._store.clear()


# Global caches for different purposes
_quality_cache = TTLCache(ttl_seconds=3600, max_size=256)
_consistency_cache = TTLCache(ttl_seconds=1800, max_size=128)


def make_key(*parts: Any) -> str:
    """Stable string key from arbitrary parts (best-effort)."""
    return "|".join(str(p) for p in parts)


def cached_quality(ttl: int = 3600):
    """Decorator to cache quality scoring results by content hash + model name."""
    _quality_cache.ttl = ttl  # allow override if needed

    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            # Expect signature like score_text(content, ..., model_config)
            # We try to extract content and model name heuristically.
            content = None
            model_name = "unknown"
            for a in args:
                if isinstance(a, str) and len(a) > 20:
                    content = a
                    break
            if "content" in kwargs and isinstance(kwargs["content"], str):
                content = kwargs["content"]
            mc = kwargs.get("model_config") or (args[-1] if args else None)
            if mc is not None:
                model_name = getattr(mc, "model_name", "unknown") or "unknown"

            if content:
                key = make_key("quality", hash(content), model_name)
                cached = _quality_cache.get(key)
                if cached is not None:
                    return cached

            result = await fn(*args, **kwargs)
            if content:
                _quality_cache.set(key, result)
            return result
        return wrapper
    return decorator


def get_cache_stats() -> dict:
    return {
        "quality": {"size": len(_quality_cache._store), "ttl": _quality_cache.ttl},
        "consistency": {"size": len(_consistency_cache._store), "ttl": _consistency_cache.ttl},
    }
