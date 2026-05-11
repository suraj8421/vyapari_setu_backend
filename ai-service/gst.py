import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

GSTIN_REGEX = re.compile(r'\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b', re.IGNORECASE)

def extract_gstin(ocr_data: List[Dict]) -> str:
    """Extract 15-digit Indian GSTIN."""
    for line in ocr_data:
        text = line.get("text", "")
        match = GSTIN_REGEX.search(text.upper())
        if match:
            return match.group(1)
            
    # Try fuzzy matching if spaces exist
    full_text = " ".join([d.get("text", "") for d in ocr_data]).upper()
    full_text_no_spaces = full_text.replace(" ", "")
    match = GSTIN_REGEX.search(full_text_no_spaces)
    if match:
        return match.group(1)
        
    return ""

def _parse_currency(text: str) -> float:
    cleaned = re.sub(r'(?:inr|rs\.?|₹)\s*', '', text.lower()).strip()
    cleaned = cleaned.replace(',', '')
    m = re.search(r'\b\d+\.?\d*\b', cleaned)
    if m:
        return float(m.group())
    return 0.0

def extract_gst(ocr_data: List[Dict], total: float = 0.0) -> Tuple[float, float, float]:
    """
    4-pass GST extraction.
    Returns: (cgst, sgst, gst_rate)
    """
    cgst, sgst, rate = 0.0, 0.0, 0.0
    
    # Pass 1: Look for explicit CGST and SGST lines
    for line in ocr_data:
        text = line.get("text", "").lower()
        if "cgst" in text:
            val = _parse_currency(text)
            if val > 0:
                cgst = max(cgst, val)
        if "sgst" in text:
            val = _parse_currency(text)
            if val > 0:
                sgst = max(sgst, val)
                
    # Pass 2: Look for percentages indicating rate
    rates_found = set()
    for line in ocr_data:
        text = line.get("text", "")
        for m in re.findall(r'\b(5|12|18|28)\s*%', text):
            rates_found.add(float(m))
            
    if rates_found:
        rate = max(rates_found)
        
    # Pass 3: If explicit taxes missing, try to infer from total and rate (if it's inclusive)
    if cgst == 0.0 and sgst == 0.0 and total > 0 and rate > 0:
        # Example: if total is 118, rate is 18, base is 100, gst is 18.
        # But we only infer if we found explicit "Tax" or "GST" keywords
        tax_keywords = any("gst" in d.get("text", "").lower() or "tax" in d.get("text", "").lower() for d in ocr_data)
        if tax_keywords:
            calculated_total_tax = total - (total / (1 + (rate / 100)))
            cgst = round(calculated_total_tax / 2, 2)
            sgst = round(calculated_total_tax / 2, 2)
            
    # Pass 4: Clean up
    if cgst > 0 and sgst == 0:
        sgst = cgst
    elif sgst > 0 and cgst == 0:
        cgst = sgst
        
    if rate == 0.0 and cgst > 0 and total > 0:
        total_tax = cgst + sgst
        base = total - total_tax
        if base > 0:
            inferred = round((total_tax / base) * 100)
            if inferred in [5, 12, 18, 28]:
                rate = float(inferred)
                
    return round(cgst, 2), round(sgst, 2), rate
