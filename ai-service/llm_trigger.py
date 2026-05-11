"""
llm_trigger.py — VyapariSetu SmartScan
========================================
Decides when to trigger the LLM fallback and orchestrates the merge.
"""

import logging
from typing import Dict, Tuple, List, Any

from llm import extract_invoice_with_llm, merge_llm_with_rules

logger = logging.getLogger(__name__)


def should_use_llm(parsed_data: Dict[str, Any], validation_info: Tuple[bool, float, List[str]]) -> bool:
    """
    Decides if we need to call Gemini for better extraction.
    Criteria:
    - Rule-based parsing failed validation (is_valid == False)
    - Confidence score < 0.75
    - Essential fields missing (e.g., no items, no total)
    """
    is_valid, confidence, reasons = validation_info
    
    if not is_valid:
        logger.info(f"[TRIGGER] LLM triggered: is_valid=False. Reasons: {reasons}")
        return True
    
    if confidence < 0.75:
        logger.info(f"[TRIGGER] LLM triggered: confidence ({confidence}) < 0.75")
        return True
        
    if not parsed_data.get("items"):
        logger.info("[TRIGGER] LLM triggered: No items found")
        return True
        
    if not parsed_data.get("total"):
        logger.info("[TRIGGER] LLM triggered: No total found")
        return True
        
    if not parsed_data.get("hsn_codes"):
        logger.info("[TRIGGER] LLM triggered: No HSN codes found")
        return True
        
    return False


def refine_with_llm(ocr_data: List[Dict], existing_parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calls LLM and merges the results with existing rule-based output.
    """
    logger.info("[TRIGGER] Starting LLM Fallback...")
    llm_result = extract_invoice_with_llm(ocr_data)
    
    if llm_result:
        merged = merge_llm_with_rules(existing_parsed, llm_result)
        return merged
    else:
        logger.warning("[TRIGGER] LLM returned None. Falling back to rule-based parsed data.")
        existing_parsed["extraction_method"] = "rule-based (llm failed)"
        return existing_parsed
