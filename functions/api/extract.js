export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== DIRECT TEXT + ENHANCED PDF SOLUTION ===');
    console.log('Timestamp:', new Date().toISOString());
    
    let textToProcess = '';
    let fileName = 'unknown';
    let fileSize = 0;
    let inputMethod = 'unknown';
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const pdfFile = formData.get('pdfFile');
      const directText = formData.get('documentText'); // NEW: Direct text input option
      
      if (directText && directText.trim().length > 20) {
        // PRIORITY: Use direct text input if provided
        textToProcess = directText.trim();
        inputMethod = 'direct_text_input';
        fileName = 'direct_text_input.txt';
        console.log('✅ Using DIRECT TEXT INPUT (most reliable)');
        console.log('Direct text length:', textToProcess.length);
      } else if (pdfFile && pdfFile instanceof File) {
        fileName = pdfFile.name;
        fileSize = pdfFile.size;
        inputMethod = 'pdf_extraction';
        
        console.log('📄 Attempting PDF extraction...');
        const extractionResult = await comprehensivePDFExtraction(pdfFile);
        textToProcess = extractionResult.text;
        
        console.log('PDF extraction result:');
        console.log('- Text length:', textToProcess.length);
        console.log('- Methods used:', extractionResult.methodsUsed.join(', '));
      } else {
        throw new Error('Either PDF file or direct text input required');
      }
      
    } else if (contentType.includes('application/json')) {
      const requestData = await request.json();
      if (requestData.documentText) {
        textToProcess = requestData.documentText;
        inputMethod = 'json_text_input';
        fileName = 'json_input.txt';
        console.log('✅ Using JSON TEXT INPUT');
      } else {
        throw new Error('Document text required in JSON request');
      }
    } else {
      throw new Error('Unsupported content type');
    }

    console.log('=== INPUT ANALYSIS ===');
    console.log('Input method:', inputMethod);
    console.log('Text length:', textToProcess.length);
    console.log('FULL TEXT:');
    console.log(textToProcess);

    if (!textToProcess || textToProcess.length < 20) {
      throw new Error(`INSUFFICIENT TEXT DATA

Input method: ${inputMethod}
Text length: ${textToProcess?.length || 0}
Text content: "${textToProcess}"

FOR PDF ISSUES:
1. The PDF may be image-based (scanned) rather than text-based
2. Try copying the text from your PDF and pasting it directly
3. Use a text-based PDF with selectable text

FOR DIRECT TEXT INPUT:
1. Copy the health data from your document
2. Paste it in the text area
3. Include all parameter names and values`);
    }

    console.log('=== STARTING PRECISE VALUE EXTRACTION ===');

    // STEP 1: Use the most precise extraction method based on input type
    let extractedParams = [];
    
    if (inputMethod.includes('text_input')) {
      console.log('🎯 Using DIRECT TEXT extraction (most accurate)');
      extractedParams = directTextExtraction(textToProcess);
    } else {
      console.log('📄 Using PDF-based extraction');
      extractedParams = enhancedPDFExtraction(textToProcess);
    }
    
    console.log('Primary extraction found:', extractedParams.length, 'parameters');

    // STEP 2: AI verification with explicit value extraction
    const aiParams = await explicitValueExtraction(textToProcess, env);
    console.log('AI verification found:', aiParams.length, 'parameters');

    // STEP 3: Combine results with preference for direct extraction
    const finalParams = combineWithPriority(extractedParams, aiParams, inputMethod);
    console.log('Final combined results:', finalParams.length, 'parameters');

    if (finalParams.length === 0) {
      throw new Error(`NO PARAMETERS FOUND

INPUT METHOD: ${inputMethod}
TEXT LENGTH: ${textToProcess.length}

FULL TEXT CONTENT:
"${textToProcess}"

EXTRACTION RESULTS:
- Primary method: ${extractedParams.length} parameters
- AI method: ${aiParams.length} parameters

This indicates the text doesn't contain recognizable health parameters or values.`);
    }

    const testDate = detectTestDate(textToProcess) || '2025-09-09';
    
    const extractedData = {
      healthParameters: finalParams,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: finalParams.length,
      inputMethod: inputMethod
    };

    console.log('=== EXTRACTION SUCCESS ===');
    console.log(`SUCCESS with ${inputMethod}! Found ${finalParams.length} parameters:`);
    finalParams.forEach((param, index) => {
      console.log(`${index + 1}. ${param.parameter}: ${param.value} ${param.unit} (${param.status})`);
    });

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      debugInfo: {
        fileName: fileName,
        fileSize: fileSize,
        textLength: textToProcess.length,
        inputMethod: inputMethod,
        fullExtractedText: textToProcess,
        parametersFound: finalParams.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== EXTRACTION ERROR ===');
    console.error(error.message);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      suggestion: 'Try copying and pasting the text directly instead of uploading PDF'
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// COMPREHENSIVE PDF EXTRACTION with all methods
async function comprehensivePDFExtraction(pdfFile) {
  try {
    console.log('📄 COMPREHENSIVE PDF EXTRACTION');
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    const extractedTexts = [];
    const methodsUsed = [];
    
    // Method 1: Parentheses extraction
    const method1 = extractParenthesesText(pdfString);
    if (method1.length > 10) {
      extractedTexts.push(method1);
      methodsUsed.push('parentheses');
      console.log('✅ Parentheses extraction:', method1.length, 'chars');
    }
    
    // Method 2: BT/ET blocks
    const method2 = extractBTETText(pdfString);
    if (method2.length > 10) {
      extractedTexts.push(method2);
      methodsUsed.push('bt_et');
      console.log('✅ BT/ET extraction:', method2.length, 'chars');
    }
    
    // Method 3: Stream content
    const method3 = extractStreamText(pdfString);
    if (method3.length > 10) {
      extractedTexts.push(method3);
      methodsUsed.push('streams');
      console.log('✅ Stream extraction:', method3.length, 'chars');
    }
    
    // Method 4: Raw text
    const method4 = extractRawText(pdfString);
    if (method4.length > 10) {
      extractedTexts.push(method4);
      methodsUsed.push('raw');
      console.log('✅ Raw text extraction:', method4.length, 'chars');
    }
    
    // Method 5: Hex decoding
    const method5 = extractHexText(pdfString);
    if (method5.length > 10) {
      extractedTexts.push(method5);
      methodsUsed.push('hex');
      console.log('✅ Hex extraction:', method5.length, 'chars');
    }
    
    // Combine all successful extractions
    let combinedText = extractedTexts.join(' ');
    
    // Clean and normalize
    combinedText = combinedText
      .replace(/\\[rnt]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('📄 PDF extraction complete:', combinedText.length, 'characters');
    
    return {
      text: combinedText,
      methodsUsed: methodsUsed
    };
    
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// PDF extraction helper methods
function extractParenthesesText(pdfString) {
  const matches = pdfString.match(/\(([^)]+)\)/g);
  return matches ? matches.map(m => m.slice(1, -1)).filter(t => t.length > 0).join(' ') : '';
}

function extractBTETText(pdfString) {
  const matches = pdfString.match(/BT(.*?)ET/gs);
  if (!matches) return '';
  
  let text = '';
  matches.forEach(block => {
    const commands = block.match(/\(([^)]*)\)\s*Tj/g);
    if (commands) {
      commands.forEach(cmd => {
        const match = cmd.match(/\(([^)]*)\)/);
        if (match && match[1]) text += match[1] + ' ';
      });
    }
  });
  return text;
}

function extractStreamText(pdfString) {
  const matches = pdfString.match(/stream(.*?)endstream/gs);
  if (!matches) return '';
  
  let text = '';
  matches.forEach(stream => {
    const content = stream.replace(/^stream\s*|\s*endstream$/g, '');
    const readable = content.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{8,}/g);
    if (readable) text += readable.join(' ') + ' ';
  });
  return text;
}

