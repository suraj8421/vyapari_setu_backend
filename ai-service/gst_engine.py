def calculate_gst(total, cgst=9, sgst=9):
    """
    🔥 3. GST AUTO CALCULATION (Production feature)
    Calculates tax segments and base amount from a grand total.
    """
    if not total:
        return {
            "base_amount": 0,
            "cgst": 0,
            "sgst": 0,
            "total": 0
        }

    try:
        total = float(str(total).replace(",", ""))
    except:
        return {}

    # Total = Base + (Base * Tax%)
    # Total = Base * (1 + Tax%)
    # Base = Total / (1 + Tax%)
    
    tax_rate = (cgst + sgst) / 100
    base = total / (1 + tax_rate)
    gst_total = total - base

    return {
        "base_amount": round(base, 2),
        "cgst": round(gst_total / 2, 2),
        "sgst": round(gst_total / 2, 2),
        "total": round(total, 2)
    }
