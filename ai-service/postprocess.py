def clean_output(basic, items, gst):
    """
    Final formatting and cleaning of the extracted data.
    """
    return {
        "invoice_no": basic.get("invoice_no"),
        "total": basic.get("total"),
        "gst": gst,
        "items": items if isinstance(items, list) else []
    }
