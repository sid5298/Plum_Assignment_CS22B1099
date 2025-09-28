#  AI-Powered Amount Detection in Medical Documents

> **Problem Statement 8**: Intelligent financial amount extraction and classification from medical bills, invoices, and receipts using advanced OCR and AI technologies.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-orange.svg)](https://ai.google.dev/)

## Overview

This comprehensive service extracts and classifies financial amounts from medical documents using a sophisticated 4-step pipeline. It handles various medical billing formats including hospital invoices, pharmacy bills, and diagnostic reports with multi-currency support and robust error handling.


##  Architecture & Tech Stack

### Core Technologies

- **Backend Framework**: Express.js 4.x
- **AI Model**: Google Gemini 2.5 Flash
- **OCR Engine**: Google Cloud Vision API
- **Image Processing**: Sharp
- **File Upload**: Multer
- **Runtime**: Node.js 18+

### System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   File Upload   │───▶│   OCR Service    │───▶│ Normalization       │
│   (Multer)      │    │ (Cloud Vision)   │    │ Service (Gemini AI) │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                                                          │
┌─────────────────┐    ┌──────────────────┐              │
│ Final Structured│◀───│  Classification  │◀─────────────┘
│     Output      │    │   & Validation   │
└─────────────────┘    └──────────────────┘
```
##  Quick Start

### Prerequisites

- Node.js 18+ installed
- Google Cloud Vision API key
- Google Gemini API key

### Installation

1. **Clone the repository**

    ```bash
    git clone <repository-url>
    cd PLUM
    ```

2. **Install dependencies**

    ```bash
    npm install
    ```

3. **Environment setup**

    ```bash
    # Create environment file
    cp .env.example .env

    # Add your API keys to .env:
    echo "GOOGLE_CLOUD_VISION_API_KEY=your_vision_api_key" >> .env
    echo "GEMINI_API_KEY=your_gemini_api_key" >> .env
    ```

4. **Start the server**
    ```bash
    npm start
    # Server runs on http://localhost:3000
    ```

##  API Documentation

### Main Endpoint

#### `POST /api/detect-amounts`

Extracts and classifies amounts from uploaded medical document images.

**Request:**

```http
POST /api/detect-amounts
Content-Type: multipart/form-data
Body: image file (JPEG, PNG, PDF)
```

**Response Structure:**

```json
{
    "step1_ocr_extraction": {
        "raw_tokens": ["1299.90", "145.64", "1154.26"],
        "currency_hint": "INR",
        "confidence": 0.8
    },
    "step2_normalization": {
        "normalized_amounts": [1299.9, 1154.26, 145.64],
        "normalization_confidence": 0.95
    },
    "step3_classification": {
        "amounts": [
            { "type": "mrp", "value": 1299.9 },
            { "type": "discount", "value": 145.64 },
            { "type": "total", "value": 1154.26 }
        ],
        "confidence": 0.98
    },
    "step4_final_output": {
        "currency": "INR",
        "amounts": [
            {
                "type": "mrp",
                "value": 1299.9,
                "source": "text: 'MRP Total ₹1299.90'"
            },
            {
                "type": "discount",
                "value": 145.64,
                "source": "text: 'Total savings ₹145.64'"
            },
            {
                "type": "total",
                "value": 1154.26,
                "source": "text: 'Total Invoice Amount ₹1154.26'"
            }
        ],
        "status": "ok"
    }
}
```


## Supported Document Types

### 1.  Pharmacy/Medicine Bills

- **MRP**: Maximum Retail Price of medicines
- **Discount**: Medicine discounts, scheme savings
- **Total**: Final payable amount after discounts
- **Tax**: GST on pharmaceutical products

### 2. Hospital Service Bills

- **Service Charges**: Room rent, consultation, procedures
- **Subtotal**: Total before discounts
- **Due/Balance**: Outstanding amount
- **Paid**: Previous payments made

### 3.  Diagnostic/Clinic Bills

- **Test Charges**: Lab tests, X-rays, scans
- **Consultation Fees**: Doctor visit charges
- **Total**: Final bill amount

##  Amount Classification Types

| Type            | Description           | Examples                        |
| --------------- | --------------------- | ------------------------------- |
| `mrp`           | Maximum Retail Price  | Medicine MRP totals             |
| `total`         | Final bill amount     | Grand total, final payable      |
| `subtotal`      | Pre-discount total    | Subtotal before taxes           |
| `discount`      | Discounts and savings | Insurance discounts, promotions |
| `tax`           | Tax amounts           | GST, VAT, sales tax             |
| `due`           | Outstanding balance   | Amount due, pending payment     |
| `paid`          | Previous payments     | Amount already paid             |
| `balance`       | Current balance       | Remaining balance               |
| `charges`       | General charges       | Processing fees, handling       |
| `other_charges` | Specific services     | Room rent, consultation, tests  |

##  Multi-Currency Support

| Currency      | Symbol | Code | Region         |
| ------------- | ------ | ---- | -------------- |
| US Dollar     | $      | USD  | United States  |
| Indian Rupee  | ₹      | INR  | India          |
| Euro          | €      | EUR  | European Union |
| British Pound | £      | GBP  | United Kingdom |

##  4-Step Processing Pipeline

### Step 1: OCR Extraction

- **Technology**: Google Cloud Vision API
- **Process**: Extract raw text and numeric tokens
- **Output**: Raw tokens array with confidence score

### Step 2: Normalization

- **Technology**: Custom algorithms + Gemini AI
- **Process**: Clean OCR artifacts, correct digit errors
- **Output**: Normalized amount array with confidence

### Step 3: Classification

- **Technology**: Google Gemini 2.5 Flash
- **Process**: Context-based amount type classification
- **Output**: Classified amounts with type labels

### Step 4: Final Output

- **Process**: Structure final JSON with source provenance
- **Output**: Production-ready structured data

##  Error Handling & Validation

### OCR Error Handling

- **Digit Correction**: Common OCR misreads (O→0, I→1, S→5)
- **Noise Filtering**: Remove non-financial text artifacts
- **Confidence Thresholds**: Validate OCR accuracy scores

### AI Validation

- **Response Validation**: Ensure proper JSON structure
- **Amount Validation**: Range checks and type validation
- **Fallback Logic**: Rule-based classification when AI fails

##  Assignment Compliance

### Problem Statement 8 Requirements

-  **Step 1**: OCR/Text Extraction with confidence scoring
-  **Step 2**: Normalization with digit error correction
-  **Step 3**: Context-based amount classification
-  **Step 4**: Final structured output with source provenance

-  Certainly.

The backend service for the AI-Powered Amount Detection is deployed and live on Render.

You can test the API directly using a tool like Postman. Make a POST request to the following endpoint:

https://plum-assignment-cs22b1099.onrender.com/api/detect-amounts

To test it in Postman:

Set the request type to POST.

Enter the URL above.

Go to the Body tab and select form-data.

In the KEY column, enter image.

In the VALUE column, change the type from "Text" to "File" and then upload a medical bill image (JPEG, PNG, etc.).

Click Send.

You should receive the structured JSON response with the extracted amounts.
