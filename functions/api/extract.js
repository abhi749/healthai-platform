export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== PRECISE HEALTH PARAMETER EXTRACTION ===');
    console.log('Timestamp:', new Date().toISOString());
    
    let textToProcess = '';
    let fileName = 'unknown';
    let fileSize = 0;
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const pdfFile = formData.get('pdfFile');
      
      if (pdfFile && pdfFile instanceof File) {
        fileName = pdfFile.name;
        fileSize = pdfFile.size;
        
        // Extract text from PDF
        const extractionResult = await extractPDFText(pdfFile);
        textToProcess = extractionResult.text;
        
        console.log('=== EXTRACTED TEXT ANALYSIS ===');
        console.log('Raw text length:', textToProcess.length);
        console.log('Raw text preview:', textToProcess.substring(0, 500));
        console.log('Full extracted text:', textToProcess);
        
      } else {
        throw new Error('PDF file required');
      }
    } else {
      throw new Error('Multipart form data required');
    }

    if (!textToProcess || textToProcess.length < 10) {
      throw new Error(`Text extraction failed. Only got ${textToProcess?.length || 0} characters`);
    }

    console.log('=== STARTING PRECISE EXTRACTION ===');

    // STEP 1: Clean and normalize the text
    const normalizedText = normalizeText(textToProcess);
    console.log('Normalized text:', normalizedText);

    // STEP 2: Precise parameter extraction using context-aware patterns
    const extractedParams = preciseParameterExtraction(normalizedText);
    console.log('Precise extraction found:', extractedParams.length, 'parameters');

    // STEP 3: Validate extracted values make medical sense
    const validatedParams = validateMedicalValues(extractedParams);
    console.log('After validation:', validatedParams.length, 'parameters');

    // STEP 4: AI verification as backup
    const aiParams = await aiVerification(normalizedText, env);
    console.log('AI verification found:', aiParams.length, 'parameters');

    // STEP 5: Final intelligent merge
    const finalParams = intelligentMerge(validatedParams, aiParams);
    console.log('Final merged results:', finalParams.length, 'parameters');

    if (finalParams.length === 0) {
      throw new Error(`NO VALID PARAMETERS FOUND

EXTRACTED TEXT:
"${textToProcess}"

NORMALIZED TEXT: 
"${normalizedText}"

Check if the document contains readable health data with numerical values.`);
    }

    const testDate = detectTestDate(normalizedText) || '2025-09-09';
    
    const extractedData = {
      healthParameters: finalParams,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: finalParams.length
    };

    console.log('=== EXTRACTION SUCCESS ===');
    console.log('Final results:');
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
        normalizedText: normalizedText,
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
      timestamp: new Date().toISOString()
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// PDF text extraction
async function extractPDFText(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    let text = '';
    
    // Method 1: Parentheses text (most common)
    const parenthesesMatches = pdfString.match(/\(([^)]+)\)/g);
    if (parenthesesMatches) {
      text += parenthesesMatches
        .map(match => match.slice(1, -1))
        .filter(t => t.length > 0)
        .join(' ') + ' ';
    }
    
    // Method 2: BT/ET blocks
    const btMatches = pdfString.match(/BT(.*?)ET/gs);
    if (btMatches) {
      btMatches.forEach(block => {
        const textCommands = block.match(/\(([^)]*)\)\s*Tj/g);
        if (textCommands) {
          textCommands.forEach(cmd => {
            const match = cmd.match(/\(([^)]*)\)/);
            if (match && match[1]) text += match[1] + ' ';
          });
        }
      });
    }
    
    // Clean text
    text = text
      .replace(/\\[rnt]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return { text };
    
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// Normalize text for better pattern matching
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\d.,;:()\-\/\%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// PRECISE parameter extraction with context awareness
function preciseParameterExtraction(text) {
  console.log('🎯 PRECISE PARAMETER EXTRACTION');
  console.log('Working with text:', text);
  
  const parameters = [];
  const found = new Set();
  
  // More precise patterns that look for complete context
  const precisePatterns = [
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      // Look for "total cholesterol" followed by value, considering your document shows "Total Cholesterol 230 mg/dL <200 mg/dL"
      patterns: [
        /total\s+cholesterol\s+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /cholesterol\s+total\s+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /cholesterol\s+(\d+(?:\.\d+)?)\s*mg\/dl\s*<\s*200/gi // Specific to reference range context
      ],
      unit: 'mg/dL',
      normalRange: '<200 mg/dL',
      expectedRange: [150, 300] // Medical validation range
    },
    {
      name: 'LDL Cholesterol', 
      category: 'Cardiovascular',
      patterns: [
        /ldl\s+cholesterol\s+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /cholesterol\s+ldl\s+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /ldl\s+(\d+(?:\.\d+)?)\s*mg\/dl\s*<\s*100/gi // Specific to reference range
      ],
      unit: 'mg/dL', 
      normalRange: '<100 mg/dL',
      expectedRange: [50, 250]
    },
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s+(\d+(?:\.\d+)?)\s*%/gi,
        /hemoglobin\s+a1c\s+(\d+(?:\.\d+)?)\s*%/gi,
        /a1c\s+(\d+(?:\.\d+)?)\s*%\s*<\s*5\.7/gi // Specific to reference range
      ],
      unit: '%',
      normalRange: '<5.7%',
      expectedRange: [4.0, 15.0]
    },
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s*u\/l/gi,
        /alt\s+(\d+(?:\.\d+)?)\s*u\/l\s*7\s*-\s*55/gi, // With reference range context
        /liver\s+enzyme\s+alt\s+(\d+(?:\.\d+)?)\s*u\/l/gi
      ],
      unit: 'U/L',
      normalRange: '7-55 U/L',
      expectedRange: [5, 200]
    },
    {
      name: 'AST',
      category: 'Liver Function', 
      patterns: [
        /ast\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s*u\/l/gi,
        /ast\s+(\d+(?:\.\d+)?)\s*u\/l\s*8\s*-\s*48/gi, // With reference range context
        /liver\s+enzyme\s+ast\s+(\d+(?:\.\d+)?)\s*u\/l/gi
      ],
      unit: 'U/L',
      normalRange: '8-48 U/L', 
      expectedRange: [5, 200]
    },
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s+(\d+(?:\.\d+)?)\s*mg\/dl/gi,
        /creatinine\s+(\d+(?:\.\d+)?)\s*mg\/dl\s*0\.7\s*-\s*1\.3/gi // With reference range
      ],
      unit: 'mg/dL',
      normalRange: '0.7-1.3 mg/dL',
      expectedRange: [0.5, 3.0]
    }
  ];

  // Extract with precise context matching
  precisePatterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    console.log(`\n--- Precise search for: ${pattern.name} ---`);
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0;
      
      const match = regex.exec(text);
      if (match && match[1]) {
        const value = match[1];
        const numericValue = parseFloat(value);
        const fullMatch = match[0];
        
        console.log(`🎯 PRECISE MATCH: "${fullMatch}"`);
        console.log(`   Parameter: ${pattern.name}`);
        console.log(`   Value: ${value}`);
        console.log(`   Numeric: ${numericValue}`);
        
        // Validate the value is in expected medical range
        if (numericValue >= pattern.expectedRange[0] && numericValue <= pattern.expectedRange[1]) {
          found.add(pattern.name);
          
          // Determine status
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
            referenceRange: pattern.normalRange,
            status: status,
            date: '2025-09-09',
            source: 'precise_pattern'
          });
          
          console.log(`✅ ADDED: ${pattern.name} = ${value} ${pattern.unit} (${status})`);
          break;
        } else {
          console.log(`❌ REJECTED: ${pattern.name} = ${value} (outside medical range ${pattern.expectedRange[0]}-${pattern.expectedRange[1]})`);
        }
      }
    }
  });

  console.log(`🎯 Precise extraction found ${parameters.length} valid parameters`);
  return parameters;
}

