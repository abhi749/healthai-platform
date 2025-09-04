export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const formData = await request.formData();
    const pdfFile = formData.get('pdfFile');
    const documentText = formData.get('documentText');
    
    let textToProcess;
    
    if (pdfFile && pdfFile instanceof File) {
      console.log('Processing PDF file:', pdfFile.name, 'Size:', pdfFile.size);
      
      // Convert PDF to text using Cloudflare's built-in capabilities
      textToProcess = await extractTextFromPDF(pdfFile);
      
      if (!textToProcess || textToProcess.trim().length < 50) {
        throw new Error('Unable to extract readable text from PDF. Please ensure the document contains text (not just images).');
      }
    } else if (documentText) {
      textToProcess = documentText;
    } else {
      throw new Error('Either PDF file or document text must be provided');
    }

    console.log('Extracted text length:', textToProcess.length);

    // Enhanced extraction prompt for ANY medical parameters
    const extractionPrompt = `You are a medical data extraction AI. Your job is to:

1. IDENTIFY all health/medical parameters from this document
2. SEPARATE personal identifiers from medical data  
3. OUTPUT structured data in JSON format

Document Text:
${textToProcess}

EXTRACT ALL medical parameters you find. This could include:
- Lab values (cholesterol, glucose, hemoglobin, etc.)
- Vital signs (blood pressure, heart rate, temperature, weight)
- Body composition (BMI, body fat %, muscle mass, bone density)
- Hormones (testosterone, estrogen, thyroid, cortisol, insulin)
- Vitamins & minerals (D3, B12, iron, calcium, folate)
- Metabolic markers (A1C, fasting glucose, ketones)
- Cardiac markers (troponin, BNP, CK-MB)
- Inflammatory markers (CRP, ESR, white blood cell count)
- Liver function (ALT, AST, bilirubin, albumin)
- Kidney function (creatinine, BUN, eGFR)
- Lipid profile (total cholesterol, HDL, LDL, triglycerides)
- Blood count (RBC, WBC, platelets, hematocrit)
- Reproductive health markers
- Genetic markers or DNA analysis results
- Sleep study data
- Fitness/activity data
- Nutritional analysis results
- ANY other health-related measurements

IMPORTANT RULES:
- Do NOT include personal identifiers (names, addresses, phone numbers, IDs, SSN)
- Do NOT include doctor names, clinic names, or provider info
- DO include test dates, reference ranges, and units
- DO include ALL numerical health measurements you find
- BE COMPREHENSIVE - don't miss any health parameter
- If a value has units, include them (mg/dL, mmol/L, %, etc.)
- If reference ranges are provided, capture them

OUTPUT FORMAT (JSON):
{
  "personalDataFound": ["name", "address", "phone", "dob"],
  "healthParameters": [
    {
      "category": "Cardiovascular",
      "parameter": "Total Cholesterol", 
      "value": "240",
      "unit": "mg/dL",
      "referenceRange": "<200",
      "date": "2024-08-15",
      "status": "High"
    },
    {
      "category": "Metabolic",
      "parameter": "Glucose Fasting",
      "value": "110", 
      "unit": "mg/dL",
      "referenceRange": "70-99",
      "date": "2024-08-15",
      "status": "Elevated"
    }
  ],
  "documentType": "Lab Results",
  "testDate": "2024-08-15",
  "totalParametersFound": 12,
  "laboratoryName": "Quest Diagnostics",
  "testingFacility": "Downtown Lab"
}

Extract from this document now:`;

    console.log('Sending extraction request to AI...');
    
    // Use Llama to intelligently extract health parameters
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: extractionPrompt,
      max_tokens: 1500,
      temperature: 0.1 // Low temperature for consistent extraction
    });

    console.log('AI extraction response received, length:', aiResponse?.response?.length);

    if (!aiResponse || !aiResponse.response) {
      throw new Error('Empty response from extraction AI');
    }

    // Try to parse JSON response
    let extractedData;
    try {
      // Extract JSON from AI response (sometimes has extra text)
      const jsonMatch = aiResponse.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
        
        // Validate extracted data structure
        if (!extractedData.healthParameters) {
          extractedData.healthParameters = [];
        }
        if (!Array.isArray(extractedData.healthParameters)) {
          extractedData.healthParameters = [];
        }
        
        // Ensure all parameters have required fields
        extractedData.healthParameters = extractedData.healthParameters.map(param => ({
          category: param.category || 'General',
          parameter: param.parameter || 'Unknown Parameter',
          value: param.value || '0',
          unit: param.unit || '',
          referenceRange: param.referenceRange || param.reference_range || '',
          date: param.date || extractedData.testDate || new Date().toISOString().split('T')[0],
          status: param.status || 'Normal'
        }));
        
        extractedData.totalParametersFound = extractedData.healthParameters.length;
        
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw AI response:', aiResponse.response);
      
      // Fallback: Try to extract parameters using regex if JSON parsing fails
      extractedData = await fallbackParameterExtraction(textToProcess, env);
      extractedData.parseError = parseError.message;
      extractedData.rawAIResponse = aiResponse.response;
    }

    // Additional validation and cleanup
    if (!extractedData.documentType) {
      extractedData.documentType = detectDocumentType(textToProcess);
    }
    
    if (!extractedData.testDate) {
      extractedData.testDate = extractTestDate(textToProcess);
    }

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      processingInfo: {
        model: 'llama-3.1-8b-instruct',
        extractionMethod: 'AI-powered dynamic extraction with PDF processing',
        textLength: textToProcess.length,
        timestamp: new Date().toISOString(),
        pdfProcessed: !!pdfFile
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Extraction error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to extract health parameters from document'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Extract text from PDF using Cloudflare's capabilities
async function extractTextFromPDF(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    
    // Simple PDF text extraction - this is a basic implementation
    // In production, you'd want a more robust PDF parsing library
    const text = await basicPDFTextExtraction(arrayBuffer);
    
    return text;
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    throw new Error('Failed to extract text from PDF: ' + error.message);
  }
}

