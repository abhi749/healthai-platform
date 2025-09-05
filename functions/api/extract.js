export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== EXTRACT API CALLED ===');
    console.log('Content-Type:', request.headers.get('content-type'));
    
    let textToProcess = '';
    let processingMethod = 'unknown';
    let fileName = 'unknown';
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      console.log('Processing FormData request');
      
      const formData = await request.formData();
      const pdfFile = formData.get('pdfFile');
      const documentText = formData.get('documentText');
      
      if (pdfFile && pdfFile instanceof File) {
        fileName = pdfFile.name;
        console.log('Processing PDF file:', fileName, 'Size:', pdfFile.size, 'Type:', pdfFile.type);
        
        // Extract text from PDF - throw error if it fails
        textToProcess = await extractTextFromPDF(pdfFile);
        processingMethod = 'PDF text extraction';
        
        console.log('PDF extraction successful, length:', textToProcess.length);
        
      } else if (documentText) {
        textToProcess = documentText;
        processingMethod = 'Direct text input';
      } else {
        throw new Error('Either PDF file or document text must be provided');
      }
      
    } else if (contentType.includes('application/json')) {
      console.log('Processing JSON request');
      
      const requestData = await request.json();
      const { documentText } = requestData;
      
      if (documentText) {
        textToProcess = documentText;
        processingMethod = 'JSON text input';
      } else {
        throw new Error('Document text must be provided in JSON request');
      }
    } else {
      throw new Error('Unsupported content type. Use multipart/form-data for file uploads or application/json for text.');
    }

    // Validate we have sufficient text
    if (!textToProcess || textToProcess.length < 20) {
      throw new Error(`Insufficient text content extracted (${textToProcess?.length || 0} characters). Document may be image-based, corrupted, or empty.`);
    }

    console.log('Text extracted successfully, starting parameter extraction...');
    console.log('Text preview:', textToProcess.substring(0, 300));

    // Extract parameters using AI with enhanced date detection
    const extractedData = await extractParametersWithAI(textToProcess, env);
    
    // Validate we found parameters
    if (!extractedData.healthParameters || extractedData.healthParameters.length === 0) {
      throw new Error('No health parameters found in document. Please ensure the document contains medical lab values, measurements, or health data with numerical values.');
    }

    console.log('Parameter extraction successful:', extractedData.healthParameters.length, 'parameters found');

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      processingInfo: {
        model: 'llama-3.1-8b-instruct',
        extractionMethod: processingMethod,
        textLength: textToProcess.length,
        timestamp: new Date().toISOString(),
        parametersFound: extractedData.healthParameters.length,
        originalFileName: fileName
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Extract API error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Document extraction failed',
      timestamp: new Date().toISOString(),
      troubleshooting: {
        pdfRequirements: 'PDF must contain readable text (not scanned images)',
        dataRequirements: 'Document must contain numerical health values (lab results, measurements, etc.)',
        supportedFormats: 'Text-based PDFs with medical data',
        commonIssues: [
          'Scanned/image-based PDFs cannot be processed',
          'Documents without numerical health values',
          'Corrupted or password-protected files',
          'Non-medical documents'
        ]
      }
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// PDF text extraction - throws errors on failure
async function extractTextFromPDF(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log('PDF size:', uint8Array.length, 'bytes');
    
    if (uint8Array.length === 0) {
      throw new Error('PDF file is empty or corrupted');
    }
    
    // Convert to string for text extraction
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    let extractedText = '';
    
    // Method 1: Extract text in parentheses (common PDF text encoding)
    const parenthesesMatches = pdfString.match(/\(([^)]{2,})\)/g);
    if (parenthesesMatches) {
      console.log('Found', parenthesesMatches.length, 'parentheses text blocks');
      
      const cleanText = parenthesesMatches
        .map(match => match.slice(1, -1)) // Remove parentheses
        .filter(text => text.length > 1 && /[A-Za-z0-9]/.test(text)) // Filter readable text
        .join(' ');
      
      extractedText += cleanText + ' ';
    }
    
    // Method 2: Extract text between BT and ET markers
    const btMatches = pdfString.match(/BT\s+(.*?)\s+ET/gs);
    if (btMatches) {
      console.log('Found', btMatches.length, 'BT/ET text blocks');
      
      btMatches.forEach(match => {
        const content = match.replace(/BT\s*|\s*ET/g, '');
        // Look for text show commands
        const textCommands = content.match(/\((.*?)\)\s*Tj/g);
        if (textCommands) {
          textCommands.forEach(cmd => {
            const text = cmd.match(/\((.*?)\)/);
            if (text && text[1] && text[1].length > 1) {
              extractedText += text[1] + ' ';
            }
          });
        }
      });
    }
    
    // Method 3: Look for stream content with readable text
    const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs);
    if (streamMatches) {
      console.log('Found', streamMatches.length, 'PDF streams');
      
      streamMatches.forEach(stream => {
        const streamContent = stream.replace(/^stream\s*|\s*endstream$/g, '');
        
        // Extract readable text patterns from stream
        const readableText = streamContent.match(/[A-Za-z][A-Za-z\s\d.,:-]{5,}/g);
        if (readableText) {
          extractedText += readableText.join(' ') + ' ';
        }
      });
    }
    
    // Clean up extracted text
    extractedText = extractedText
      .replace(/\\[rnt]/g, ' ')  // Remove escape sequences
      .replace(/\s+/g, ' ')      // Multiple spaces to single
      .replace(/[^\w\s\d.,;:()\-\/\%]/g, ' ')  // Remove special characters but keep medical symbols
      .trim();
    
    console.log('Final extracted text length:', extractedText.length);
    console.log('Text preview:', extractedText.substring(0, 500));
    
    if (extractedText.length < 20) {
      throw new Error(`PDF text extraction failed - only ${extractedText.length} characters extracted. This PDF appears to be image-based or does not contain readable text. Please use a text-based PDF with selectable text.`);
    }
    
    // Check if text contains any potential health-related content
    const healthIndicators = ['cholesterol', 'glucose', 'hemoglobin', 'blood', 'test', 'result', 'lab', 'mg/dl', 'mmol', 'normal', 'high', 'low', 'reference'];
    const hasHealthContent = healthIndicators.some(indicator => 
      extractedText.toLowerCase().includes(indicator)
    );
    
    if (!hasHealthContent) {
      throw new Error('Extracted text does not appear to contain health/medical data. Please upload a medical document with lab results, health measurements, or clinical data.');
    }
    
    return extractedText;
    
  } catch (error) {
    if (error.message.includes('PDF text extraction failed') || error.message.includes('does not appear to contain health')) {
      throw error; // Re-throw our custom errors
    }
    throw new Error(`PDF processing failed: ${error.message}. Please ensure the file is a valid, text-based PDF document.`);
  }
}

