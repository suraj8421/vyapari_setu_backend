import json
import os

def analyze():
    if not os.path.exists("debug_ocr.json"):
        print("debug_ocr.json not found")
        return

    data = json.load(open("debug_ocr.json"))
    blocks = data.get("ocr_raw", [])
    
    # Sort blocks by Y position
    sorted_blocks = sorted(blocks, key=lambda x: (x["box"][0][1], x["box"][0][0]))
    
    print(f"{'X':>5} {'Y':>5} {'CONF':>5} {'TEXT'}")
    print("-" * 50)
    for b in sorted_blocks:
        x = b["box"][0][0]
        y = b["box"][0][1]
        conf = b["confidence"]
        text = b["text"]
        print(f"{x:>5.0f} {y:>5.0f} {conf:>5.2f} {text}")

if __name__ == "__main__":
    analyze()