// Basic PDF text extraction (simplified)
async function basicPDFTextExtraction(arrayBuffer) {
  try {
    // Convert PDF bytes to string and look for text patterns
    const uint8Array = new Uint8Array(arrayBuffer);
    let text = '';
    
    // This is a very basic approach - look for text between specific PDF markers
    const decoder = new TextDecoder('latin1');
    const pdfString = decoder.decode(uint8Array);
    
    // Extract text using basic PDF text patterns
    const textMatches = pdfString.match(/\(([^)]+)\)/g);
    if (textMatches) {
      text = textMatches
        .map(match => match.slice(1, -1))
        .filter(t => t.length > 1)
        .join(' ');
    }
    
    // Also try to find text between BT and ET markers (PDF text objects)
    const btETMatches = pdfString.match(/BT\s+(.*?)\s+ET/gs);
    if (btETMatches) {
      const btETText = btETMatches
        .map(match => match.replace(/BT\s+|\s+ET/g, ''))
        .join(' ');
      text += ' ' + btETText;
    }
    
    // Clean up the extracted text
    text = text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\d.,;:()\-\/]/g, ' ')
      .trim();
    
    if (text.length < 20) {
      throw new Error('Insufficient text extracted from PDF');
    }
    
    return text;
  } catch (error) {
    console.error('Basic PDF extraction failed:', error);
    throw new Error('PDF text extraction failed - document may be image-based or corrupted');
  }
}