// ENHANCED AI-based parameter extraction with SMART DATE HANDLING
async function extractParametersWithAI(textToProcess, env) {
  const prompt = `Extract health parameters from this medical document text. Look for numerical values with units for medical tests, measurements, and lab results.

IMPORTANT: Look carefully for dates in the document and extract the actual test/collection date.

TEXT:
${textToProcess}

Find all health measurements including:
- Lab values (cholesterol, glucose, hemoglobin, etc.)  
- Vital signs (blood pressure, heart rate, temperature)
- Body measurements (weight, height, BMI)
- Medical test results with numerical values
- DATES: Look for test dates, collection dates, report dates in various formats

Respond with ONLY a JSON object in this exact format:
{
  "healthParameters": [
    {
      "category": "Cardiovascular",
      "parameter": "Total Cholesterol",
      "value": "185",
      "unit": "mg/dL",
      "referenceRange": "<200",
      "date": "2025-09-15",
      "status": "Normal"
    }
  ],
  "documentType": "Lab Results",
  "testDate": "2025-09-15",
  "totalParametersFound": 1,
  "personalDataFound": []
}

CRITICAL DATE HANDLING RULES:
- Look for dates in formats like: "2025-09-15", "09/15/2025", "September 15, 2025", "15-Sep-2025"
- Use the ACTUAL test/collection date from the document if found
- If only month/year found (like "Sep 2025"), use the 15th of that month: "2025-09-15"
- If no specific date found, use current date: "2025-09-05"
- Always ensure date is in YYYY-MM-DD format
- For partial dates, assume the middle of the time period (15th for month)

JSON only, no other text:`;

  try {
    console.log('Sending text to AI for parameter extraction with smart date detection...');
    
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 2500,
      temperature: 0.1
    });

    if (!aiResponse || !aiResponse.response) {
      throw new Error('AI model returned empty response');
    }

    console.log('AI response received, length:', aiResponse.response.length);
    console.log('AI response preview:', aiResponse.response.substring(0, 300));

    // Try to parse JSON from AI response
    let jsonString = aiResponse.response.trim();
    
    // Extract JSON from response (remove any extra text)
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    } else {
      throw new Error('AI response does not contain valid JSON structure');
    }
    
    // Remove any markdown formatting
    jsonString = jsonString
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    
    let extractedData;
    try {
      extractedData = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
    }
    
    // Validate required fields
    if (!extractedData.healthParameters) {
      throw new Error('AI response missing healthParameters field');
    }
    
    if (!Array.isArray(extractedData.healthParameters)) {
      throw new Error('healthParameters must be an array');
    }
    
    if (extractedData.healthParameters.length === 0) {
      throw new Error('No health parameters found by AI analysis. Document may not contain recognizable medical data with numerical values.');
    }
    
    // Validate each parameter has required fields
    extractedData.healthParameters.forEach((param, index) => {
      if (!param.parameter || !param.value) {
        throw new Error(`Health parameter ${index + 1} missing required fields (parameter name or value)`);
      }
    });
    
    // ENHANCED: Process and validate dates with smart month handling
    console.log('Processing and validating dates with smart month handling...');
    
    // Try to extract a more accurate test date from the text using enhanced date detection
    const detectedTestDate = detectDateFromTextSmart(textToProcess);
    if (detectedTestDate) {
      console.log('Detected test date from smart text analysis:', detectedTestDate);
      extractedData.testDate = detectedTestDate;
    }
    
    // Set defaults for missing fields
    if (!extractedData.documentType) {
      extractedData.documentType = 'Health Report';
    }
    
    if (!extractedData.testDate) {
      extractedData.testDate = new Date().toISOString().split('T')[0];
    }
    
    // Validate and normalize test date with smart month handling
    extractedData.testDate = validateAndNormalizeDateSmart(extractedData.testDate);
    
    // Update all parameters with the correct test date if they don't have individual dates
    extractedData.healthParameters = extractedData.healthParameters.map(param => {
      if (!param.date || param.date === 'null' || param.date === '') {
        param.date = extractedData.testDate;
      } else {
        param.date = validateAndNormalizeDateSmart(param.date);
      }
      return param;
    });
    
    if (!extractedData.personalDataFound) {
      extractedData.personalDataFound = [];
    }
    
    extractedData.totalParametersFound = extractedData.healthParameters.length;
    
    console.log('AI extraction successful:', extractedData.totalParametersFound, 'parameters found');
    console.log('Final test date used:', extractedData.testDate);
    console.log('Parameter dates:', extractedData.healthParameters.map(p => `${p.parameter}: ${p.date}`));
    
    return extractedData;
    
  } catch (error) {
    if (error.message.includes('No health parameters found') || 
        error.message.includes('missing required fields') ||
        error.message.includes('AI response')) {
      throw error; // Re-throw our custom errors
    }
    throw new Error(`AI parameter extraction failed: ${error.message}`);
  }
}

