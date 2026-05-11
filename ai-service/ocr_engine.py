from paddleocr import PaddleOCR
import cv2
import numpy as np

# PRODUCTION SETUP - PP-OCRv4
ocr = PaddleOCR(
    use_angle_cls=False, 
    lang="en", 
    det_db_thresh=0.2, 
    det_db_box_thresh=0.5,
    rec=True,
    enable_mkldnn=True,
    det_limit_side_len=960,
    rec_batch_num=6,
    show_log=False
)

def sort_ocr_results(data):
    """
    Sorts OCR results:
    1. Primary: Top to bottom (Y-axis)
    2. Secondary: Left to right (X-axis)
    Uses a small 'line threshold' to group items on the same visual line.
    """
    if not data:
        return []
    
    # Sort by Y top coordinate
    data.sort(key=lambda x: x["box"][0][1])
    
    sorted_data = []
    if not data: return []
    
    current_line = [data[0]]
    line_threshold = 15 # Pixels difference to consider same line
    
    for i in range(1, len(data)):
        if abs(data[i]["box"][0][1] - current_line[-1]["box"][0][1]) < line_threshold:
            current_line.append(data[i])
        else:
            # Sort the current line left to right
            current_line.sort(key=lambda x: x["box"][0][0])
            sorted_data.extend(current_line)
            current_line = [data[i]]
            
    # Add the last line
    current_line.sort(key=lambda x: x["box"][0][0])
    sorted_data.extend(current_line)
    
    return sorted_data

def run_ocr(img):
    """
    Runs OCR on a preprocessed image.
    Expects img to be a numpy array.
    """
    if img is None:
        return []

    # OCR with classification
    result = ocr.ocr(img, cls=True)

    data = []
    if not result:
        return []

    for block in result:
        if not block:
            continue

        for line in block:
            try:
                text = line[1][0]
                conf = line[1][1]
                box = line[0] # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]

                # Confidence filtering
                if conf < 0.4:
                    continue

                data.append({
                    "text": text,
                    "confidence": conf,
                    "box": box
                })
            except:
                continue

    # Spatial Sorting
    sorted_data = sort_ocr_results(data)

    return sorted_data