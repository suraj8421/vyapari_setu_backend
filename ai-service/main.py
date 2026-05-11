import cv2
import numpy as np

import logging
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from concurrent.futures import ThreadPoolExecutor

from ocr_engine import run_ocr
from preprocess import preprocess
from parser import parse_invoice, merge_parsed_pages
from cache import get_cached_result, save_cached_result
from validation import validate_invoice_result
from llm_trigger import should_use_llm, refine_with_llm

# 🔥 PDF support (no PATH dependency)
from pdf2image import convert_from_bytes

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="VyapariSetu SmartScan AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dedicated pool for heavy CPU-bound OpenMP/C++ PaddleOCR workload
# This allows massive throughput as C++ releases python GIL
ocr_thread_pool = ThreadPoolExecutor(max_workers=8) 

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "smartscan-ai-production"}


# 🔥 UNIVERSAL FILE LOADER
def load_images(contents: bytes, filename: str):
    images = []

    if filename.endswith(".pdf"):
        try:
            poppler_path = os.getenv("POPPLER_PATH", r"C:\poppler\Library\bin")
            pil_images = convert_from_bytes(
                contents,
                dpi=300,
                poppler_path=poppler_path
            )

            for img in pil_images:
                img = np.array(img)
                img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
                images.append(img)

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF processing failed: {str(e)}")

    else:
        # image handling
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        images.append(img)

    return images


@app.post("/ocr")
async def ocr_api(file: UploadFile = File(...)):
    try:
        filename = file.filename.lower()
        logger.info(f"[API] Processing: {filename}")

        contents = await file.read()
        
        # 🔥 PRE-EMPTIVE BINARY CACHE CHECK
        cached = get_cached_result(contents)
        if cached:
            logger.info(f"[API] Pre-emptive Hash Cache HIT for {filename}")
            return JSONResponse(content=cached)

        # 🔥 AUTO FILE HANDLING
        images = await asyncio.to_thread(load_images, contents, filename)

        if not images:
            raise HTTPException(status_code=400, detail="File could not be processed")

        full_ocr = []
        page_results = []
        
        # Define the isolated Page task
        def process_page(idx, img):
            processed = preprocess(img)
            return idx, run_ocr(processed)

        # 🔥 3x FASTER: PARALLEL PROCESS MULTIPLE PAGES 
        loop = asyncio.get_running_loop()
        tasks = [
            loop.run_in_executor(ocr_thread_pool, process_page, i, img) 
            for i, img in enumerate(images)
        ]
        
        # Await completion of all parallel page parsers
        completed_pages = await asyncio.gather(*tasks)
        
        # Sort sequentially so merged results don't mix up Page 2 before Page 1
        completed_pages.sort(key=lambda x: x[0])

        for page_idx, ocr_data in completed_pages:
            page_results.append({"page": page_idx + 1, "lines": len(ocr_data)})
            full_ocr.extend(ocr_data)

        logger.info(f"[OCR] Total lines: {len(full_ocr)}")

        # 🔥 FAST FAIL (bad OCR)
        if len(full_ocr) < 2:
            return JSONResponse(content={
                "success": False,
                "filename": file.filename,
                "is_valid": False,
                "validation_reasons": ["Empty or invalid document"],
                "vendor": "Unknown",
                "date": "", "items": [], "total": 0,
                "gst": {"cgst": 0, "sgst": 0, "igst": 0, "base_amount": 0},
            })

        # 🔥 RULE-BASED PARSER
        parsed = parse_invoice(full_ocr)
        parsed["extraction_method"] = "rule-based"

        # 🔥 VALIDATION
        is_valid, confidence, reasons = validate_invoice_result(parsed)

        # 🔥 SMART LLM TRIGGER
        if should_use_llm(parsed, (is_valid, confidence, reasons)):
            logger.info("[LLM] Triggered")
            parsed = await asyncio.to_thread(refine_with_llm, full_ocr, parsed)

            # re-validate
            is_valid, confidence, reasons = validate_invoice_result(parsed)

        # 🔥 FINAL RESPONSE
        response = parsed.copy()
        response.update({
            "filename": file.filename,
            "success": True,
            "is_valid": is_valid,
            "validation_reasons": reasons,
            "confidence_score": confidence,
            "pages": len(images)
        })

        logger.info(f"[DONE] {file.filename} | Valid={is_valid} | Confidence={confidence}")
        
        # 🔥 CACHE SAVE
        save_cached_result(contents, response)

        return JSONResponse(content=response)

    except HTTPException as he:
        raise he

    except Exception as e:
        logger.error(f"[ERROR] {str(e)}")
        import traceback
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

@app.post("/ocr/multi")
async def ocr_multi_api(files: list[UploadFile] = File(...)):
    """
    Process multiple files simultaneously and MERGE them into a single invoice result.
    This is the core of the Multi-Page Smart Scan.
    """
    try:
        if not files:
            raise HTTPException(status_code=400, detail="No files uploaded")
            
        logger.info(f"[API-MULTI] Processing {len(files)} files.")
        
        all_parsed_pages = []
        
        # 1. Load all images from all files
        all_images = []
        for file in files:
            contents = await file.read()
            images = await asyncio.to_thread(load_images, contents, file.filename.lower())
            all_images.extend(images)
            
        if not all_images:
            return JSONResponse(content={
                "success": False,
                "is_valid": False,
                "validation_reasons": ["No readable images found in files"],
                "vendor": "Unknown",
                "date": "", "items": [], "total": 0,
                "gst": {"cgst": 0, "sgst": 0, "igst": 0, "base_amount": 0},
            })

        # 2. Process ALL pages in parallel using the thread pool
        def process_task(idx, img):
            processed = preprocess(img)
            return idx, run_ocr(processed)
            
        loop = asyncio.get_running_loop()
        ocr_tasks = [
            loop.run_in_executor(ocr_thread_pool, process_task, i, img) 
            for i, img in enumerate(all_images)
        ]
        
        # Await completion of all parallel page parsers
        ocr_results = await asyncio.gather(*ocr_tasks)
        ocr_results.sort(key=lambda x: x[0])
        
        # 3. Parse each page result sequentially (lightweight compared to OCR)
        for _, ocr_data in ocr_results:
            if len(ocr_data) < 2:
                continue
            all_parsed_pages.append(parse_invoice(ocr_data))
                
        if not all_parsed_pages:
            return JSONResponse(content={
                "success": False,
                "is_valid": False,
                "validation_reasons": ["Empty or invalid documents"],
                "vendor": "Unknown",
                "date": "", "items": [], "total": 0,
                "gst": {"cgst": 0, "sgst": 0, "igst": 0, "base_amount": 0},
            })
            
        # Merge all pages together using Accounting Intelligence
        final_result = merge_parsed_pages(all_parsed_pages)
        
        final_result["filename"] = "multi_page_scan"
        final_result["success"] = True
        
        logger.info(f"[DONE-MULTI] Valid={final_result.get('is_valid')} | Confidence={final_result.get('confidence_score')}")
        
        return JSONResponse(content=final_result)
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"[ERROR-MULTI] {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)