// ENHANCED: Smart date detection with month-middle assumption
function detectDateFromTextSmart(text) {
  console.log('Smart date detection from text...');
  
  // Common date patterns in medical documents
  const datePatterns = [
    // ISO format: 2025-09-15, 2025/09/15
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,
    // US format: 09/15/2025, 09-15-2025
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
    // European format: 15/09/2025, 15-09-2025
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g,
    // Month name formats: September 15, 2025 or 15 September 2025
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    // Short month formats: Sep 15, 2025 or 15-Sep-2025
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{1,2}),?\s*(\d{4})\b/gi,
    /\b(\d{1,2})[\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-](\d{4})\b/gi,
    // NEW: Month-Year only patterns (Sep 2025, September 2025)
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\b/gi,
    // NEW: Numeric month-year (09/2025, 09-2025)
    /\b(\d{1,2})[\/\-](\d{4})\b/g
  ];
  
  const foundDates = [];
  
  // Look for dates near keywords indicating test/collection dates
  const testKeywords = [
    'test date', 'collection date', 'sample date', 'drawn on', 'collected on',
    'report date', 'lab date', 'specimen date', 'date collected',
    'date:', 'tested:', 'collected:', 'drawn:', 'specimen:'
  ];
  
  // Search around test keywords for dates
  testKeywords.forEach(keyword => {
    const keywordIndex = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (keywordIndex !== -1) {
      // Look for dates within 50 characters after the keyword
      const searchText = text.substring(keywordIndex, keywordIndex + 100);
      datePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(searchText)) !== null) {
          const dateStr = match[0];
          console.log(`Found date "${dateStr}" near keyword "${keyword}"`);
          foundDates.push({ date: dateStr, context: keyword, priority: 10 });
        }
      });
    }
  });
  
  // If no dates found near keywords, search the entire text
  if (foundDates.length === 0) {
    datePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[0];
        console.log(`Found general date: "${dateStr}"`);
        foundDates.push({ date: dateStr, context: 'general', priority: 1 });
      }
    });
  }
  
  if (foundDates.length === 0) {
    console.log('No dates detected in text');
    return null;
  }
  
  // Sort by priority and return the most likely test date
  foundDates.sort((a, b) => b.priority - a.priority);
  const bestDate = foundDates[0].date;
  
  console.log('Best date found:', bestDate);
  return validateAndNormalizeDateSmart(bestDate);
}

