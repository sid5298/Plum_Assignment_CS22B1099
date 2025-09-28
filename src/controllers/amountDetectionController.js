const ocrService = require('../services/ocrService');
const normalizationService = require('../services/normalizationService');

class AmountDetectionController {
    async detectAmounts(req, res) {
        try {
            const file = req.file;
            if (!file) {
                return res.status(400).json({
                    status: "no_amounts_found",
                    reason: "No file uploaded"
                });
            }

            // Step 1: OCR/Text Extraction
            const preprocessedImage = await ocrService.preprocessImage(file.path);
            const ocrResult = await ocrService.extractText(preprocessedImage);

            // Format OCR result with grouped tokens
            const step1Output = {
                raw_tokens: AmountDetectionController.formatNumericTokens(ocrResult.raw_tokens),
                currency_hint: ocrResult.currency_hint,
                confidence: ocrResult.confidence
            };

            console.log('Step 1 - OCR Result:', 
                JSON.stringify(step1Output, null, 2)
                    .replace(/\[\n\s+/g, '[')
                    .replace(/,\n\s+/g, ', ')
                    .replace(/\n\s+\]/g, ']')
            );

            if (ocrResult.status === "no_amounts_found") {
                return res.status(400).json(ocrResult);
            }

            // Step 2: Normalization
            const normalizedResult = await normalizationService.normalizeTokens(
                ocrResult.raw_tokens,
                ocrResult.processedText || ''
            );

            // Format normalized result with filtered amounts
            const step2Output = {
                normalized_amounts: AmountDetectionController.formatNormalizedAmounts(normalizedResult.normalized_amounts),
                normalization_confidence: normalizedResult.normalization_confidence
            };

            console.log('Step 2 - Normalized Result:', 
                JSON.stringify(step2Output, null, 2)
                    .replace(/\[\n\s+/g, '[')
                    .replace(/,\n\s+/g, ', ')
                    .replace(/\n\s+\]/g, ']')
            );

            // Step 3: Classification
            const classifiedResult = await normalizationService.classifyAmounts(
                step2Output.normalized_amounts,
                ocrResult.processedText || ''
            );

            // Format classified result
            const step3Output = {
                amounts: classifiedResult.amounts,
                confidence: classifiedResult.confidence
            };

            console.log('Step 3 - Classified Result:', JSON.stringify(step3Output, null, 2));

            // Step 4: Final Output with Provenance
            const finalAmounts = classifiedResult.amounts.map(amount => ({
                type: amount.type,
                value: amount.value,
                source: `text: '${AmountDetectionController.findLineWithAmount(
                    ocrResult.processedText || '',
                    amount.value,
                    amount.type
                )}'`
            }));

            const step4Output = {
                currency: ocrResult.currency_hint,
                amounts: finalAmounts,
                status: "ok"
            };

            console.log('Step 4 - Final Output:', JSON.stringify(step4Output, null, 2));

            // Return final response with all steps
            const response = {
                step1_ocr_extraction: step1Output,
                step2_normalization: step2Output,
                step3_classification: step3Output,
                step4_final_output: step4Output
            };

            return res.status(200).json(response);

        } catch (error) {
            console.error('Error in detectAmounts:', error);
            return res.status(500).json({
                status: "error",
                reason: error.message
            });
        }
    }

    static formatNumericTokens(tokens) {
        // Filter out non-numeric tokens and tokens that are likely dates or codes
        const numericTokens = tokens.filter(token => {
            const cleanToken = token.replace(/[₹$€£¥]/g, '').trim();
            return /^-?\d+(\.\d+)?%?$/.test(cleanToken) && 
                   !/^(19|20)\d{2}$/.test(cleanToken) &&
                   cleanToken.length < 10;
        });

        return AmountDetectionController.groupTokens(numericTokens);
    }

// ...existing code...

 static formatNormalizedAmounts(amounts) {
    const validAmounts = amounts.filter(amount => {
        const num = Number(amount);
        return !isNaN(num) && 
               num > 0 && // Changed back to > 0 to exclude zero
               num <= 1000000 && 
               !Number.isInteger(num / 100); // The '|| num === 0' is no longer needed
    });

    return AmountDetectionController.groupTokens(validAmounts);
}
    static groupTokens(arr) {
        const groups = [];
        const groupSize = 4;
        
        for (let i = 0; i < arr.length; i += groupSize) {
            groups.push(arr.slice(i, i + groupSize));
        }

        // Return flat array if only one group
        return groups.length === 1 ? groups[0] : groups.flat();
    }

    static findLineWithAmount(text, value, type) {
        if (!text) return `${type}: ${value}`;

        const lines = text.split('\n');
        const keywords = {
            total_bill: ['total', 'bill', 'gross', 'amount', 'payable'],
            paid: ['paid', 'payment', 'received'],
            due: ['due', 'balance', 'pending'],
            discount: ['discount', 'off', 'savings']
        };

        const typeKeywords = keywords[type] || [type];
        const amountFormats = [
            value.toString(),
            value.toFixed(2),
            `₹${value}`,
            `Rs${value}`,
            `Rs.${value}`
        ];
        
        // First pass: Look for lines with both keyword and value
        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            if (typeKeywords.some(keyword => lowerLine.includes(keyword.toLowerCase())) 
                && amountFormats.some(format => line.includes(format))) {
                return line.trim();
            }
        }

        // Second pass: Just look for the value
        for (const line of lines) {
            if (amountFormats.some(format => line.includes(format))) {
                return line.trim();
            }
        }

        // Fallback
        return `${type}: ${value}`;
    }
}

module.exports = new AmountDetectionController();