import re
import logging
from typing import List, Dict, Any, Optional
from noise_filter import is_noise

logger = logging.getLogger(__name__)

_TABLE_HEADERS = {
    "description", "hsn/sac", "hsn", "sac", "particulars", "product", "service", "item name", "item",
    "qty", "quantity", "units", "nos", "rate", "unit price", "price", "amount", "per",
    "gst", "tax", "cgst", "sgst", "tax %", "gst %", "igst", "taxable value", "taxable"
}

_HEADER_COL_MAP = {
    "description": "description", "particulars": "description", "product": "description", "service": "description", "item name": "description", "item": "description",
    "hsn/sac": "hsn", "hsn": "hsn", "sac": "hsn",
    "qty": "qty", "quantity": "qty",
    "units": "units", "nos": "qty",
    "rate": "rate", "unit price": "rate", "price": "rate",
    "amount": "amount", "taxable value": "amount", "taxable": "amount",
    "gst": "gst_rate", "tax": "gst_rate", "cgst": "gst_rate", "sgst": "gst_rate", "igst": "gst_rate",
}

# ---------------- NUMBER PARSER ----------------
def _parse_number(text: str) -> Optional[float]:
    cleaned = re.sub(r'(?:inr|rs\.?|₹)\s*', '', text.lower()).strip()
    cleaned = cleaned.replace(',', '')
    cleaned = re.sub(r'(?i)\b(pc|pcs|nos|kg|kgs|ltr|ltrs|pkt|pkts|mg|gm|gms|box|boxes|set)\b', '', cleaned).strip()
    cleaned = re.sub(r'[a-z]+$', '', cleaned).strip()

    match = re.search(r'\d+\.?\d*', cleaned)
    if match:
        val = float(match.group())
        return val if val > 0 else None

    return None

# ---------------- MATH VALIDATION ----------------
def clean_item_description(text: str) -> str:
    """Removes footer noise (Subtotal, Total, etc.) from item names."""
    stop_words = ["subtotal", "sub total", "total", "gst", "amount", "hsn", "grand total"]
    text_lower = text.lower()
    
    # Find the earliest occurrence of any stop word
    earliest_pos = len(text)
    for word in stop_words:
        pos = text_lower.find(word)
        if pos != -1 and pos < earliest_pos:
            earliest_pos = pos
            
    if earliest_pos < len(text):
        return text[:earliest_pos].strip().rstrip(':').rstrip('-').strip()
    return text.strip()

def _math_valid(qty, rate, amount):
    if qty and rate and amount:
        return abs((qty * rate) - amount) <= 2.0
    return False

