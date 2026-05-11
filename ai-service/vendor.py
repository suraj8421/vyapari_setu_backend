"""
vendor.py — VyapariSetu SmartScan
===================================
Vendor name detection and normalization.

Provides:
  extract_vendor(ocr_data)       → raw first-match vendor string
  normalize_vendor_name(raw)     → clean, properly-cased vendor name
  detect_vendor(ocr_data)        → normalized vendor (combined pipeline)
  apply_vendor_hints(name)       → load spatial column hints for known vendor
  store_vendor_hints(name, hints)→ save spatial layout for future use
"""

import json
import os
import re
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# ── Vendor memory (persisted JSON file) ───────────────────────────────────────
_MEMORY_FILE = os.path.join(os.path.dirname(__file__), "vendor_memory.json")


def _load_memory() -> dict:
    if not os.path.exists(_MEMORY_FILE):
        with open(_MEMORY_FILE, "w") as f:
            json.dump({}, f)
        return {}
    try:
        with open(_MEMORY_FILE, "r") as f:
            content = f.read().strip()
            return json.loads(content) if content else {}
    except Exception as e:
        logger.warning(f"[VENDOR] Could not load vendor memory: {e}")
        return {}


def _save_memory(data: dict) -> None:
    try:
        with open(_MEMORY_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning(f"[VENDOR] Could not save vendor memory: {e}")


# ── Normalization ──────────────────────────────────────────────────────────────

# Patterns to strip from a vendor name before casing
_STRIP_PATTERNS = [
    # GSTIN (e.g. "20COGPK0041H1ZN")
    re.compile(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b', re.I),
    # Phone number preceded by @ or standalone 10-digit
    re.compile(r'@\s*\d{7,}'),
    re.compile(r'\b\d{10}\b'),
    # Email addresses
    re.compile(r'\S+@\S+\.\S+'),
    # "GSTIN:", "GST:", etc.
    re.compile(r'gst\s*in\s*[:=]?\s*', re.I),
    re.compile(r'gst\s*[:=]?\s*', re.I),
    # Common noise suffixes: "Tax Invoice", "Bill To:", etc.
    re.compile(r'tax\s*invoice', re.I),
    re.compile(r'bill\s*to[:\s]', re.I),
    # Trailing commas / slashes / colons
    re.compile(r'[,/:]+$'),
]

# Address-hint words to strip whole token if found
_ADDRESS_TOKENS = {
    "nagar", "floor", "road", "street", "city", "more", "c/o",
    "ground", "yaduvansh", "telidih", "chas", "bokaro", "jharkhand",
    "india", "hirapur", "police", "line", "dhn",
}

# Generic/useless words that by themselves aren't a company name
_LABEL_WORDS = {
    "invoice", "date", "due", "to", "no", "gstin", "gst", "tax",
    "purchase", "order", "dispatch", "through", "document",
    "destination", "place", "supply", "authorized", "signatory",
}


def normalize_vendor_name(raw: str) -> str:
    """
    Clean and normalize a raw vendor string extracted from OCR:
    1. Remove GSTIN, phone, email, tax labels
    2. Strip address tokens
    3. Remove trailing punctuation/noise
    4. Apply title-case
    Returns an empty string if nothing meaningful remains.
    """
    if not raw:
        return "Unknown"

    text = raw.strip()

    # Apply regex strip patterns
    for pat in _STRIP_PATTERNS:
        text = pat.sub(' ', text)

    # Remove address tokens word-by-word but keep rest
    words = text.split()
    filtered = [w for w in words if w.lower().rstrip('.,;:') not in _ADDRESS_TOKENS]
    text = ' '.join(filtered)

    # Clean up extra whitespace / punctuation
    text = re.sub(r'[,/:]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    # Constraints: If nothing meaningful remains, or it's a massive paragraph artifact
    if len(text) < 3 or len(text) > 60:
        return "Unknown"

    # Title-case: handles ALL-CAPS like "VS BhAGAt eNteRPRISeS"
    # We use str.title() which reliably converts any casing to Title Case
    return text.title()


# ── Skip patterns for finding the vendor in the top OCR lines ─────────────────
_VENDOR_SKIP_SUBSTRINGS = [
    "tax invoice", "bill to", "invoice no", "due date",
    "purchase order", "dispatch", "place of supply",
    "gstin", "gst in", "purchase invoice", "proforma invoice",
    "delivery challan", "estimate", "quotation",
]

_VENDOR_SKIP_ADDRESS = [
    "nagar", "floor", "road", "c/o", "city,", "more,",
    "ramnath", "gmail", "bokaro", "jharkhand", "india",
    "telidih", "yaduvansh", "hirapur",
]


def extract_vendor(ocr_data: List[Dict]) -> str:
    """
    Find the raw vendor name from the top OCR entries.
    Returns the first meaningful non-label, non-address, non-numeric line.
    """
    if not ocr_data:
        return "Unknown"

    for d in ocr_data[:20]:
        text = d["text"].strip()
        lower = text.lower()
        logger.debug(f"[VENDOR] Checking: {text!r}")

        if len(text) < 4:
            continue

        # Skip purely numeric or symbolic lines
        if re.match(r'^[\d\s,.\-/+@*#]+$', text):
            continue

        # Skip email / phone
        if re.search(r'\S+@\S+\.\S+', text):
            continue
        if re.search(r'\b\d{10}\b', text):
            continue

        # Strategy 1: Explicit Labels (Supplier:, Seller:, M/s:, Vendor:)
        label_match = re.search(r'\b(?:supplier|seller|vendor|m/s)\s*[:\s]\s*([A-Z\d\s.&-]{3,})', text, re.I)
        if label_match:
            candidate = label_match.group(1).strip()
            candidate = re.sub(r'\b(?:gstin|gst|vat|tin).*$', '', candidate, flags=re.I).strip()
            if len(candidate) >= 3:
                logger.info(f"[VENDOR] Keyword match found: {candidate!r}")
                return candidate

        # Skip known invoice label lines (check AFTER keywords in case a line has both)
        if any(sub in lower for sub in _VENDOR_SKIP_SUBSTRINGS):
            logger.debug(f"[VENDOR] Skipping due to label: {text!r}")
            continue

        # Skip address-like lines
        if any(kw in lower for kw in _VENDOR_SKIP_ADDRESS):
            logger.debug(f"[VENDOR] Skipping due to address: {text!r}")
            continue

        # Skip GSTIN lines
        if re.search(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b', text, re.I):
            continue

        # Likely the vendor name if it's high up and not skipped
        logger.info(f"[VENDOR] Positional candidate: {text!r}")
        return text

    return "Unknown"


# ── Main pipeline entry ────────────────────────────────────────────────────────

def detect_vendor(ocr_data: List[Dict]) -> str:
    """
    Full vendor detection pipeline:
    1. Extract raw candidate from top OCR entries
    2. Normalize (strip noise, title-case)
    3. Match against known vendor memory (optional)
    """
    raw = extract_vendor(ocr_data)

    # Check vendor memory for a canonical name (exact substring match)
    memory = _load_memory()
    raw_lower = raw.lower()
    for canonical, data in memory.items():
        aliases = data.get("aliases", [])
        if raw_lower == canonical.lower() or any(a.lower() in raw_lower for a in aliases):
            logger.info(f"[VENDOR] Matched known vendor: {canonical!r}")
            return canonical

    normalized = normalize_vendor_name(raw)
    logger.info(f"[VENDOR] Normalized: {raw!r} → {normalized!r}")
    return normalized


# ── Vendor memory public API ───────────────────────────────────────────────────

def apply_vendor_hints(vendor_name: str) -> Optional[dict]:
    """Load spatial column hints for a specific vendor if they exist."""
    memory = _load_memory()
    return memory.get(vendor_name, {}).get("hints")


def store_vendor_hints(vendor_name: str, hints: dict) -> None:
    """Save the spatial column layout for a vendor for future accuracy."""
    if not vendor_name or vendor_name == "Unknown":
        return
    memory = _load_memory()
    entry = memory.get(vendor_name, {})
    entry["hints"] = hints
    memory[vendor_name] = entry
    _save_memory(memory)


def record_vendor_alias(canonical: str, alias: str) -> None:
    """
    Store an alternate spelling / OCR variant of a vendor name.
    Future scans with this alias will map to the canonical name.
    """
    if not canonical or not alias:
        return
    memory = _load_memory()
    entry = memory.get(canonical, {})
    aliases = entry.get("aliases", [])
    if alias.lower() not in [a.lower() for a in aliases]:
        aliases.append(alias)
    entry["aliases"] = aliases
    memory[canonical] = entry
    _save_memory(memory)
