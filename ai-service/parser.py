"""
parser.py — VyapariSetu SmartScan  (Enterprise Edition)
=========================================================
Clean orchestration layer.  All heavy lifting is delegated to:
  • noise_filter.py   — line classification
  • item_extractor.py — line-item extraction (coordinate + text-scan)
  • gst.py            — 4-pass GST extraction
  • vendor.py         — vendor detection + normalization

This file owns:
  • normalize_ocr()      — unify OCR format from any PaddleOCR variant
  • extract_date()       — date detection with keyword proximity scoring
  • extract_total()      — grand total detection (INR-aware, tax-safe)
  • calculate_confidence()— 7-factor dynamic scoring
  • parse_invoice()      — master entry point
"""

import re
import logging
from typing import List, Dict, Any, Optional
from gst import GSTIN_REGEX

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# 1. OCR FORMAT NORMALIZER
# ─────────────────────────────────────────────────────────────────────────────

def normalize_ocr(ocr_raw) -> List[Dict]:
    """
    Accepts OCR output in any of these formats:
      A. List of dicts:  [{"text": "...", "confidence": 0.9, "box": [...]}, ...]
         ← This is what ocr.py currently returns
      B. Raw PaddleOCR:  [[box_coords, ("text", confidence)], ...]
      C. Simple dicts:   [{"text": "..."}, ...]

    Returns a uniform list of: {"text": str, "conf": float, "box": list|None}
    """
    if not ocr_raw:
        return []

    normalized = []
    for line in ocr_raw:
        try:
            if isinstance(line, dict):
                text = str(line.get("text", "")).strip()
                conf = float(line.get("confidence", line.get("conf", 0.0)))
                box  = line.get("box", None)
                if text:
                    normalized.append({"text": text, "conf": conf, "box": box})

            elif isinstance(line, (list, tuple)) and len(line) >= 2:
                text_part = line[1]
                box = line[0] if isinstance(line[0], list) else None
                if isinstance(text_part, (list, tuple)) and len(text_part) >= 2:
                    text = str(text_part[0]).strip()
                    conf = float(text_part[1])
                elif isinstance(text_part, str):
                    text = text_part.strip()
                    conf = 0.0
                else:
                    continue
                if text:
                    normalized.append({"text": text, "conf": conf, "box": box})

        except Exception as e:
            logger.debug(f"[PARSER] Skipping malformed OCR line: {e}")
            continue

    logger.info(f"[PARSER] Normalized {len(normalized)} lines from {len(ocr_raw)} raw entries")
    return normalized


# ─────────────────────────────────────────────────────────────────────────────
# 2. HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_currency(text: str) -> Optional[float]:
    """Parse a monetary value from strings like '6,400.00', 'INR6,400', '₹6400'."""
    cleaned = re.sub(r'(?:inr|rs\.?|₹)\s*', '', text.lower()).strip()
    cleaned = cleaned.replace(',', '')
    cleaned = re.sub(r'[a-z%]+$', '', cleaned).strip()   # strip trailing unit/% suffix
    m = re.search(r'^\d+\.?\d*$', cleaned)
    if m:
        return float(m.group())
    m = re.search(r'\b\d+\.\d+\b', cleaned)
    if m:
        return float(m.group())
    return None


def _extract_numbers(text: str) -> List[float]:
    """Extract all parseable numbers (incl. comma-formatted) from text."""
    nums: List[float] = []
    for m in re.findall(r'\b\d{1,3}(?:,\d{3})+\.?\d*\b', text):
        v = _parse_currency(m)
        if v is not None:
            nums.append(v)
    plain = re.sub(r'\b\d{1,3}(?:,\d{3})+\.?\d*\b', '', text)
    for m in re.findall(r'\b\d+\.?\d*\b', plain):
        try:
            nums.append(float(m))
        except ValueError:
            pass
    return nums


# ─────────────────────────────────────────────────────────────────────────────
# 3. DATE EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