# ---------------- MAIN STRATEGY ----------------
def strategy_coordinate(ocr_data: List[Dict], known_total: float = 0.0) -> List[Dict]:

    HEADER_Y_TOL = 40
    ROW_Y_TOL = 25

    header_y = None
    footer_y = None

    # ---------------- FIND HEADER ----------------
    for d in ocr_data:
        box = d.get("box")
        if not box:
            continue

        text = d["text"].lower().strip()
        y = box[0][1]

        if text in _TABLE_HEADERS:
            if header_y is None or y < header_y:
                header_y = y

        if text in {"total", "grand total", "subtotal", "sub total", "gst", "tax total"} and header_y and y > header_y:
            footer_y = y if footer_y is None else min(footer_y, y)

    if header_y is None:
        return []

    # ---------------- COLUMN POSITIONS ----------------
    col_positions = {}

    for d in ocr_data:
        box = d.get("box")
        if not box:
            continue

        y = box[0][1]
        if abs(y - header_y) > HEADER_Y_TOL:
            continue

        text = d["text"].lower().strip()
        col = _HEADER_COL_MAP.get(text)

        if col:
            col_positions[col] = (box[0][0], box[1][0])

    if not col_positions:
        logger.warning(f"[LAYOUT] No columns found! Header Y: {header_y}")
        return []

    logger.info(f"[LAYOUT] Detected columns: {list(col_positions.keys())}")

    # ---------------- FILTER DATA CELLS ----------------
    data_cells = [
        d for d in ocr_data
        if d.get("box")
        and d["box"][0][1] > header_y + HEADER_Y_TOL
        and (footer_y is None or d["box"][0][1] < footer_y)
    ]

    if not data_cells:
        return []

    # ---------------- GROUP ROWS ----------------
    data_cells.sort(key=lambda d: d["box"][0][1])

    rows = []
    current = [data_cells[0]]

    for c in data_cells[1:]:
        if abs(c["box"][0][1] - current[-1]["box"][0][1]) < ROW_Y_TOL:
            current.append(c)
        else:
            rows.append(current)
            current = [c]

    rows.append(current)

    parsed_rows = []

    # ---------------- PARSE ROWS ----------------
    for row in rows:
        item = {
            "description": "",
            "qty": None,
            "rate": None,
            "amount": None,
            "gst_rate": 0,
            "hsn": ""
        }

        for cell in row:
            text = cell["text"].strip()
            x = (cell["box"][0][0] + cell["box"][1][0]) / 2

            # 🔥 FIND CLOSEST COLUMN (FIXED)
            closest_col = None
            min_dist = float("inf")

            for col, (xl, xr) in col_positions.items():
                center = (xl + xr) / 2
                dist = abs(x - center)
                if dist < min_dist:
                    min_dist = dist
                    closest_col = col

            if closest_col and min_dist < 300:
                if closest_col == "description":
                    item["description"] += " " + text
                elif closest_col == "hsn":
                    if re.match(r'^\d{4,8}$', text):
                        item["hsn"] = text
                elif closest_col == "gst_rate":
                    v = _parse_number(text)
                    if v:
                        # Accumulate if multiple tax cols (CGST 9% + SGST 9%)
                        item["gst_rate"] += v
                elif closest_col in ["qty", "rate", "amount"]:
                    v = _parse_number(text)
                    if v:
                        item[closest_col] = v

        # CLEAN DESCRIPTION
        desc = item["description"].strip()
        # 🔥 FIX 3: Remove footer pollution (Subtotal, Total, GST, etc.)
        desc = clean_item_description(desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        item["description"] = desc

        parsed_rows.append(item)

    # ---------------- MERGE ROWS (SAFE) ----------------
    merged = []

    for row in parsed_rows:
        if is_noise(row["description"]):
            continue

        has_desc = len(row["description"]) > 2
        has_nums = row["amount"] or row["qty"] or row["rate"]

        if merged:
            prev = merged[-1]
            # ONLY merge small description continuation
            if has_desc and not has_nums and len(row["description"]) < 40:
                prev["description"] += " " + row["description"]
                continue

        merged.append(row)

    # ---------------- FINAL CLEAN + VALIDATION ----------------
    items = []
    seen = set()

    for i in merged:
        desc = i["description"].strip()
        if not desc or len(desc) < 2:
            continue

        q, r, a = i["qty"], i["rate"], i["amount"]

        # 🔥 FIX 4: Recover Missing Qty/Rate
        if a and r and r > 0 and (not q or abs((q*r)-a) > 5):
            i["qty"] = round(a / r, 2)
        elif a and q and q > 0 and (not r or abs((q*r)-a) > 5):
            i["rate"] = round(a / q, 2)
        elif q and r and not a:
            i["amount"] = round(q * r, 2)

        # 🔥 FIX 5: HSN Refinement (4-8 digits)
        if not i.get("hsn"):
            tokens = re.findall(r'\b\d{4,8}\b', i["description"] + " " + (i.get("hsn","")))
            if tokens:
                i["hsn"] = tokens[0]

        # FINAL CHECK: Must have an amount
        if not i["amount"] or i["amount"] <= 0:
            continue

        # REMOVE DUPLICATES
        key = (desc, i["amount"])
        if key in seen:
            continue
        seen.add(key)

        i["hsn_code"] = i.get("hsn", "")
        items.append(i)

    return items
