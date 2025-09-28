const vision = require("@google-cloud/vision");
const sharp = require("sharp");
const fs = require("fs").promises;
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

class OcrService {
    constructor() {
        try {
            // Use environment variables for credentials
            const credentials = {
                type:
                    process.env.GOOGLE_SERVICE_ACCOUNT_TYPE ||
                    "service_account",
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(
                    /\\n/g,
                    "\n"
                ), // Handle escaped newlines
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri:
                    process.env.GOOGLE_AUTH_URI ||
                    "https://accounts.google.com/o/oauth2/auth",
                token_uri:
                    process.env.GOOGLE_TOKEN_URI ||
                    "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url:
                    process.env.GOOGLE_AUTH_PROVIDER_CERT_URL ||
                    "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
                universe_domain:
                    process.env.GOOGLE_UNIVERSE_DOMAIN || "googleapis.com",
            };

            this.client = new vision.ImageAnnotatorClient({
                credentials: credentials,
                projectId: process.env.GOOGLE_PROJECT_ID,
            });
        } catch (error) {
            console.error(
                "Failed to initialize Google Cloud Vision client:",
                error
            );
            throw new Error(
                `Vision API initialization failed: ${error.message}`
            );
        }
    }
    normalizeCurrencySymbols(text) {
        // Normalize currency symbols and ensure proper separation from digits
        return (
            text
                // Fix INR/Rupee symbols
                .replace(/(?:Rs\.?|RS\.?|R5\.?|P5\.?|rs\.?)\s*(?=\d)/g, "₹ ") // Replace Rs, RS, etc. with space
                .replace(/(?<=\d)\s*(?:INR|inr)/g, " ₹") // Replace INR after numbers with space
                .replace(/[7１3]\s*(?=\d{2,})/g, "₹ ") // Replace misrecognized ₹ as 7,１, or 3

                // Fix USD symbols
                .replace(/\$\s*(?=\d)/g, "$ ") // Ensure space after $ before digits
                .replace(/(?<=\d)\s*USD/g, " $") // Replace USD after numbers

                // Fix EUR symbols
                .replace(/€\s*(?=\d)/g, "€ ") // Ensure space after € before digits
                .replace(/(?<=\d)\s*EUR/g, " €") // Replace EUR after numbers

                // Fix GBP symbols
                .replace(/£\s*(?=\d)/g, "£ ") // Ensure space after £ before digits
                .replace(/(?<=\d)\s*GBP/g, " £") // Replace GBP after numbers

                // General cleanup
                .replace(/(\d+)[,\s]*(\d{3})(?!\d)/g, "$1$2") // Fix thousand separators
                .replace(/([₹$€£])\s*(\d)/g, "$1 $2") // Ensure space between currency and digits
                .replace(/(\d)\s*([₹$€£])/g, "$1 $2")
        ); // Ensure space between digits and currency
    }