_DATE_PATTERNS = [
    re.compile(r'\b(\d{2}[-/]\d{2}[-/]\d{4})\b'),   # DD-MM-YYYY  ← preferred
    re.compile(r'\b(\d{4}[-/]\d{2}[-/]\d{2})\b'),   # YYYY-MM-DD
    re.compile(r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b'),  # D/M/YY
]

_DATE_KEYWORDS = {"date", "invoice date", "inv date", "dated", "due date"}


def extract_date(ocr_data: List[Dict]) -> str:
    """
    Find the invoice date using:
    1. Lines explicitly labelled 'Date' / 'Invoice Date' — highest priority
    2. First DD-MM-YYYY match anywhere in the document
    """
    # Priority: lines near a date keyword
    for i, d in enumerate(ocr_data):
        lower = d["text"].lower().strip()
        if any(kw in lower for kw in _DATE_KEYWORDS):
            # Check this block and the next 2 for a date pattern
            for j in range(i, min(len(ocr_data), i + 3)):
                for pat in _DATE_PATTERNS:
                    m = pat.search(ocr_data[j]["text"])
                    if m:
                        return m.group(1)

    # Fallback: first date pattern anywhere
    for d in ocr_data:
        for pat in _DATE_PATTERNS:
            m = pat.search(d["text"])
            if m:
                return m.group(1)

    return ""


# ─────────────────────────────────────────────────────────────────────────────
# 3.5 INVOICE NUMBER EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

_INV_KEYWORDS = {"invoice no", "inv no", "invoice #", "bill no", "invoice number"}

def extract_invoice_no(ocr_data: List[Dict]) -> str:
    """Extract invoice number using keyword proximity."""
    for i, d in enumerate(ocr_data):
        lower = d["text"].lower().strip()
        if any(kw in lower for kw in _INV_KEYWORDS):
            # Check same line (e.g. "Invoice No: 123")
            text = d["text"]
            # Look for alphanumeric string after keyword or colon
            match = re.search(r'(?:no\.?|#|number)[:\s]+([a-z0-9\-/]+)', text, re.I)
            if match:
                return match.group(1).strip()
            
            # Check next 2 lines
            for j in range(i + 1, min(len(ocr_data), i + 3)):
                val = ocr_data[j]["text"].strip()
                if re.match(r'^[a-z0-9\-/]{3,}$', val, re.I):
                    return val
    return ""

# ─────────────────────────────────────────────────────────────────────────────
# 3.7 ADDRESS EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def extract_address(ocr_data: List[Dict]) -> str:
    """
    Very basic heuristic: look for lines containing address-like tokens
    (road, st, building, pin, state, etc) near the vendor name.
    """
    address_parts = []
    # Most invoices have the address in the first 10-15 lines
    search_limit = min(len(ocr_data), 15)
    
    keywords = {"road", "st.", "street", "building", "floor", "area", "dist", "state", "pin", "india", "pincode"}
    
    for d in ocr_data[:search_limit]:
        text = d["text"].strip()
        lower = text.lower()
        if any(kw in lower for kw in keywords) or re.search(r'\d{6}', text):
            # Exclude lines that are clearly GSTINs or Phone numbers
            if not GSTIN_REGEX.search(text.upper()) and not re.search(r'\d{10}', text):
                address_parts.append(text)
                if len(address_parts) >= 3: break
                
    return ", ".join(address_parts)

# ─────────────────────────────────────────────────────────────────────────────
# 4. TOTAL EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

# Labels that indicate the cell is a *tax* value rather than the grand total
_TAX_LABELS = re.compile(
    r'\b(?:cgst|sgst|igst|tax|subtotal|sub\s*total|base\s*amount|'
    r'paid|balance|discount)\b', re.I
)


def extract_total(ocr_data: List[Dict]) -> float:
    """
    Extract the invoice grand total.

    Priority:
    1. INR-prefixed values near a "total" keyword
    2. Comma-formatted monetary values near "total" (e.g. "6,400.00")
    3. Largest plausible monetary candidate in the whole document

    Excludes: tax-labelled lines, values < ₹1, unrealistically large values.
    """
    total_candidates: List[float] = []
    all_candidates:   List[float] = []

    for d in ocr_data:
        text  = d["text"]
        lower = text.lower()
        near_total = "total" in lower and not _TAX_LABELS.search(lower)

        # INR-prefixed values
        for m in re.findall(r'(?:inr|rs\.?|₹)\s*[\d,]+\.?\d*', lower):
            v = _parse_currency(m)
            if v and v > 0:
                all_candidates.append(v)
                if near_total:
                    total_candidates.append(v)

        # Comma-formatted monetary values
        for m in re.findall(r'\b\d{1,3}(?:,\d{3})+\.?\d*\b', text):
            v = _parse_currency(m)
            if v and v > 0:
                all_candidates.append(v)
                if near_total:
                    total_candidates.append(v)

        # Plain numbers strictly on total lines
        if near_total:
            for v in _extract_numbers(text):
                if 1 <= v <= 99_999_999:
                    total_candidates.append(v)

    # Filter out unrealistically large values (phone-number-like)
    def plausible(v: float) -> bool:
        return 1.0 <= v <= 99_999_999

    total_candidates = [v for v in total_candidates if plausible(v)]
    all_candidates   = [v for v in all_candidates   if plausible(v)]

    if total_candidates:
        result = max(total_candidates)
    elif all_candidates:
        result = max(all_candidates)
    else:
        result = 0.0

    logger.info(f"[PARSER] Total={result}  "
                f"(near-total candidates={sorted(set(total_candidates), reverse=True)[:5]})")
    return round(result, 2)


# ─────────────────────────────────────────────────────────────────────────────
# 5. CONFIDENCE SCORING  (7-factor)
# ─────────────────────────────────────────────────────────────────────────────

def calculate_confidence(vendor: str, date: str, items: List[Dict],
                          total: float, cgst: float, sgst: float, hsn_codes: List[str]) -> float:
    score = 0.5

    if items:
        score += 0.2

    if total > 0:
        score += 0.2

    if cgst > 0 or sgst > 0:
        score += 0.1

    # ❌ penalty
    if len(items) == 1:
        score -= 0.1

    if not hsn_codes:
        score -= 0.1

    # OCR Hallucination Penalty: if multiple items have identical rate AND amount 
    # (common when OCR reads columns as repeated vertical blocks)
    if len(items) > 1:
        first_r, first_a = items[0].get("rate"), items[0].get("amount")
        if all(it.get("rate") == first_r and it.get("amount") == first_a for it in items):
            logger.warning("[PARSER] OCR Hallucination detected: identical repetitive items.")
            score -= 0.30

    return round(max(0.0, min(score, 1.0)), 2)


# ─────────────────────────────────────────────────────────────────────────────
# 6. HSN CODE EXTRACTION  (bonus)
# ─────────────────────────────────────────────────────────────────────────────

_HSN_RE = re.compile(r'\b(\d{4,8})\b')

def extract_hsn_codes(ocr_data: List[Dict]) -> List[str]:
    hsn_codes = set()
    for d in ocr_data:
        text = d.get("text", "")
        matches = re.findall(r'\b\d{6,8}\b', text)
        for m in matches:
            hsn_codes.add(m)
    return list(hsn_codes)


# ─────────────────────────────────────────────────────────────────────────────
# 7. MASTER ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def parse_invoice(ocr_raw) -> Dict[str, Any]:
    """
    Master entry point.  Accepts OCR output from ocr.py or raw PaddleOCR.

    Pipeline:
      normalize → vendor → date → total → gst → items → confidence

    Returns the standard invoice JSON dict.
    """
    logger.info("[PARSER] ══════════════  STARTING PARSE  ══════════════")

    # ── Normalize input ──────────────────────────────────────────────────────
    ocr_data = normalize_ocr(ocr_raw)

    if not ocr_data:
        logger.warning("[PARSER] No usable OCR data after normalization")
        return {
            "vendor": "Unknown", "date": "", "items": [],
            "total": 0, "hsn_codes": [],
            "gst": {"cgst": 0, "sgst": 0, "igst": 0, "base_amount": 0},
            "confidence_score": 0.0, "is_valid": False,
            "raw_text": "",
        }

    raw_text = " ".join(d["text"] for d in ocr_data)
    logger.info(f"[PARSER] {len(ocr_data)} OCR lines available")

    # ── Step 1: Vendor ───────────────────────────────────────────────────────
    from vendor import detect_vendor
    vendor = detect_vendor(ocr_data)
    logger.info(f"[PARSER] vendor={vendor!r}")

    # ── Step 2: Date ─────────────────────────────────────────────────────────
    date = extract_date(ocr_data)
    logger.info(f"[PARSER] date={date!r}")

    # ── Step 3: Total ────────────────────────────────────────────────────────
    total = extract_total(ocr_data)
    logger.info(f"[PARSER] total={total}")

    # ── Step 4: GST ──────────────────────────────────────────────────────────
    from gst import extract_gst, extract_gstin
    cgst, sgst, gst_rate = extract_gst(ocr_data, total=total)
    igst = 0.0   # extracted as 0 unless igst keyword is found
    logger.info(f"[PARSER] cgst={cgst}, sgst={sgst}, rate={gst_rate}")

    # ── Step 5: Items ────────────────────────────────────────────────────────
    from item_extractor import extract_items
    items = extract_items(ocr_data, known_total=total)
    logger.info(f"[PARSER] {len(items)} items extracted")

    # ── Step 6: HSN codes (bonus) ────────────────────────────────────────────
    hsn_codes = extract_hsn_codes(ocr_data)

    # ── Step 7: Base amount ──────────────────────────────────────────────────
    total_tax   = cgst + sgst + igst
    base_amount = round(max(total - total_tax, 0.0), 2)

    # ── Step 9: GSTIN ────────────────────────────────────────────────────────
    gstin = extract_gstin(ocr_data)
    logger.info(f"[PARSER] gstin={gstin!r}")

    # ── Step 10: Invoice No ──────────────────────────────────────────────────
    invoice_no = extract_invoice_no(ocr_data)
    logger.info(f"[PARSER] invoice_no={invoice_no!r}")

    # ── Step 11: Address ─────────────────────────────────────────────────────
    address = extract_address(ocr_data)
    logger.info(f"[PARSER] address={address!r}")

    # ── Step 12: Confidence score ─────────────────────────────────────────────
    confidence = calculate_confidence(vendor, date, items, total, cgst, sgst, hsn_codes)

    # ── Step 13: Accounting Intelligence & Validation ────────────────────────
    item_sum = sum(item.get("amount", 0) for item in items)
    gst_total = cgst + sgst + igst
    
    # Classification: Invoice-level GST (Exclusive) vs Item-level GST (Inclusive)
    gst_type = "unknown"
    if abs((item_sum + gst_total) - total) < 5.0:
        gst_type = "exclusive"  # GST added at footer
    elif abs(item_sum - total) < 5.0:
        gst_type = "inclusive"  # GST already in item amounts
        
    validation_error = False
    validation_reasons = []
    expected_total = total
    
    if gst_type == "exclusive":
        expected_total = item_sum + gst_total
    elif gst_type == "inclusive":
        expected_total = item_sum

    if abs(expected_total - total) > 5.0:
        validation_error = True
        validation_reasons.append(f"Item sum ({item_sum:.2f}) + GST ({gst_total:.2f}) differs from total ({total:.2f})")

    result: Dict[str, Any] = {
        "success": True,
        "is_valid": not validation_error,
        "validation_reasons": validation_reasons,
        "gst_type": gst_type,
        "vendor":           vendor,
        "address":          address,
        "date":             date,
        "invoice_no":       invoice_no,
        "gstin":            gstin,
        "items":            items,
        "total":            total,
        "hsn_codes":        hsn_codes,
        "gst": {
            "cgst":         cgst,
            "sgst":         sgst,
            "igst":         igst,
            "gst_rate":     gst_rate,
            "base_amount":  item_sum,
        },
        "confidence_score": confidence,
        "raw_text":         raw_text[:1000],
        "pages":            1,
        "extraction_method": "accounting-intelligence"
    }

    logger.info(
        f"[PARSER] ✓ Done ({gst_type}) — vendor={vendor!r}, total={total}, "
        f"items={len(items)}, valid={not validation_error}"
    )
    return result

# ─────────────────────────────────────────────────────────────────────────────
# 8. MULTI-PAGE MERGER
# ─────────────────────────────────────────────────────────────────────────────

def merge_parsed_pages(page_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Intelligently merge results from multiple parsed pages.
    Vendor/Invoice Info: First valid occurrence.
    Items: Concatenate all.
    GST/Total: Recalculate accounting logic using merged items and last page total.
    """
    if not page_results:
        return {}

    merged = {
        "vendor": "Unknown",
        "invoice_no": "",
        "date": "",
        "gstin": "",
        "address": "",
        "items": [],
        "total": 0.0,
        "gst": {"cgst": 0.0, "sgst": 0.0, "igst": 0.0, "gst_rate": 0.0, "base_amount": 0.0},
        "hsn_codes": [],
        "confidence_score": 0.0,
        "is_valid": False,
        "validation_reasons": [],
        "gst_type": "unknown",
        "extraction_method": "multi-page-merged"
    }

    last_total = 0.0
    last_gst = None
    all_reasons = []
    
    for page in page_results:
        if merged["vendor"] == "Unknown" and page.get("vendor") and page.get("vendor") != "Unknown":
            merged["vendor"] = page["vendor"]
        if not merged["invoice_no"] and page.get("invoice_no"):
            merged["invoice_no"] = page["invoice_no"]
        if not merged["date"] and page.get("date"):
            merged["date"] = page["date"]
        if not merged["gstin"] and page.get("gstin"):
            merged["gstin"] = page["gstin"]
        if not merged["address"] and page.get("address"):
            merged["address"] = page["address"]
            
        if page.get("items"):
            merged["items"].extend(page["items"])
        if page.get("hsn_codes"):
            merged["hsn_codes"].extend(page["hsn_codes"])
            
        if page.get("total", 0) > 0:
            last_total = page["total"]
        
        if page.get("validation_reasons"):
            all_reasons.extend(page["validation_reasons"])
            
    merged["total"] = last_total
    
    item_sum = sum(item.get("amount", 0) for item in merged["items"])
    
    for page in reversed(page_results):
        gst_data = page.get("gst", {})
        if gst_data.get("cgst", 0) > 0 or gst_data.get("igst", 0) > 0:
            last_gst = gst_data
            break
            
    if last_gst:
        merged["gst"] = last_gst
        
    gst_total = merged["gst"]["cgst"] + merged["gst"]["sgst"] + merged["gst"]["igst"]
    merged["gst"]["base_amount"] = item_sum
    
    gst_type = "unknown"
    if abs((item_sum + gst_total) - merged["total"]) < 5.0:
        gst_type = "exclusive"
    elif abs(item_sum - merged["total"]) < 5.0:
        gst_type = "inclusive"
        
    validation_error = False
    validation_reasons = list(set(all_reasons))
    expected_total = merged["total"]
    
    if gst_type == "exclusive":
        expected_total = item_sum + gst_total
    elif gst_type == "inclusive":
        expected_total = item_sum

    if abs(expected_total - merged["total"]) > 5.0 and merged["total"] > 0:
        validation_error = True
        validation_reasons.append(f"Merged item sum ({item_sum:.2f}) + GST ({gst_total:.2f}) differs from total ({merged['total']:.2f})")

    merged["is_valid"] = not validation_error and merged["total"] > 0 and len(merged["items"]) > 0
    merged["validation_reasons"] = validation_reasons
    merged["gst_type"] = gst_type
    
    conf_sum = sum(p.get("confidence_score", 0.5) for p in page_results)
    merged["confidence_score"] = round(conf_sum / len(page_results), 2) if page_results else 0.0
    merged["pages"] = len(page_results)
    
    return merged