// SMART date validation with month-middle assumption
function validateAndNormalizeDateSmart(dateStr) {
  if (!dateStr || dateStr === 'null' || dateStr === '') {
    return new Date().toISOString().split('T')[0];
  }
  
  try {
    // Handle various date formats with smart month handling
    let normalizedDate;
    
    console.log(`Smart date processing: "${dateStr}"`);
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      normalizedDate = new Date(dateStr);
    }
    // Month-Year only patterns (need smart handling)
    else if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i.test(dateStr)) {
      const [, monthName, year] = dateStr.match(/^(\w+)\s+(\d{4})$/i);
      const monthNum = getMonthNumber(monthName);
      normalizedDate = new Date(parseInt(year), monthNum - 1, 15); // 15th of the month
      console.log(`Month-year format detected: ${monthName} ${year} -> 15th of month`);
    }
    else if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})$/i.test(dateStr)) {
      const [, monthAbbr, year] = dateStr.match(/^(\w+)\.?\s+(\d{4})$/i);
      const monthNum = getMonthNumber(monthAbbr);
      normalizedDate = new Date(parseInt(year), monthNum - 1, 15); // 15th of the month
      console.log(`Month abbreviation-year format: ${monthAbbr} ${year} -> 15th of month`);
    }
    // Numeric month-year only (MM/YYYY or MM-YYYY)
    else if (/^\d{1,2}[\/\-]\d{4}$/.test(dateStr)) {
      const parts = dateStr.split(/[\/\-]/);
      normalizedDate = new Date(parseInt(parts[1]), parseInt(parts[0]) - 1, 15); // 15th of the month
      console.log(`Numeric month-year format: ${dateStr} -> 15th of month`);
    }
    // MM/DD/YYYY or MM-DD-YYYY format
    else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateStr)) {
      normalizedDate = new Date(dateStr);
    }
    // DD/MM/YYYY format (European) - be careful here
    else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateStr)) {
      const parts = dateStr.split(/[\/\-]/);
      // Assume MM/DD/YYYY for US format first, then try DD/MM/YYYY
      normalizedDate = new Date(parts[2], parts[0] - 1, parts[1]);
      if (isNaN(normalizedDate.getTime())) {
        normalizedDate = new Date(parts[2], parts[1] - 1, parts[0]);
      }
    }
    // YYYY/MM/DD format
    else if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(dateStr)) {
      normalizedDate = new Date(dateStr.replace(/\//g, '-'));
    }
    // Month name formats with day
    else {
      normalizedDate = new Date(dateStr);
    }
    
    // Validate the date is reasonable (not in future, not too old)
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    
    if (isNaN(normalizedDate.getTime())) {
      console.warn(`Invalid date format: ${dateStr}, using current date`);
      return new Date().toISOString().split('T')[0];
    }
    
    if (normalizedDate > now) {
      console.warn(`Date in future: ${dateStr}, using current date`);
      return new Date().toISOString().split('T')[0];
    }
    
    if (normalizedDate < fiveYearsAgo) {
      console.warn(`Date too old: ${dateStr}, using current date`);
      return new Date().toISOString().split('T')[0];
    }
    
    const result = normalizedDate.toISOString().split('T')[0];
    console.log(`Smart normalized date: ${dateStr} → ${result}`);
    return result;
    
  } catch (error) {
    console.warn(`Error parsing date "${dateStr}":`, error);
    return new Date().toISOString().split('T')[0];
  }
}

// Helper function to convert month name to number
function getMonthNumber(monthName) {
  const months = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12
  };
  
  return months[monthName.toLowerCase()] || 1;
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
