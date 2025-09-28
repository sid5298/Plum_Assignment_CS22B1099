/** @type {import('        // Convert to number and validate
        const num = parseFloat(raw);
        if (isNaN(num) || num < 0) {  // Allow zero, just not negative numbers
            throw new Error(`Invalid amount: ${raw}`);
        }
        
        return num;ig/gemini').GeminiService} */
const { geminiService } = require("../config/gemini");

class NormalizationService {
    // Helper method to clean and validate individual amounts
    cleanAmount(raw) {
        // Remove all currency symbols and text indicators
        raw = raw
            .replace(/[₹$€£¥¢¤]/g, "") // Remove currency symbols
            .replace(
                /\b(?:USD|INR|EUR|GBP|Rs\.?|dollar|rupee|euro|pound)s?\b/gi,
                ""
            ) // Remove currency codes/words
            .replace(/[,\s]/g, "") // Remove commas and spaces first
            .trim();

        // Fix common OCR errors in digits
        raw = raw
            .replace(/[lI]/g, "1") // l or I → 1
            .replace(/O/g, "0") // O → 0
            .replace(/S/g, "5") // S → 5
            .replace(/Z/g, "2") // Z → 2
            .replace(/B/g, "8") // B → 8
            .replace(/[^\d.]/g, ""); // Keep only digits and decimal points

        // Convert to number and validate
        const num = parseFloat(raw);
        if (isNaN(num) || num < 0) {
            // Allow 0 for discount amounts
            throw new Error(`Invalid amount after cleaning: ${raw}`);
        }

        return num;
    }
    async normalizeTokens(rawTokens, fullOcrText) {
        try {
            // Try local cleaning first
            const cleanedTokens = rawTokens
                .map((token) => {
                    try {
                        return this.cleanAmount(token);
                    } catch (e) {
                        return null;
                    }
                })
                .filter((token) => token !== null);

            // Clear prompt requiring strict JSON output
            const prompt = `Return the response in this exact JSON format:
{
  "normalized_amounts": [numbers only],
  "normalization_confidence": number between 0.0 and 1.0
}

Extract ALL valid currency amounts. Be comprehensive and include every monetary value:

Raw Tokens: ${JSON.stringify(rawTokens)}
Context: "${fullOcrText}"

MANDATORY INCLUSIONS from raw tokens:
${rawTokens
    .filter((token) => {
        const num = parseFloat(token);
        return !isNaN(num) && num >= 10 && token.includes(".");
    })
    .map((token) => `- ${token}`)
    .join("\n")}

MEDICAL BILL - Include ALL medical amounts:
- Service charges (745.00, 1000.00)
- Tax amounts (157.05) 
- Totals (1745.00, 1902.05)
- Any amount that could be a medical charge or payment

EXCLUDE ONLY: Phone numbers, dates, invoice numbers, version numbers (1.1).

Example for medical invoice:
{"normalized_amounts":[1902.05,1745.00,1000.00,745.00,157.05],"normalization_confidence":0.95}`;

            // Get AI response
            const result = await geminiService.getJsonResponse(prompt);

            if (!result || !Array.isArray(result.normalized_amounts)) {
                throw new Error("Invalid response structure from AI service");
            }

            // Ensure we don't lose important amounts from raw tokens
            const importantRawAmounts = rawTokens
                .filter((token) => {
                    const num = parseFloat(token);
                    return (
                        !isNaN(num) &&
                        num >= 10 &&
                        num <= 1000 &&
                        token.includes(".")
                    );
                })
                .map((token) => parseFloat(token));

            // Combine and validate results with smarter filtering
            const allAmounts = [
                ...new Set([
                    ...cleanedTokens,
                    ...result.normalized_amounts.map((amt) =>
                        this.cleanAmount(String(amt))
                    ),
                    ...importantRawAmounts, // Add important amounts directly from raw tokens
                ]),
            ]
                .filter((amount) => {
                    // Basic range check - be more inclusive for medical bills
                    if (amount < 0 || amount > 100000) return false;

                    // For medical bills, be more inclusive with small amounts (discounts can be small)
                    if (amount < 0.01) return false; // Only exclude very tiny amounts

                    return true;
                })
                .sort((a, b) => b - a); // Sort by value descending

            // Remove duplicate similar amounts (within 1% of each other)
            const uniqueAmounts = [];
            for (const amount of allAmounts) {
                const isDuplicate = uniqueAmounts.some(
                    (existing) =>
                        Math.abs(existing - amount) /
                            Math.max(existing, amount) <
                        0.01
                );
                if (!isDuplicate) {
                    uniqueAmounts.push(amount);
                }
            }

            // For medical bills, focus on the most likely amounts
            // Keep amounts that are likely to be: MRP, Total, Discount, Shipping, Tax, Service Charges
            const medicalRelevantAmounts = uniqueAmounts.filter((amount) => {
                // Be very inclusive for hospital bills - they have many service charges
                if (amount >= 50 && amount <= 10000) return true; // Main amounts, service charges
                if (amount >= 1 && amount <= 50) return true; // Small charges, co-pays
                if (amount >= 0 && amount <= 1) return true; // Zero amounts
                return false;
            });

            // Keep only the most relevant amounts (top 8 candidates for hospital bills)
            const relevantAmounts =
                medicalRelevantAmounts.length > 8
                    ? medicalRelevantAmounts.slice(0, 8)
                    : medicalRelevantAmounts;

            if (relevantAmounts.length === 0) {
                throw new Error("No valid amounts found");
            }
            return {
                normalized_amounts: relevantAmounts,
                normalization_confidence:
                    result.normalization_confidence || 0.8,
            };
        } catch (error) {
            throw new Error("Normalization failed: " + error.message);
        }
    }