    extractRawTokens(text) {
        // Ensure text is a string
        const textStr = String(text || "").trim();

        // Initialize result object
        const result = {
            raw_tokens: [],
            currency_hint: null,
            confidence: 0,
        };

        // If text is empty, return no amounts found
        if (!textStr) {
            return {
                status: "no_amounts_found",
                reason: "document too noisy",
            };
        }

        // Look for currency indicators - check for multiple currencies
        const usdMatch = textStr.match(/\$|USD|dollar/i);
        const inrMatch = textStr.match(/₹|INR|Rs\.?|rupee/i);
        const eurMatch = textStr.match(/€|EUR|euro/i);
        const gbpMatch = textStr.match(/£|GBP|pound/i);

        if (usdMatch) {
            result.currency_hint = "USD";
        } else if (inrMatch) {
            result.currency_hint = "INR";
        } else if (eurMatch) {
            result.currency_hint = "EUR";
        } else if (gbpMatch) {
            result.currency_hint = "GBP";
        } else {
            // Default based on context or region - but don't assume INR
            result.currency_hint = "USD"; // Default to USD for international medical bills
        }

        // Extract numeric tokens - ensure currency symbols are separated
        // Match pure numbers (with decimals) or percentages, but not mixed with currency symbols
        const numericPattern = /\b\d+(?:\.\d+)?\b(?:%)?/g;
        const matches = textStr.match(numericPattern) || [];

        // Filter out obvious non-amounts (dates, codes, etc.)
        result.raw_tokens = matches.filter((token) => {
            // Exclude obvious dates (DD/MM/YYYY or YYYY-MM-DD patterns)
            if (token.match(/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/)) return false;

            // Exclude phone numbers (10+ digits)
            if (token.match(/^\d{10,}$/)) return false;

            // Exclude codes (alphanumeric patterns)
            if (token.match(/^[A-Z0-9]{5,}$/i)) return false;

            // Parse as number for additional filtering
            const num = parseFloat(token);

            // Exclude very small amounts (likely quantities or codes)
            if (!isNaN(num) && num < 0.1) return false;

            // Exclude very large amounts (likely invoice numbers, PINs, etc.)
            if (!isNaN(num) && num > 50000) return false;

            // Exclude single digits (likely quantities)
            if (/^\d$/.test(token) && num < 10) return false;

            // Exclude percentages without % symbol but look like percentages
            if (!isNaN(num) && num > 0 && num < 1 && token.includes("."))
                return false;

            return true;
        });

        // Calculate confidence based on various factors
        const hasExpectedTokens = result.raw_tokens.length >= 1;
        const hasCurrencyHint = !!(
            usdMatch ||
            inrMatch ||
            eurMatch ||
            gbpMatch
        );
        const hasCommonKeywords =
            text.match(
                /(?:total|amount|paid|due|balance|discount|gross|bill|payable|charges|fee|tax|gst|cgst|sgst|igst|shipping|handling|delivery|mrp|subtotal|invoice)/i
            ) !== null;

        // Confidence calculation (simple weighted average)
        result.confidence = Number(
            (
                ((hasExpectedTokens ? 0.4 : 0) +
                    (hasCurrencyHint ? 0.3 : 0) +
                    (hasCommonKeywords ? 0.3 : 0)) *
                (text.length > 10 ? 1 : 0.5)
            ).toFixed(2)
        );

        // Return failure case if confidence is too low or no tokens found
        if (result.confidence < 0.3 || result.raw_tokens.length === 0) {
            return {
                status: "no_amounts_found",
                reason: "document too noisy",
            };
        }

        return result;
    }
    async preprocessImage(imagePath) {
        try {
            const processedImagePath = path.join(
                path.dirname(imagePath),
                `processed-${path.basename(imagePath)}`
            );

            // Get image metadata
            const metadata = await sharp(imagePath).metadata();

            // Process image with improved settings for better symbol recognition
            await sharp(imagePath)
                // Crop 15% from top to remove status bars/headers
                .extract({
                    left: 0,
                    top: Math.floor(metadata.height * 0.15),
                    width: metadata.width,
                    height: Math.floor(metadata.height * 0.85),
                })
                .greyscale() // Convert to grayscale
                // Enhanced contrast and brightness for better symbol recognition
                .modulate({
                    brightness: 1.1,
                    contrast: 1.2,
                })
                .sharpen({
                    // Refined sharpening for clearer text and symbols
                    sigma: 1.2,
                    m1: 0.6,
                    m2: 0.6,
                    x1: 2,
                    y2: 10,
                    y3: 20,
                })
                // Gaussian blur to reduce noise while preserving symbol shapes
                .blur(0.5)
                .normalize() // Normalize contrast
                // Adaptive thresholding for better symbol preservation
                .threshold(128, {
                    grayscale: true,
                })
                // Slight resize to improve symbol recognition
                .resize({
                    width: Math.floor(metadata.width * 1.5),
                    height: Math.floor(metadata.height * 1.5),
                    fit: "fill",
                    kernel: "lanczos3",
                })
                .toFile(processedImagePath);

            return processedImagePath;
        } catch (error) {
            throw new Error("Image preprocessing failed: " + error.message);
        }
    }

    async extractText(imagePath) {
        try {
            // Read the image file
            const imageBuffer = await fs.readFile(imagePath);

            // Perform OCR using Google Cloud Vision API
            const [result] = await this.client.textDetection({
                image: {
                    content: imageBuffer,
                },
                imageContext: {
                    languageHints: ["en"],
                },
            });

            const textAnnotations = result.textAnnotations;

            if (!textAnnotations || textAnnotations.length === 0) {
                return {
                    status: "no_amounts_found",
                    reason: "OCR failed to extract text",
                };
            }

            // Get the full text from the first annotation
            const extractedText = textAnnotations[0].description;

            // Post-process to normalize rupee representations
            const processedText = this.normalizeCurrencySymbols(extractedText);

            // Extract structured data with raw tokens
            const processedResult = this.extractRawTokens(processedText);

            // If no amounts found, return early
            if (processedResult.status === "no_amounts_found") {
                return processedResult;
            }

            // Add confidence from Google Cloud Vision
            if (processedResult.confidence) {
                const avgConfidence = textAnnotations[0].confidence || 0.5;
                processedResult.confidence = Number(
                    (processedResult.confidence * avgConfidence).toFixed(2)
                );
            }

            // Add processed text to the result for context
            processedResult.processedText = processedText;

            console.log("Extracted data:", processedResult);
            return processedResult;
        } catch (error) {
            throw new Error("OCR failed: " + error.message);
        }
    }
}

module.exports = new OcrService();
