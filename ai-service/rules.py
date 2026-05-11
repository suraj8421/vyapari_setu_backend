import re
from thefuzz import process

# Dictionary of common OCR errors and their corrections
CORRECTIONS = {
    "invoice": ["invaice", "invalce", "in voice", "tax inv"],
    "total": ["totai", "tota!", "tota1", "to tal"],
    "amount": ["amt", "amunt", "amount"],
    "quantity": ["qty", "qnty", "quan"],
    "rate": ["rte", "price"],
    "date": ["dat", "dte"]
}

def smart_correct(text):
    if not text:
        return text
    words = text.lower().split()
    corrected_words = []
    for word in words:
        found = False
        for correct, mistypes in CORRECTIONS.items():
            if word == correct or word in mistypes:
                corrected_words.append(correct)
                found = True
                break
            match, score = process.extractOne(word, [correct] + mistypes)
            if score > 85:
                corrected_words.append(correct)
                found = True
                break
        if not found:
            corrected_words.append(word)
    return " ".join(corrected_words)

def normalize_currency(text):
    if not text:
        return ""
    text = text.lower().replace("inr", "")
    cleaned = re.sub(r"[₹$rs,\s]", "", text).strip()
    return cleaned

def clean_amount(x):
    """
    The definitive amount cleaner for VyapariSetu.
    Handles commas, currency, spaces, and garbage.
    """
    if not x:
        return 0.0
    # Clean the string aggressively
    s = str(x).lower().replace("inr", "").replace(",", "").replace(" ", "").strip()
    # Keep only digits and decimal point
    s = re.sub(r'[^0-9.]', '', s)
    try:
        return float(s)
    except:
        return 0.0
