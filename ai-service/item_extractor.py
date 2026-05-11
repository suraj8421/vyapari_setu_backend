import re
import logging
from typing import List, Dict, Optional
from layout_parser import strategy_coordinate

logger = logging.getLogger(__name__)

def is_noise_line(text: str) -> bool:
    text = text.lower()
    noise_keywords = [
        "invoice", "gst", "total", "grand total", "tax",
        "authorized", "signature", "bank", "place",
        "date", "bill to", "shop name", "location",
        "gstin", "hsn", "item", "qty", "rate"
    ]
    return any(k in text for k in noise_keywords)

def clean_number(n) -> Optional[float]:
    try:
        return float(str(n).replace(",", "").strip())
    except:
        return None

def _strategy_text_scan(ocr_data: List[Dict]) -> List[Dict]:
    items = []
    
    for d in ocr_data:
        text = d.get("text", "").strip()

        # Skip noise
        if is_noise_line(text):
            continue

        # Extract numbers
        numbers = re.findall(r'\d+\.\d+|\d+', text)

        # Must have at least 3 numbers (qty, rate, amount)
        if len(numbers) < 3:
            continue

        # Try multiple combinations
        possible_items = []

        for i in range(len(numbers) - 2):
            qty = clean_number(numbers[i])
            rate = clean_number(numbers[i+1])
            amount = clean_number(numbers[i+2])

            if not qty or not rate or not amount:
                continue

            # Validate math (5% tolerance)
            if abs((qty * rate) - amount) <= max(5, 0.05 * amount):
                possible_items.append({
                    "name": text,
                    "description": text,
                    "qty": qty,
                    "rate": rate,
                    "amount": amount
                })

        # Pick best match
        if possible_items:
            items.append(possible_items[0])

    # Remove duplicates
    unique_items = []
    seen = set()

    for item in items:
        key = (item["qty"], item["rate"], item["amount"])
        if key not in seen:
            seen.add(key)
            unique_items.append(item)

    return unique_items

def extract_items(ocr_data: List[Dict], known_total: float = 0.0) -> List[Dict]:
    """Orchestrator for item parsing."""
    items = []
    
    has_boxes = any("box" in d for d in ocr_data)
    if has_boxes:
        logger.info("[ITEM] Trying Layout Parser (coordinate clustering)...")
        items = strategy_coordinate(ocr_data, known_total)
        if items:
            logger.info(f"[ITEM] Strategy Layout Parser found {len(items)} items")

    if not items:
        logger.info("[ITEM] Falling back to Regex Text Scanner...")
        items = _strategy_text_scan(ocr_data)
        logger.info(f"[ITEM] Regex Strategy found {len(items)} items")

    return items
