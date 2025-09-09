export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== TABLE-AWARE HEALTH PARAMETER EXTRACTION ===');
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
        console.log('Text length:', textToProcess.length);
        console.log('FULL EXTRACTED TEXT:');
        console.log(textToProcess);
        
      } else {
        throw new Error('PDF file required');
      }
    } else {
      throw new Error('Multipart form data required');
    }

    if (!textToProcess || textToProcess.length < 50) {
      throw new Error(`Text extraction failed. Only got ${textToProcess?.length || 0} characters`);
    }

    console.log('=== STARTING TABLE-AWARE EXTRACTION ===');

    // STEP 1: Detect if this is a table-based lab report
    const tableStructure = analyzeTableStructure(textToProcess);
    console.log('Table structure analysis:', tableStructure);

    // STEP 2: Extract parameters using table-aware methods
    let extractedParams = [];
    
    if (tableStructure.isTable) {
      console.log('🗂️ Using TABLE-BASED extraction...');
      extractedParams = extractFromTableStructure(textToProcess, tableStructure);
    } else {
      console.log('📄 Using TEXT-BASED extraction...');
      extractedParams = extractFromTextStructure(textToProcess);
    }
    
    console.log('Table-aware extraction found:', extractedParams.length, 'parameters');

    // STEP 3: AI verification and enhancement
    const aiParams = await aiTableVerification(textToProcess, env);
    console.log('AI verification found:', aiParams.length, 'parameters');

    // STEP 4: Intelligent merge with priority to table extraction
    const finalParams = intelligentTableMerge(extractedParams, aiParams);
    console.log('Final merged results:', finalParams.length, 'parameters');

    if (finalParams.length === 0) {
      throw new Error(`NO PARAMETERS FOUND

EXTRACTED TEXT:
"${textToProcess}"

TABLE ANALYSIS:
${JSON.stringify(tableStructure, null, 2)}`);
    }

    const testDate = detectTestDate(textToProcess) || '2025-09-09';
    
    const extractedData = {
      healthParameters: finalParams,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: finalParams.length,
      tableStructure: tableStructure
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
        fullExtractedText: textToProcess,
        tableStructure: tableStructure,
        parametersFound: finalParams.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== TABLE-AWARE EXTRACTION ERROR ===');
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
    
    // Method 1: Parentheses text
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

// ANALYZE TABLE STRUCTURE - Detect if this is a structured table
function analyzeTableStructure(text) {
  console.log('🗂️ ANALYZING TABLE STRUCTURE');
  console.log('Text to analyze:', text);
  
  const analysis = {
    isTable: false,
    hasHeaders: false,
    columnPattern: null,
    rowSeparators: [],
    confidence: 0
  };
  
  // Look for table indicators
  const tableIndicators = [
    'test', 'result', 'reference range',
    'parameter', 'value', 'normal range',
    'cholesterol', 'hba1c', 'creatinine'
  ];
  
  let indicatorCount = 0;
  tableIndicators.forEach(indicator => {
    if (text.toLowerCase().includes(indicator)) {
      indicatorCount++;
    }
  });
  
  analysis.confidence = indicatorCount / tableIndicators.length;
  
  // Check for common table patterns
  if (text.toLowerCase().includes('test') && 
      text.toLowerCase().includes('result') && 
      text.toLowerCase().includes('reference')) {
    analysis.isTable = true;
    analysis.hasHeaders = true;
    analysis.columnPattern = 'test-result-reference';
    console.log('✅ Detected TABLE structure with Test-Result-Reference columns');
  }
  
  // Look for row-like patterns
  const lines = text.split(/[\n\r]+/).filter(line => line.trim().length > 0);
  const rowPatterns = [];
  
  lines.forEach((line, index) => {
    // Look for lines with parameter name + number + unit
    const hasParam = /(?:cholesterol|hba1c|alt|ast|creatinine)/i.test(line);
    const hasNumber = /\d+(?:\.\d+)?/.test(line);
    const hasUnit = /(?:mg\/dl|%|u\/l)/i.test(line);
    
    if (hasParam && hasNumber) {
      rowPatterns.push({
        lineIndex: index,
        line: line,
        hasParam: hasParam,
        hasNumber: hasNumber,
        hasUnit: hasUnit
      });
    }
  });
  
  analysis.rowSeparators = rowPatterns;
  
  if (rowPatterns.length >= 3) {
    analysis.isTable = true;
    analysis.confidence = Math.min(1.0, analysis.confidence + 0.3);
  }
  
  console.log('Table analysis result:', analysis);
  return analysis;
}

// EXTRACT FROM TABLE STRUCTURE - Focus on result values
function extractFromTableStructure(text, tableStructure) {
  console.log('🗂️ TABLE-BASED EXTRACTION');
  console.log('Using table structure:', tableStructure.columnPattern);
  
  const parameters = [];
  const found = new Set();
  
  // TABLE-AWARE PATTERNS - Look for specific table row formats
  const tablePatterns = [
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      // Match: "Total Cholesterol 218 mg/dL <200 mg/dL" 
      // Focus on the MIDDLE number (result), not the reference range
      patterns: [
        /total\s+cholesterol\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+<\s*\d+/gi,
        /cholesterol\s+total\s+(\d+(?:\.\d+)?)\s+mg\/dl/gi,
        /total\s+cholesterol[^0-9]*(\d+(?:\.\d+)?)[^<]*mg\/dl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [100, 400]
    },
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular',
      // Match: "LDL Cholesterol 152 mg/dL <100 mg/dL"
      patterns: [
        /ldl\s+cholesterol\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+<\s*\d+/gi,
        /cholesterol\s+ldl\s+(\d+(?:\.\d+)?)\s+mg\/dl/gi,
        /ldl\s+cholesterol[^0-9]*(\d+(?:\.\d+)?)[^<]*mg\/dl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [50, 300]
    },
    {
      name: 'HbA1c',
      category: 'Metabolic',
      // Match: "HbA1c 6.2% <5.7%" - Focus on first percentage
      patterns: [
        /hba1c\s+(\d+(?:\.\d+)?)\s*%\s+<\s*\d+/gi,
        /hemoglobin\s+a1c\s+(\d+(?:\.\d+)?)\s*%/gi,
        /hba1c[^0-9]*(\d+(?:\.\d+)?)\s*%[^<]*</gi
      ],
      unit: '%',
      expectedRange: [3.0, 15.0]
    },
    {
      name: 'ALT',
      category: 'Liver Function',
      // Match: "ALT (Liver Enzyme) 62 U/L 7-55 U/L"
      patterns: [
        /alt\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s+u\/l\s+\d+\s*-\s*\d+/gi,
        /alt[^0-9]*(\d+(?:\.\d+)?)\s+u\/l[^0-9]*\d+\s*-/gi,
        /liver\s+enzyme\s+alt[^0-9]*(\d+(?:\.\d+)?)\s+u\/l/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'AST',
      category: 'Liver Function',
      // Match: "AST (Liver Enzyme) 47 U/L 8-48 U/L"
      patterns: [
        /ast\s+\(liver\s+enzyme\)\s+(\d+(?:\.\d+)?)\s+u\/l\s+\d+\s*-\s*\d+/gi,
        /ast[^0-9]*(\d+(?:\.\d+)?)\s+u\/l[^0-9]*\d+\s*-/gi,
        /liver\s+enzyme\s+ast[^0-9]*(\d+(?:\.\d+)?)\s+u\/l/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      // Match: "Creatinine 1.03 mg/dL 0.7-1.3 mg/dL"
      patterns: [
        /creatinine\s+(\d+(?:\.\d+)?)\s+mg\/dl\s+\d+\.\d+\s*-\s*\d+\.\d+/gi,
        /creatinine[^0-9]*(\d+(?:\.\d+)?)\s+mg\/dl[^0-9]*\d+\.\d+\s*-/gi
      ],
      unit: 'mg/dL',
      expectedRange: [0.5, 3.0]
    }
  ];

  // Extract using table-aware patterns
  tablePatterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    console.log(`\n--- Table extraction for: ${pattern.name} ---`);
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0;
      
      const match = regex.exec(text);
      if (match && match[1]) {
        const value = match[1];
        const numericValue = parseFloat(value);
        const fullMatch = match[0];
        
        console.log(`🎯 TABLE MATCH: "${fullMatch}"`);
        console.log(`   Parameter: ${pattern.name}`);
        console.log(`   Extracted value: ${value}`);
        console.log(`   Numeric value: ${numericValue}`);
        
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
            referenceRange: getReferenceRange(pattern.name),
            status: status,
            date: '2025-09-09',
            source: 'table_extraction'
          });
          
          console.log(`✅ ADDED: ${pattern.name} = ${value} ${pattern.unit} (${status})`);
          break;
        } else {
          console.log(`❌ REJECTED: ${pattern.name} = ${value} (outside range ${pattern.expectedRange[0]}-${pattern.expectedRange[1]})`);
        }
      }
    }
  });

  console.log(`🗂️ Table extraction found ${parameters.length} parameters`);
  return parameters;
}

