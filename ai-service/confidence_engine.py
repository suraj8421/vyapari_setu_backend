def calculate_confidence(parsed):
    """
    Gives a production-level confidence score (0.0 to 1.0)
    Based on field presence and item validity.
    """
    if not parsed:
        return {"confidence": 0.0, "is_valid": False}

    score = 0
    total_checks = 5

    # 1. vendor check
    if parsed.get("vendor") and parsed["vendor"] != "Unknown Vendor":
        score += 1

    # 2. date check
    if parsed.get("date"):
        score += 1

    # 3. total check (valid float > 0)
    try:
        if parsed.get("total") and float(str(parsed["total"]).replace(",", "")) > 0:
            score += 1
    except:
        pass

    # 4. items presence
    items = parsed.get("items", [])
    if items and len(items) > 0:
        score += 1

    # 5. item quality check (do they have both names and amounts?)
    valid_items = 0
    for i in items:
        if i.get("amount") and i.get("name") and len(str(i.get("name"))) > 5:
            valid_items += 1

    if len(items) > 0 and valid_items == len(items):
        score += 1

    confidence = round(score / total_checks, 2)

    return {
        "confidence": confidence,
        "is_valid": confidence >= 0.7
    }
