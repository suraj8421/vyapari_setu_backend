/**
 * Maps the generic Python AI extraction result strictly to the application's database schema payload.
 * Also performs hard numeric validation (ensuring Qty * Rate matches Total).
 */
export function mapToSchema(aiResult) {
    if (!aiResult) return null;

    const {
        invoice_no,
        vendor,
        gstin,
        date,
        items: aiItems = [],
        total,
        supplier_exists,
        matched_supplier_id,
        matched_supplier,
        gst: aiGst = {},
        filename,
        pages,
        is_valid,
        confidence_score,
        validation_reasons
    } = aiResult;

    const detectedGstRate = Number(aiGst.gst_rate) || 0;

    // 1. Map Form Level Data
    let noteParts = [];
    if (date) noteParts.push(`Date: ${date}`);
    if (gstin) noteParts.push(`GSTIN: ${gstin}`);
    if (detectedGstRate > 0) noteParts.push(`Overall GST: ${detectedGstRate}%`);

    const form = {
        invoiceNumber: invoice_no || '',
        date: date || '',
        gstin: gstin || '',
        overallGst: detectedGstRate > 0 ? `${detectedGstRate}%` : '',
        notes: '',
        supplierId: matched_supplier_id || '',
    };

    // 2. Map Items with Numeric Validation
    let mappedItems = [];
    
    if (Array.isArray(aiItems) && aiItems.length > 0) {
        mappedItems = aiItems.map(item => {
            const name = item.name || item.description || '';
            let quantity = Number(item.qty ?? item.quantity ?? 1);
            let unitPrice = Number(item.rate ?? item.unit_price ?? 0);
            let gstRate = Number(item.gst_rate ?? 0);

            // Fallback to document level GST if item GST is missing
            if (gstRate === 0 && detectedGstRate > 0) {
                gstRate = detectedGstRate;
            }

            // Numeric Validation: Ensure Qty * Rate = Amount
            const extractedAmount = Number(item.amount || 0);
            
            if (isNaN(quantity) || quantity <= 0) quantity = 1;
            if (isNaN(unitPrice)) unitPrice = 0;

            if (extractedAmount > 0 && unitPrice > 0) {
                const computedTotal = quantity * unitPrice;
                // If the math is wrong by more than a small rounding margin, adjust quantity
                if (Math.abs(computedTotal - extractedAmount) > 5) {
                    quantity = Math.round(extractedAmount / unitPrice);
                }
            }

            return {
                productId: item.productId || '', // Added by semanticMatcher
                _extractedName: name,
                _exists: !!item.exists,          // Added by semanticMatcher
                _hsnExists: item.hsn_exists ?? true,
                quantity: quantity,
                unitPrice: unitPrice,
                gstRate: isNaN(gstRate) ? 0 : gstRate,
                hsnCode: item.hsn_code || '',
            };
        });
    } else {
        mappedItems = [{ productId: '', quantity: 1, unitPrice: 0, gstRate: 0 }];
    }

    // Return the final mapped payload ready for the frontend review modal
    return {
        success: true,
        filename,
        pages,
        is_valid,
        confidence_score,
        validation_reasons,
        
        // Mapped Payload
        form,
        items: mappedItems,
        
        // UI Hints
        vendorHint: vendor || '',
        totalHint: total || 0,
        supplierExists: !!supplier_exists,
        matchedSupplier: matched_supplier || null
    };
}