// EXTRACT FROM TEXT STRUCTURE - For non-table documents
function extractFromTextStructure(text) {
  console.log('📄 TEXT-BASED EXTRACTION');
  
  const parameters = [];
  const found = new Set();
  
  // Standard patterns for text-based documents
  const textPatterns = [
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /total\s*cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /cholesterol\s*total\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*mg/gi
      ],
      unit: 'mg/dL',
      expectedRange: [100, 400]
    },
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /ldl\s*cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /ldl\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'mg/dL',
      expectedRange: [50, 300]
    },
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: '%',
      expectedRange: [3.0, 15.0]
    },
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'AST',
      category: 'Liver Function',
      patterns: [
        /ast\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'U/L',
      expectedRange: [10, 200]
    },
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'mg/dL',
      expectedRange: [0.5, 3.0]
    }
  ];

  // Use same extraction logic as table but with simpler patterns
  textPatterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0;
      
      const match = regex.exec(text);
      if (match && match[1]) {
        const value = match[1];
        const numericValue = parseFloat(value);
        
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
            source: 'text_extraction'
          });
          
          break;
        }
      }
    }
  });

  return parameters;
}

// AI TABLE VERIFICATION
async function aiTableVerification(text, env) {
  try {
    console.log('🤖 AI TABLE VERIFICATION');
    
    const prompt = `You are analyzing a lab report table. Extract the RESULT VALUES (not reference ranges) for each test.

TEXT: ${text}

This appears to be a table with columns: Test | Result | Reference Range

Extract ONLY the Result column values:
- Total Cholesterol: ? mg/dL
- LDL Cholesterol: ? mg/dL  
- HbA1c: ? %
- ALT: ? U/L
- AST: ? U/L
- Creatinine: ? mg/dL

Return JSON with the ACTUAL RESULT VALUES (middle column):
{"healthParameters": [{"parameter": "Total Cholesterol", "value": "218", "unit": "mg/dL"}]}

JSON only:`;

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
      source: 'ai_verification'
    }));

  } catch (error) {
    console.warn('AI verification failed:', error.message);
    return [];
  }
}

// INTELLIGENT TABLE MERGE
function intelligentTableMerge(tableParams, aiParams) {
  console.log('🧩 INTELLIGENT TABLE MERGE');
  
  const merged = new Map();
  
  // Priority: Table extraction > AI verification
  tableParams.forEach(param => {
    merged.set(param.parameter, param);
    console.log(`📌 Table: ${param.parameter} = ${param.value}`);
  });
  
  aiParams.forEach(param => {
    if (!merged.has(param.parameter)) {
      merged.set(param.parameter, param);
      console.log(`🤖 AI: ${param.parameter} = ${param.value}`);
    } else {
      console.log(`⚠️ AI duplicate skipped: ${param.parameter}`);
    }
  });
  
  return Array.from(merged.values());
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
