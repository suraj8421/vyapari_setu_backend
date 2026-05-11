import cv2
import numpy as np

def deskew(image):
    """
    Detects the skew angle of the image and rotates it to straighten the text.

    IMPORTANT: Only corrects small skew angles (<=10 degrees).
    Larger detected angles usually mean the detection algorithm was confused
    by page borders or dense content -- in those cases we do NOT rotate.
    This prevents the common failure mode of rotating a straight invoice by 90 degrees.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.bitwise_not(gray)

    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thresh > 0))
    angle = cv2.minAreaRect(coords)[-1]

    # Convert from OpenCV minAreaRect angle convention to actual skew angle
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    print(f"[PREPROCESS] Detected skew angle: {angle:.2f} deg")

    # Only correct small skew -- large angles indicate a detection error
    MAX_CORRECTION_ANGLE = 10.0
    if abs(angle) > MAX_CORRECTION_ANGLE:
        print(f"[PREPROCESS] Skipping deskew -- angle {angle:.2f} deg exceeds {MAX_CORRECTION_ANGLE} deg threshold")
        return image, 0.0

    print(f"[PREPROCESS] Applying deskew correction of {angle:.2f} deg")
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    return rotated, angle


def preprocess(img):
    """
    Simplified Preprocessing.
    Aggressive upscaling and thresholding often hurt modern OCR engines like PaddleOCR v4.
    """
    if img is None:
        return None

    # 1. Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. Slight denoising
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    
    # 3. Deskew (Still useful)
    img_deskewed, _ = deskew(img)
    
    return img_deskewed
