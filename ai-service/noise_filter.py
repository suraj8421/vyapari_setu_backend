"""
noise_filter.py — VyapariSetu SmartScan
========================================
Centralized noise-detection layer for the invoice parser.

Provides:
  is_noise(text)          → True if this OCR line should be ignored entirely
  is_item_candidate(text) → True if this line might be an invoice line-item description
"""

import re

# ── Words that are exact column headers / invoice labels ──────────────────────
SKIP_WORDS = {
    # Table column headers
    "description", "qty", "quantity", "units", "unit", "rate", "amount",
    "hsn", "sac", "hsn/sac", "per", "#", "no", "sr", "s.no",
    # Invoice metadata labels
    "invoice", "tax invoice", "bill to", "invoice no", "date",
    "due date", "purchase order no", "dispatch through",
    "dispatch document no", "destination", "place of supply",
    # Footer / Totals
    "authorized signatory", "authorized", "signatory",
    "total", "subtotal", "sub total", "balance", "paid",
    "grand total", "net total", "net amount",
    # Misc
    "terms", "condition", "bank", "account",
}

# ── Substrings — if any of these appear, line is definitely noise ─────────────
NOISE_SUBSTRINGS = [
    # Legal boilerplate
    "declare", "particulars", "true and correct", "generated invoice",
    "computer generated", "actual price", "actual rate",
    "authorized signatory", "e & oe", "e&oe",
    # Tax labels (we handle GST separately, so skip these in item scan)
    "total tax", "tax inclusive", "tax exclusive",
    # Logistics
    "dispatch through", "purchase order",
    # Address / location keywords (invoice-specific)
    "nagar", "floor", "road", "street", "c/o", "more,",
    # Invoice metadata
    "invoice no", "due date", "bill to", "place of supply",
    "gstin:", "gst in:", "gstin :",
]

# ── Regex patterns that signal noise ─────────────────────────────────────────
_NOISE_REGEXES = [
    re.compile(r'\S+@\S+\.\S+'),                          # email
    re.compile(r'@\s*\d{7,}'),                            # phone starting with @
    re.compile(r'\b\d{10}\b'),                            # 10-digit phone number
    re.compile(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b'),  # GSTIN
    re.compile(r'^[\d\s,.\-/:*]+$'),                      # purely numeric / symbol line
    re.compile(r'\b(?:19|20)\d{2}\b'),                    # year only lines (rough)
]

# ── Address-like city/state keywords (India-specific, extend as needed) ───────
_ADDRESS_HINTS = {
    "bokaro", "dhanbad", "jharkhand", "ranchi", "india",
    "hirapur", "police line", "telidih", "chas",
    "yaduvansh", "ground floor",
}


def is_noise(text: str) -> bool:
    """
    Returns True if this OCR line should be completely ignored.
    Covers: headers, footers, legal text, addresses, phone/email/GSTIN.
    """
    if not text or len(text.strip()) < 2:
        return True

    lower = text.lower().strip()

    # Exact match to known label words
    if lower in SKIP_WORDS:
        return True

    # Contains a known noisy substring
    for sub in NOISE_SUBSTRINGS:
        if sub in lower:
            return True

    # Address / city / state hint
    for hint in _ADDRESS_HINTS:
        if hint in lower:
            return True

    # Regex-based noise patterns
    for pattern in _NOISE_REGEXES:
        if pattern.search(text):
            return True

    return False


def is_item_candidate(text: str) -> bool:
    """
    Returns True if this OCR line could reasonably be an invoice line-item description.
    A description must:
      - Not be noise
      - Contain at least 2 consecutive alphabetic characters (a real word)
      - Be longer than 3 characters
      - Not be a 1-2-word all-alpha label (like "India", "Paid")
    """
    if is_noise(text):
        return False

    stripped = text.strip()
    lower = stripped.lower()

    # Must have minimum length
    if len(stripped) < 3:
        return False

    # Must contain at least one real word (2+ consecutive letters)
    if not re.search(r'[a-zA-Z]{2,}', stripped):
        return False

    # Exact label check
    if lower in SKIP_WORDS:
        return False

    # Short 1-2 word, all-alpha lines are likely labels not descriptions
    words = stripped.split()
    if len(words) <= 2 and all(re.match(r'^[a-zA-Z]+$', w) for w in words):
        if lower in SKIP_WORDS:
            return False
        # single generic words like "India", "Paid", "Balance"
        if len(words) == 1 and len(stripped) <= 8:
            return False

    return True
