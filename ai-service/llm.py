"""
llm.py — VyapariSetu SmartScan (UPDATED)
Uses NEW google-genai SDK (no deprecated code)
"""

import re
import json
import time
import logging
import os
from typing import Dict, List, Optional
from dotenv import load_dotenv
import concurrent.futures

from google import genai   # ✅ NEW SDK
from noise_filter import is_noise
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ✅ Initialize client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))

# ── Config ─────────────────────────────
_MODEL_NAME = "gemini-1.5-flash"
_MAX_RETRIES = 1
_RETRY_DELAY_S = 1.0

# ── Prompt ─────────────────────────────
_PROMPT_TEMPLATE = """
You are an expert invoice parser. Extract structured JSON only.

Invoice OCR Text:
---
{ocr_text}
---

Return JSON:
{{
  "vendor": "Company name",
  "date": "DD-MM-YYYY",
  "items": [
    {{
      "description": "product",
      "qty": number,
      "rate": number,
      "amount": number
    }}
  ],
  "total": number,
  "gst": {{
    "cgst": number,
    "sgst": number,
    "igst": number,
    "base_amount": number
  }}
}}
"""


# ── Helper: Build OCR text ─────────────────────────────
def _build_ocr_text(ocr_data: List[Dict]) -> str:
    lines = []
    for d in ocr_data:
        txt = d.get("text", "").strip()
        if txt and not is_noise(txt):
            lines.append(txt)
    return "\n".join(lines)


# ── Helper: Parse JSON safely ─────────────────────────────
def _parse_json(raw: str) -> Optional[Dict]:
    try:
        return json.loads(raw)
    except:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                return None
    return None

def _coerce_numbers(data: Dict) -> Dict:
    """Ensure all numeric fields are floats (LLMs sometimes return strings)."""
    def to_float(v, default=0.0):
        if v is None: return None
        try: return float(str(v).replace(',', '').replace('INR', '').replace('rs', '').strip())
        except (ValueError, TypeError): return default

    data["total"] = to_float(data.get("total"), 0.0)
    gst = data.get("gst", {})
    for k in ["cgst", "sgst", "igst", "base_amount"]:
        gst[k] = to_float(gst.get(k), 0.0)
    data["gst"] = gst

    for item in data.get("items", []):
        item["qty"]    = to_float(item.get("qty"))
        item["rate"]   = to_float(item.get("rate"))
        item["amount"] = to_float(item.get("amount"))

    return data


# ── MAIN FUNCTION ─────────────────────────────
def extract_invoice_with_llm(ocr_data: List[Dict]) -> Optional[Dict]:

    ocr_text = _build_ocr_text(ocr_data)
    if not ocr_text:
        return None

    prompt = _PROMPT_TEMPLATE.format(ocr_text=ocr_text)

    for attempt in range(_MAX_RETRIES + 1):
        try:
            logger.info(f"[LLM] Attempt {attempt+1}")

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(
                    client.models.generate_content,
                    model=_MODEL_NAME,
                    contents=prompt
                )
                response = future.result(timeout=10.0)

            raw = response.text
            data = _parse_json(raw)

            if data:
                data = _coerce_numbers(data)
                logger.info("[LLM] Success")
                return data

        except concurrent.futures.TimeoutError:
            logger.error("[LLM] Request timed out (15s limit).")
        except Exception as e:
            logger.error(f"[LLM] Error: {e}")

        time.sleep(_RETRY_DELAY_S)

    return None


# ── MERGE FUNCTION ─────────────────────────────
def merge_llm_with_rules(rule_result: Dict, llm_result: Optional[Dict]) -> Dict:

    if not llm_result:
        return rule_result

    result = dict(rule_result)

    # Vendor
    if result.get("vendor") in ("Unknown", "", None):
        result["vendor"] = llm_result.get("vendor", result["vendor"])

    # Date
    if not result.get("date"):
        result["date"] = llm_result.get("date", result["date"])

    # Items
    if not result.get("items"):
        result["items"] = llm_result.get("items", [])

    # Total
    if not result.get("total"):
        result["total"] = llm_result.get("total", 0)

    # GST
    if not result.get("gst"):
        result["gst"] = llm_result.get("gst", {})

    result["extraction_method"] = "hybrid"

    return result