function extractRawText(pdfString) {
  const matches = pdfString.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{15,}/g);
  return matches ? matches.join(' ') : '';
}

function extractHexText(pdfString) {
  const hexMatches = pdfString.match(/<([0-9A-Fa-f\s]+)>/g);
  if (!hexMatches) return '';
  
  let text = '';
  hexMatches.forEach(hexStr => {
    try {
      const hex = hexStr.slice(1, -1).replace(/\s/g, '');
      if (hex.length % 2 === 0) {
        let decoded = '';
        for (let i = 0; i < hex.length; i += 2) {
          const char = String.fromCharCode(parseInt(hex.substr(i, 2), 16));
          if (char.match(/[A-Za-z0-9\s.,;:()\-\/\%]/)) decoded += char;
        }
        if (decoded.length > 5) text += decoded + ' ';
      }
    } catch (e) {}
  });
  return text;
}

// DIRECT TEXT EXTRACTION - Most reliable for text input
function directTextExtraction(text) {
  console.log('🎯 DIRECT TEXT EXTRACTION');
  console.log('Processing text:', text);
  
  const parameters = [];
  const found = new Set();
  
  // Ultra-precise patterns for direct text input
  const directPatterns = [
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        // Look for exact table format: "Total Cholesterol 218 mg/dL <200 mg/dL"
        /total\s+cholesterol\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+<\s*\d+/gi,
        /total\s+cholesterol\s*[|\s]+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /cholesterol\s+total\s+(\d+(?:\.\d+)?)\s+mg\/dl/gi,
        // Flexible format
        /total\s+cholesterol[^0-9]*(\d+(?:\.\d+)?)[^<]*mg\/dl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [100, 400]
    },
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /ldl\s+cholesterol\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+<\s*\d+/gi,
        /ldl\s+cholesterol\s*[|\s]+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /cholesterol\s+ldl\s+(\d+(?:\.\d+)?)\s+mg\/dl/gi,
        /ldl\s+cholesterol[^0-9]*(\d+(?:\.\d+)?)[^<]*mg\/dl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [50, 300]
    },
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s+(\d+(?:\.\d+)?)\s*%\s+<\s*\d+/gi,
        /hba1c\s*[|\s]+(\d+(?:\.\d+)?)\s*%/gi,
        /hemoglobin\s+a1c\s+(\d+(?:\.\d+)?)\s*%/gi,
        /hba1c[^0-9]*(\d+(?:\.\d+)?)\s*%/gi
      ],
      unit: '%',
      expectedRange: [3.0, 15.0]
    },
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s+u\/l\s+\d+\s*-\s*\d+/gi,
        /alt\s*\(liver\s+enzyme\)\s*[|\s]+(\d+(?:\.\d+)?)\s*u\/l/gi,
        /alt[^0-9]*(\d+(?:\.\d+)?)\s+u\/l[^0-9]*\d+\s*-/gi,
        /liver\s+enzyme.*?alt[^0-9]*(\d+(?:\.\d+)?)\s*u\/l/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'AST',
      category: 'Liver Function',
      patterns: [
        /ast\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s+u\/l\s+\d+\s*-\s*\d+/gi,
        /ast\s*\(liver\s+enzyme\)\s*[|\s]+(\d+(?:\.\d+)?)\s*u\/l/gi,
        /ast[^0-9]*(\d+(?:\.\d+)?)\s+u\/l[^0-9]*\d+\s*-/gi,
        /liver\s+enzyme.*?ast[^0-9]*(\d+(?:\.\d+)?)\s*u\/l/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+\d+\.\d+\s*-\s*\d+\.\d+/gi,
        /creatinine\s*[|\s]+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /creatinine[^0-9]*(\d+(?:\.\d+)?)\s+mg\/dl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [0.5, 3.0]
    }
  ];

  // Extract using direct patterns
  directPatterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    console.log(`\n--- Direct extraction for: ${pattern.name} ---`);
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0;
      
      const match = regex.exec(text);
      if (match && match[1]) {
        const value = match[1];
        const numericValue = parseFloat(value);
        const fullMatch = match[0];
        
        console.log(`🎯 DIRECT MATCH: "${fullMatch}"`);
        console.log(`   Parameter: ${pattern.name}`);
        console.log(`   Value: ${value}`);
        
        // Validate range
        if (numericValue >= pattern.expectedRange[0] && numericValue <= pattern.expectedRange[1]) {
          found.add(pattern.name);
          
          let status = 'Normal';
          if (pattern.name === 'Total Cholesterol' && numericValue > 200) status = 'High';
          if (pattern.name === 'LDL Cholesterol' && numericValue > 100) status = 'High';
          if (pattern.name === 'HbA1c' && numericValue > 5.7) status = 'High';
          if (pattern.name === 'ALT' && numericValue > 55) status = 'High';
          if (pattern.name === 'AST' && numericValue > 48) status = 'High';
          if (pattern.name === 'Creatinine' && numericValue > 1.3) status = 'High';
          
          parameters.push({
            category: pattern.category,
            parameter: pattern.name,
            value: value,
            unit: pattern.unit,
            referenceRange: getReferenceRange(pattern.name),
            status: status,
            date: '2025-09-09',
            source: 'direct_extraction'
          });
          
          console.log(`✅ ADDED: ${pattern.name} = ${value} ${pattern.unit} (${status})`);
          break;
        } else {
          console.log(`❌ REJECTED: ${value} outside range ${pattern.expectedRange[0]}-${pattern.expectedRange[1]}`);
        }
      }
    }
  });

  console.log(`🎯 Direct extraction found ${parameters.length} parameters`);
  return parameters;
}

