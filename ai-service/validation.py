"""
validation.py — VyapariSetu SmartScan
=======================================
Validates the parsed invoice output and computes a validation confidence score.
"""

import re
import logging
from typing import Dict, Tuple, List, Any

logger = logging.getLogger(__name__)


def _clean_amount(x) -> float:
    """Safely convert any value to a float amount."""
    if x is None:
        return 0.0
    s = str(x).lower().replace("inr", "").replace(",", "").replace(" ", "").strip()
    s = re.sub(r'[^0-9.]', '', s)
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def validate_invoice_result(result: Dict[str, Any]) -> Tuple[bool, float, List[str]]:
    """
    Validate extracted invoice data with math and integrity checks.

    Checks:
      1. Total present and > 0
      2. Date format valid
      3. Vendor not "Unknown"
      4. Items present
      5. Item math: any item has consistent qty × rate ≈ amount
      6. GST sanity: cgst + sgst <= total
      7. Sum(item amounts) not wildly off from total

    Returns: (is_valid, confidence_score, reasons)
    """
    reasons: List[str] = []
    confidence = 1.0

    try:
        items  = result.get("items", [])
        total  = _clean_amount(result.get("total") or 0)
        vendor = result.get("vendor", "Unknown")
        date   = result.get("date", "")
        gst    = result.get("gst", {})

        cgst = _clean_amount(gst.get("cgst", 0))
        sgst = _clean_amount(gst.get("sgst", 0))
        igst = _clean_amount(gst.get("igst", 0))

        # ── Check 1: Total ───────────────────────────────────────────────────
        if total <= 0:
            confidence -= 0.25
            reasons.append("Total amount missing or zero")

        # ── Check 2: Date ────────────────────────────────────────────────────
        if not date or not re.search(r'\d{1,4}[-/]\d{1,2}[-/]\d{2,4}', str(date)):
            confidence -= 0.10
            reasons.append("Invalid or missing date")

        # ── Check 3: Vendor ──────────────────────────────────────────────────
        if not vendor or vendor == "Unknown":
            confidence -= 0.10
            reasons.append("Vendor name not detected")

        # ── Check 4: Items ───────────────────────────────────────────────────
        if not items:
            confidence -= 0.20
            reasons.append("No line items extracted")

        # ── Check 5: Item math validity ──────────────────────────────────────
        if items:
            math_valid_count = 0
            for it in items:
                q = _clean_amount(it.get("qty"))
                r = _clean_amount(it.get("rate"))
                a = _clean_amount(it.get("amount"))
                if q > 0 and r > 0 and a > 0:
                    if abs(q * r - a) / max(a, 1) <= 0.10:
                        math_valid_count += 1
            if items and math_valid_count == 0:
                confidence -= 0.10
                reasons.append("No items passed qty × rate = amount check")

        # ── Check 6: GST sanity ──────────────────────────────────────────────
        total_tax = cgst + sgst + igst
        if total > 0 and total_tax > total:
            confidence -= 0.15
            reasons.append(f"GST total ({total_tax}) exceeds invoice total ({total})")

        # ── Check 7: Item sum vs total (5% validation) ───────────────────────
        if items and total > 0:
            item_sum = sum(_clean_amount(it.get("amount")) for it in items if it.get("amount"))
            if item_sum > 0:
                diff = abs(item_sum - total)
                if diff > 0.05 * total:
                    confidence -= 0.10
                    reasons.append(
                        f"Item sum ({item_sum:.2f}) differs from total ({total:.2f}) "
                        f"by more than 5%"
                    )

        # Floor confidence at 0.10
        confidence = round(max(0.10, confidence), 2)
        is_valid   = confidence >= 0.60

        if reasons:
            logger.info(f"[VALIDATE] Issues: {reasons}")
        logger.info(f"[VALIDATE] confidence={confidence}, is_valid={is_valid}")

        return is_valid, confidence, reasons

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"[VALIDATE] Crash: {e}")
        return False, 0.10, [f"Validation error: {str(e)}"]
