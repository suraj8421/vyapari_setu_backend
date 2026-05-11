def calculate_confidence(ocr_data, items, valid_score):
    try:
        # Average OCR confidence
        if not ocr_data:
            ocr_conf = 0
        else:
            ocr_conf = sum(d.get("confidence", 0) for d in ocr_data) / len(ocr_data)

        # completeness score
        item_score = 1.0 if len(items) > 0 else 0.3

        # Weighted final confidence
        final = (ocr_conf * 0.5) + (valid_score * 0.3) + (item_score * 0.2)

        return round(final, 2)

    except Exception as e:
        print(f"Confidence calculation error: {e}")
        return 0.5