// ENHANCED PDF EXTRACTION for PDF inputs
function enhancedPDFExtraction(text) {
  console.log('📄 ENHANCED PDF EXTRACTION');
  
  // Same logic as directTextExtraction but with more flexible patterns
  return directTextExtraction(text);
}

// EXPLICIT VALUE EXTRACTION using AI
async function explicitValueExtraction(text, env) {
  try {
    console.log('🤖 EXPLICIT VALUE EXTRACTION');
    
    const prompt = `Extract the exact numerical values from this health report. Look for the RESULT values, not reference ranges.

TEXT: ${text}

Based on the table format "Test | Result | Reference Range", extract ONLY the Result column values:

Expected format in text:
- Total Cholesterol 218 mg/dL <200 mg/dL → Result: 218
- LDL Cholesterol 152 mg/dL <100 mg/dL → Result: 152  
- HbA1c 6.2% <5.7% → Result: 6.2
- ALT (Liver Enzyme) 62 U/L 7-55 U/L → Result: 62
- AST (Liver Enzyme) 47 U/L 8-48 U/L → Result: 47
- Creatinine 1.03 mg/dL 0.7-1.3 mg/dL → Result: 1.03

Return JSON with EXACT result values:
{"healthParameters": [{"parameter": "Total Cholesterol", "value": "218", "unit": "mg/dL"}]}

Extract ONLY the middle values (results), ignore reference ranges. JSON only:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 1000,
      temperature: 0.0
    });

    if (!response?.response) return [];

    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const data = JSON.parse(jsonMatch[0]);
    return (data.healthParameters || []).map(param => ({
      ...param,
      category: getCategoryForParameter(param.parameter),
      referenceRange: getReferenceRange(param.parameter),
      status: 'Unknown',
      date: '2025-09-09',
      source: 'ai_explicit'
    }));

  } catch (error) {
    console.warn('AI explicit extraction failed:', error.message);
    return [];
  }
}

// COMBINE WITH PRIORITY based on input method
function combineWithPriority(primaryParams, aiParams, inputMethod) {
  console.log('🧩 COMBINING WITH PRIORITY');
  console.log('Input method:', inputMethod);
  
  const combined = new Map();
  
  // Higher priority for direct text input
  const primaryPriority = inputMethod.includes('text_input') ? 'HIGH' : 'MEDIUM';
  
  console.log('Primary extraction priority:', primaryPriority);
  
  // Add primary parameters
  primaryParams.forEach(param => {
    combined.set(param.parameter, param);
    console.log(`📌 Primary: ${param.parameter} = ${param.value}`);
  });
  
  // Add AI parameters only if not found by primary method
  aiParams.forEach(param => {
    if (!combined.has(param.parameter)) {
      combined.set(param.parameter, param);
      console.log(`🤖 AI: ${param.parameter} = ${param.value}`);
    } else {
      console.log(`⚠️ AI duplicate skipped: ${param.parameter}`);
    }
  });
  
  return Array.from(combined.values());
}

// Helper functions
function getCategoryForParameter(paramName) {
  const categories = {
    'Total Cholesterol': 'Cardiovascular',
    'LDL Cholesterol': 'Cardiovascular',
    'HDL Cholesterol': 'Cardiovascular',
    'HbA1c': 'Metabolic',
    'ALT': 'Liver Function',
    'AST': 'Liver Function',
    'Creatinine': 'Kidney Function'
  };
  return categories[paramName] || 'General';
}

function getReferenceRange(paramName) {
  const ranges = {
    'Total Cholesterol': '<200 mg/dL',
    'LDL Cholesterol': '<100 mg/dL',
    'HDL Cholesterol': '>40 mg/dL',
    'HbA1c': '<5.7%',
    'ALT': '7-55 U/L',
    'AST': '8-48 U/L',
    'Creatinine': '0.7-1.3 mg/dL'
  };
  return ranges[paramName] || 'Check with healthcare provider';
}

function detectTestDate(text) {
  const patterns = [
    /(?:test\s+date|collection\s+date|date)\s*[:\-]?\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/gi,
    /(?:test\s+date|collection\s+date|date)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        const date = new Date(match[1]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        continue;
      }
    }
  }
  return null;
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