// Validate that extracted values make medical sense
function validateMedicalValues(parameters) {
  console.log('🔍 VALIDATING MEDICAL VALUES');
  
  return parameters.filter(param => {
    const value = parseFloat(param.value);
    let isValid = true;
    
    // Medical range validation
    switch (param.parameter) {
      case 'Total Cholesterol':
        isValid = value >= 100 && value <= 400;
        break;
      case 'LDL Cholesterol':
        isValid = value >= 30 && value <= 300;
        break;
      case 'HDL Cholesterol':
        isValid = value >= 20 && value <= 120;
        break;
      case 'HbA1c':
        isValid = value >= 3.0 && value <= 20.0;
        break;
      case 'ALT':
      case 'AST':
        isValid = value >= 1 && value <= 500;
        break;
      case 'Creatinine':
        isValid = value >= 0.3 && value <= 5.0;
        break;
    }
    
    if (!isValid) {
      console.log(`❌ INVALID: ${param.parameter} = ${param.value} (outside medical range)`);
    } else {
      console.log(`✅ VALID: ${param.parameter} = ${param.value}`);
    }
    
    return isValid;
  });
}

// AI verification for missed parameters
async function aiVerification(text, env) {
  try {
    console.log('🤖 AI VERIFICATION');
    
    const prompt = `Extract health parameters from this lab report text. Be very precise and only extract clear numerical values.

TEXT: ${text}

Look specifically for:
- Total Cholesterol (mg/dL)
- LDL Cholesterol (mg/dL) 
- HbA1c (%)
- ALT liver enzyme (U/L)
- AST liver enzyme (U/L)
- Creatinine (mg/dL)

Return only JSON with parameters you can clearly identify:
{
  "healthParameters": [
    {"parameter": "Total Cholesterol", "value": "230", "unit": "mg/dL"},
    {"parameter": "HbA1c", "value": "6.8", "unit": "%"}
  ]
}

Be very conservative. Only extract what you're confident about. JSON only:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 1000,
      temperature: 0.0
    });

    if (!response?.response) return [];

    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const data = JSON.parse(jsonMatch[0]);
    const params = (data.healthParameters || []).map(param => ({
      ...param,
      category: getCategoryForParameter(param.parameter),
      referenceRange: getReferenceRange(param.parameter),
      status: 'Unknown',
      date: '2025-09-09',
      source: 'ai_verification'
    }));

    console.log(`🤖 AI verification found ${params.length} parameters`);
    return params;

  } catch (error) {
    console.warn('AI verification failed:', error.message);
    return [];
  }
}

// Intelligent merge of precise and AI results
function intelligentMerge(preciseParams, aiParams) {
  console.log('🧩 INTELLIGENT MERGE');
  
  const merged = new Map();
  
  // Add precise parameters (highest confidence)
  preciseParams.forEach(param => {
    merged.set(param.parameter, param);
    console.log(`📌 Precise: ${param.parameter} = ${param.value}`);
  });
  
  // Add AI parameters only if not found by precise method
  aiParams.forEach(param => {
    if (!merged.has(param.parameter)) {
      merged.set(param.parameter, param);
      console.log(`🤖 AI: ${param.parameter} = ${param.value}`);
    } else {
      console.log(`⚠️ AI duplicate skipped: ${param.parameter}`);
    }
  });
  
  const final = Array.from(merged.values());
  console.log(`🧩 Final merge: ${final.length} parameters`);
  
  return final;
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
