import re

def get_table_region(ocr_data):
    """
    Finds the Y-coordinate of the header area.
    """
    keywords = ["description", "particulars", "item", "product", "hsn/sac", "hsn", "quantity"]
    for item in ocr_data:
        text = item["text"].lower()
        if any(k in text for k in keywords):
            return item["box"][0][1]
    return None

def detect_columns(ocr_data):
    headers = {}
    for item in ocr_data:
        text = item["text"].lower()
        x = item["box"][0][0]

        if any(k in text for k in ["description", "particulars", "product"]):
            headers["name"] = x
        elif "hsn" in text:
            headers["hsn"] = x
        elif any(k in text for k in ["qty", "quantity", "qnty", "quan"]):
            headers["qty"] = x
        elif any(k in text for k in ["rate", "price"]):
            headers["rate"] = x
        elif any(k in text for k in ["amount", "value"]):
            if "tax" not in text and "gst" not in text:
                headers["amount"] = x

    return headers

def get_table_end_y(mapped):
    """
    ✅ 1. HARD STOP USING Y-COORDINATE (NOT TEXT)
    Identifies the footer cutoff based on the 'Total' label.
    """
    for m in mapped:
        txt = m["text"].lower()
        if "total" in txt and m["y"] > 4000: # Final summary area
            return m["y"]
    return float("inf")

def map_columns(ocr_data, headers):
    """
    FIX 2: NARROWER COLUMN MAPPING (HIGH PRECISION)
    """
    if not headers:
        return []

    mapped = []
    for item in ocr_data:
        x = item["box"][0][0]
        text = item["text"]

        closest_col = min(headers, key=lambda k: abs(headers[k] - x))
        
        # High-precision overrides (reduced tolerance to 300)
        if "hsn" in headers and abs(x - headers["hsn"]) < 300:
            closest_col = "hsn"
        elif "rate" in headers and abs(x - headers["rate"]) < 300:
            closest_col = "rate"

        mapped.append({
            "col": closest_col,
            "text": text,
            "y": item["box"][0][1]
        })

    return mapped

def group_rows_advanced(mapped):
    """
    Vertical row building with 150px tolerance.
    """
    rows = {}
    for m in mapped:
        y_key = round(m["y"] / 150)

        if y_key not in rows:
            rows[y_key] = {}

        if m["col"] in rows[y_key]:
            prev = rows[y_key][m["col"]].lower()
            if m["text"].lower() not in prev:
                rows[y_key][m["col"]] = (rows[y_key][m["col"]] + " " + m["text"]).strip()
        else:
            rows[y_key][m["col"]] = m["text"]

    items = []
    sorted_keys = sorted(rows.keys())
    
    for k in sorted_keys:
        r = rows[k]
        name = r.get("name", "").strip()
        
        # Header exclusion
        if "description" in name.lower() or "particulars" in name.lower():
            continue

        item = {
            "name": name,
            "hsn": r.get("hsn", ""),
            "qty": r.get("qty", ""),
            "rate": r.get("rate", ""),
            "amount": r.get("amount", "")
        }

        # FIX 4: QTY BUG (IGNORE 'TOTAL' in qty column)
        if item.get("qty", "").lower() == "total":
            item["qty"] = ""

        # Allow rows with >= 1 signal for merging
        signals = sum([bool(item["name"]), bool(item["qty"]), bool(item["amount"])])
        if signals >= 1:
            items.append(item)

    return items

def merge_rows(items):
    """
    Vertical row stitching for multi-line support.
    """
    merged = []
    temp = None

    for item in items:
        if item.get("name") and (item.get("qty") or item.get("amount")):
            if temp:
                temp["name"] = temp.get("name") or item.get("name")
                temp["hsn"] = temp.get("hsn") or item.get("hsn")
                temp["qty"] = temp.get("qty") or item.get("qty")
                temp["rate"] = temp.get("rate") or item.get("rate")
                temp["amount"] = temp.get("amount") or item.get("amount")
                if is_valid_item(temp):
                    merged.append(temp)
                temp = None
            else:
                if is_valid_item(item):
                    merged.append(item)
        else:
            if temp is None:
                temp = item
            else:
                temp["name"] = (temp.get("name") or "") + " " + (item.get("name") or "")
                temp["hsn"] = temp.get("hsn") or item.get("hsn")
                temp["qty"] = temp.get("qty") or item.get("qty")
                temp["rate"] = temp.get("rate") or item.get("rate")
                temp["amount"] = temp.get("amount") or item.get("amount")
                if is_valid_item(temp):
                    merged.append(temp)
                    temp = None

    return merged

def is_valid_item(item):
    """
    ✅ 5. FINAL ITEM VALIDATION (STRICT + SMART)
    """
    name = item.get("name", "").lower()

    # Reject summary words
    blacklist = ["total", "invoice", "gst", "balance", "tax", "authorized", "signatory"]
    if any(b in name for b in blacklist):
        return False

    # Must have numeric amount
    if not item.get("amount"):
        return False

    # Must have real product name (multi-word signal)
    if len(name.split()) < 2:
        return False

    return True

def clean(val):
    """
    ✅ 3. CLEAN VALUES PROPERLY
    """
    if not val:
        return ""

    val = str(val).replace(",", "").replace("|", " ")
    parts = val.split()
    if parts:
        return parts[0].strip()
    return ""

def final_filter(items):
    final = []
    from rules import clean_amount
    for item in items:
        amt_clean = clean_amount(item.get("amount", "0"))
        if amt_clean > 0:
            item["amount"] = "{:.2f}".format(amt_clean)
            item["qty"] = clean(item.get("qty"))
            item["rate"] = clean(item.get("rate"))
            final.append(item)
    return final