    async classifyAmounts(normalizedAmounts, sourceText) {
        try {
            // First detect which terms actually exist in the OCR text
            const detectedTerms = this.detectTermsInText(sourceText);

            const prompt = `You are analyzing a medical bill/invoice OCR text. CRITICAL: Only classify amounts based on terms actually found in the text.

STRICT RULES:
1. Only use amount types where you can find the exact word or clear synonym in the OCR text
2. Look for "TAX" followed by amount → classify as "tax"  
3. Look for "SUB TOTAL" → classify as "subtotal"
4. Look for "TOTAL" (final) → classify as "total"
5. Look for "Amount DUE" or "DUE" → classify as "due" 
6. Look for service line items like "Full Check Up $745.00" → classify as "other_charges"
7. Percentages (like "9%") are tax rates, not amounts to classify
8. Look for individual service amounts in line items

IMPORTANT: 
- $157.05 near "TAX" = tax amount
- $745.00 near "SUB TOTAL" = subtotal  
- $1902.05 near "TOTAL" = final total
- $1745.00 near "Amount DUE" = due amount
- Individual service amounts like $745.00, $1000.00 = other_charges

Terms detected in text: ${JSON.stringify(detectedTerms)}

Amounts to classify: ${JSON.stringify(normalizedAmounts)}
OCR Text: "${sourceText}"

Return ONLY this JSON format:
{
  "amounts": [
    {
      "type": one of ["total", "subtotal", "tax", "due", "other_charges"], 
      "value": number
    }
  ],
  "confidence": number between 0.0 and 1.0
}

Classify ALL relevant amounts you can find evidence for in the text.`;

            const result = await geminiService.getJsonResponse(prompt);

            if (!result || !Array.isArray(result.amounts)) {
                throw new Error("Invalid classification response");
            }

            // Validate and filter results
            result.amounts = result.amounts.filter((item) => {
                return (
                    item &&
                    typeof item.type === "string" &&
                    [
                        "total",
                        "subtotal",
                        "mrp",
                        "discount",
                        "tax",
                        "due",
                        "paid",
                        "balance",
                        "charges",
                        "other_charges",
                    ].includes(item.type) &&
                    typeof item.value === "number" &&
                    item.value >= 0
                );
            });

            if (result.amounts.length === 0) {
                throw new Error("No valid classified amounts found");
            }

            return {
                amounts: result.amounts,
                confidence: result.confidence || 0.8,
            };
        } catch (error) {
            console.error("Classification error:", error);
            return this.fallbackClassification(normalizedAmounts, sourceText);
        }
    }

