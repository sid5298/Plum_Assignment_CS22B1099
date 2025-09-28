const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // Define safety settings
        this.safetySettings = [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_ONLY_HIGH",
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_ONLY_HIGH",
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_ONLY_HIGH",
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_ONLY_HIGH",
            },
        ];

        // Default generation config
        this.defaultGenerationConfig = {
            temperature: 0.1,
            topP: 0.1,
            topK: 16,
            maxOutputTokens: 8192, // Increased token limit for safety
        };

        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: this.defaultGenerationConfig,
            safetySettings: this.safetySettings,
        });

        this.retryCount = 3;
        this.retryDelay = 1000;
    }

    async generateContent(prompt) {
        let lastError;
        let lastResponse;

        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                // Structure the prompt properly for the flash model
                const content =
                    typeof prompt === "string"
                        ? {
                              contents: [
                                  { role: "user", parts: [{ text: prompt }] },
                              ],
                              safetySettings: this.safetySettings,
                              generationConfig: this.defaultGenerationConfig,
                          }
                        : {
                              ...prompt,
                              safetySettings: this.safetySettings,
                              generationConfig: {
                                  ...this.defaultGenerationConfig,
                                  ...(prompt.generationConfig || {}),
                              },
                          };

                const result = await this.model.generateContent(content);
                lastResponse = result;

                if (!result || !result.response) {
                    throw new Error("Empty response from Gemini API");
                }

                // Check for safety blocks
                const candidates = result.response.candidates || [];
                if (
                    candidates.length > 0 &&
                    candidates[0].finishReason === "SAFETY"
                ) {
                    console.error("--- Gemini API Safety Block ---");
                    console.error(
                        "Safety Ratings:",
                        JSON.stringify(candidates[0].safetyRatings, null, 2)
                    );
                    throw new Error("Content blocked by safety filters");
                }

                return result;
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed:`, error.message);

                if (lastResponse) {
                    console.error(
                        "Last API Response:",
                        JSON.stringify(lastResponse, null, 2)
                    );
                }

                if (attempt < this.retryCount) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, this.retryDelay * attempt)
                    );
                    continue;
                }
            }
        }

        throw new Error(
            `Gemini API failed after ${this.retryCount} attempts. Last error: ${lastError.message}`
        );
    }

    // Helper method to clean up JSON responses
    async getJsonResponse(prompt) {
        try {
            const result = await this.generateContent(prompt);

            if (!result.response) {
                console.error("--- Debug: No response object ---");
                console.error("Full result:", JSON.stringify(result, null, 2));
                throw new Error("No response from Gemini API");
            }

            let text = result.response.text();

            if (!text) {
                console.error("--- Debug: Empty response text ---");
                console.error(
                    "Response object:",
                    JSON.stringify(result.response, null, 2)
                );

                // Check for specific finish reasons
                const candidate = result.response.candidates?.[0];
                if (candidate?.finishReason === "MAX_TOKENS") {
                    throw new Error(
                        "Response exceeded token limit. Please try with a shorter prompt."
                    );
                }
                throw new Error("Empty response text from Gemini API");
            }

            try {
                // Step 1: Basic cleanup
                let cleanJson = text
                    .replace(/```json\n?|\n?```|```/g, "") // Remove code blocks
                    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces
                    .trim();

                if (!cleanJson) {
                    console.error("--- Empty response after cleanup ---");
                    console.error("Original text:", text);
                    throw new Error("Empty response after cleanup");
                }

                // Step 2: Try direct parsing first
                try {
                    return JSON.parse(cleanJson);
                } catch (parseError) {
                    console.log("Direct parsing failed, attempting cleanup...");

                    // Step 3: Extract JSON from potential text response
                    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        cleanJson = jsonMatch[0];
                    }

                    // Step 4: Aggressive cleanup
                    const furtherCleanedJson = cleanJson
                        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Fix unquoted property names
                        .replace(/'/g, '"') // Fix single quotes
                        .replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas
                        .replace(/\n\s*/g, " ") // Remove newlines
                        .replace(/\s+/g, " ") // Normalize spaces
                        .replace(
                            /"\s*:\s*([^",{\[}\]]+?)(\s*[,}])/g,
                            '": "$1"$2'
                        ); // Quote unquoted values

                    console.error("--- Attempting additional JSON cleanup ---");
                    console.error("Original text length:", text.length);
                    console.error(
                        "Cleaned JSON:",
                        furtherCleanedJson.substring(0, 500) +
                            (furtherCleanedJson.length > 500 ? "..." : "")
                    );

                    return JSON.parse(furtherCleanedJson);
                }
            } catch (parseError) {
                console.error("--- Debug: JSON Parse Error ---");
                console.error("Raw text:", text);
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
        } catch (error) {
            console.error("--- Debug: JSON Response Error ---");
            console.error(error);
            throw new Error(`Failed to get JSON response: ${error.message}`);
        }
    }
}

// Create a singleton instance
const geminiService = new GeminiService();

module.exports = {
    geminiService,
};