// Fallback parameter extraction using regex patterns
async function fallbackParameterExtraction(textToProcess, env) {
  console.log('Using fallback parameter extraction');
  
  const patterns = [
    // Cholesterol patterns
    /(?:total\s+)?cholesterol[:\s]*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/gi,
    // Glucose patterns  
    /(?:fasting\s+)?glucose[:\s]*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/gi,
    // Blood pressure
    /(?:blood\s+pressure|bp)[:\s]*(\d+)\/(\d+)\s*(mmhg)?/gi,
    // HDL/LDL
    /(hdl|ldl)[:\s]*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/gi,
    // Triglycerides
    /triglycerides?[:\s]*(\d+(?:\.\d+)?)\s*(mg\/dl|mmol\/l)?/gi,
    // A1C
    /(?:hemoglobin\s+)?a1c[:\s]*(\d+(?:\.\d+)?)\s*(%)?/gi,
    // TSH
    /tsh[:\s]*(\d+(?:\.\d+)?)\s*(miu\/l|uiu\/ml)?/gi,
    // Vitamin D
    /vitamin\s+d[:\s]*(\d+(?:\.\d+)?)\s*(ng\/ml|nmol\/l)?/gi
  ];
  
  const healthParameters = [];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(textToProcess)) !== null) {
      const paramName = match[0].split(/[:\s]/)[0].trim();
      const value = match[1] || match[2];
      const unit = match[2] || match[3] || '';
      
      if (paramName && value) {
        healthParameters.push({
          category: categorizeParameter(paramName),
          parameter: paramName.charAt(0).toUpperCase() + paramName.slice(1),
          value: value,
          unit: unit,
          referenceRange: '',
          date: new Date().toISOString().split('T')[0],
          status: 'Unknown'
        });
      }
    }
  });
  
  return {
    personalDataFound: [],
    healthParameters: healthParameters,
    documentType: 'Health Report',
    testDate: new Date().toISOString().split('T')[0],
    totalParametersFound: healthParameters.length,
    extractionMethod: 'Fallback regex extraction'
  };
}

// Categorize health parameters
function categorizeParameter(paramName) {
  const param = paramName.toLowerCase();
  
  if (param.includes('cholesterol') || param.includes('hdl') || param.includes('ldl') || 
      param.includes('triglycerides') || param.includes('blood pressure')) {
    return 'Cardiovascular';
  }
  if (param.includes('glucose') || param.includes('a1c') || param.includes('insulin')) {
    return 'Metabolic';
  }
  if (param.includes('tsh') || param.includes('t3') || param.includes('t4') || 
      param.includes('testosterone') || param.includes('estrogen')) {
    return 'Hormonal';
  }
  if (param.includes('vitamin') || param.includes('iron') || param.includes('b12')) {
    return 'Nutritional';
  }
  if (param.includes('crp') || param.includes('esr') || param.includes('wbc')) {
    return 'Inflammatory';
  }
  
  return 'General';
}

// Detect document type from content
function detectDocumentType(text) {
  const content = text.toLowerCase();
  
  if (content.includes('dexa') || content.includes('bone density')) {
    return 'DEXA Scan';
  }
  if (content.includes('hormone') || content.includes('testosterone') || content.includes('estrogen')) {
    return 'Hormone Panel';
  }
  if (content.includes('comprehensive') || content.includes('basic metabolic')) {
    return 'Comprehensive Lab Panel';
  }
  if (content.includes('lipid') || content.includes('cholesterol')) {
    return 'Lipid Panel';
  }
  if (content.includes('thyroid') || content.includes('tsh')) {
    return 'Thyroid Function Test';
  }
  
  return 'Lab Results';
}

// Extract test date from document text
function extractTestDate(text) {
  const datePatterns = [
    /(?:date|collected|drawn|test)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
    /(?:date|collected|drawn|test)[:\s]*(\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2})/gi,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g
  ];
  
  for (const pattern of datePatterns) {
    const match = pattern.exec(text);
    if (match) {
      try {
        const date = new Date(match[1]);
        if (date instanceof Date && !isNaN(date)) {
          return date.toISOString().split('T')[0];
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return new Date().toISOString().split('T')[0];
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