    // Helper method to detect which terms actually exist in the OCR text
    detectTermsInText(text) {
        const terms = {};
        const lowerText = text.toLowerCase();

        // Common medical billing terms to look for
        const termPatterns = {
            mrp: /\bmrp\b|maximum\s+retail\s+price/i,
            total: /\btotal\b/i,
            subtotal: /\bsub\s*total\b/i,
            discount: /\bdiscount\b/i,
            tax: /\btax\b|gst|cgst|sgst|igst/i,
            due: /\bdue\b|amount\s+due/i,
            paid: /\bpaid\b|amount\s+paid/i,
            balance: /\balance\b/i,
            charges: /\bcharges\b|charge\b/i,
            registration: /\bregistration\b/i,
            consultation: /\bconsult|examination\b/i,
            room: /\broom\b/i,
            service: /\bservice\b/i,
        };

        for (const [key, pattern] of Object.entries(termPatterns)) {
            if (pattern.test(lowerText)) {
                terms[key] = true;
            }
        }

        return terms;
    }

    // Fallback rule-based classification when AI fails
    fallbackClassification(amounts, context) {
        const contextLower = context.toLowerCase();
        const classifiedAmounts = [];

        // Sort amounts to help with classification (highest first)
        const sortedAmounts = [...amounts].sort((a, b) => b - a);

        // Take only the top 5 most relevant amounts for medical bills
        const topAmounts = sortedAmounts.slice(0, 5);

        for (const amount of topAmounts) {
            let type = "total_bill"; // default
            let confidence = 0.6;

            // Look for keywords near the amount in context
            const amountStr = amount.toString();
            const contextAroundAmount = this.extractContextAroundAmount(
                context,
                amountStr
            );
            const contextLowerAround = contextAroundAmount.toLowerCase();

            // Enhanced pattern matching for medical bills
            if (
                contextLowerAround.includes("mrp") ||
                contextLowerAround.includes("maximum retail")
            ) {
                type = "mrp";
                confidence = 0.8;
            } else if (
                contextLowerAround.includes("check up") ||
                contextLowerAround.includes("examination") ||
                contextLowerAround.includes("consultation") ||
                contextLowerAround.includes("procedure") ||
                contextLowerAround.includes("service") ||
                contextLowerAround.includes("registration") ||
                contextLowerAround.includes("room")
            ) {
                type = "other_charges";
                confidence = 0.8;
            } else if (
                contextLowerAround.includes("amount due") ||
                contextLowerAround.includes("due")
            ) {
                type = "due";
                confidence = 0.9;
            } else if (
                contextLowerAround.includes("discount") ||
                contextLowerAround.includes("saving")
            ) {
                type = "discount";
                confidence = 0.8;
            } else if (
                contextLowerAround.includes("total") &&
                !contextLowerAround.includes("sub")
            ) {
                type = "total";
                confidence = 0.9;
            } else if (
                contextLowerAround.includes("sub total") ||
                contextLowerAround.includes("subtotal")
            ) {
                type = "subtotal";
                confidence = 0.9;
            } else if (
                contextLowerAround.includes("amount paid") ||
                contextLowerAround.includes("paid")
            ) {
                type = "paid";
                confidence = 0.9;
            } else if (contextLowerAround.includes("balance")) {
                type = "balance";
                confidence = 0.9;
            } else if (
                contextLowerAround.includes("tax") ||
                contextLowerAround.includes("gst") ||
                contextLowerAround.includes("cgst") ||
                contextLowerAround.includes("sgst")
            ) {
                type = "tax";
                confidence = 0.7;
            } else if (
                contextLowerAround.includes("charges") ||
                contextLowerAround.includes("charge")
            ) {
                type = "charges";
                confidence = 0.7;
            } else {
                // Do NOT classify amounts without clear term evidence
                // Only add amounts where we found actual terms in the text
                continue;
            }

            classifiedAmounts.push({ type, value: amount });
        }

        return {
            amounts: classifiedAmounts,
            confidence: 0.6, // Lower confidence for fallback
        };
    }

    // Helper to extract context around an amount
    extractContextAroundAmount(text, amountStr) {
        const lines = text.split("\n");
        for (const line of lines) {
            if (line.includes(amountStr)) {
                return line;
            }
        }
        return text.substring(0, 200); // Return first 200 chars if not found
    }
}

module.exports = new NormalizationService();
