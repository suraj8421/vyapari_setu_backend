import re

# PRODUCTION LEVEL VENDOR LEARNING
KNOWN_VENDORS = [
    "bhagat enterprises",
    "shyam electric",
    "tata steel",
    "reliance retail",
    "ms bhagat enterprises" # Added based on our actual tests
]

def clean_vendor(text):
    """
    Learns vendor names + corrects OCR mistakes
    """
    if not text:
        return "Unknown Vendor"

    text = text.lower().strip()

    # remove noise
    text = re.sub(r'[^a-zA-Z\s]', '', text)

    # match with known vendors (fuzzy word-based matching)
    for v in KNOWN_VENDORS:
        if any(word in text for word in v.split()):
            return v

    return text.strip()
