export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== ULTIMATE PDF EXTRACTION SOLUTION ===');
    console.log('Timestamp:', new Date().toISOString());
    
    let textToProcess = '';
    let fileName = 'unknown';
    let fileSize = 0;
    let extractionDebug = {};
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const pdfFile = formData.get('pdfFile');
      
      if (pdfFile && pdfFile instanceof File) {
        fileName = pdfFile.name;
        fileSize = pdfFile.size;
        
        console.log('=== PDF FILE ANALYSIS ===');
        console.log('File:', fileName);
        console.log('Size:', fileSize, 'bytes');
        
        // COMPREHENSIVE PDF EXTRACTION - Try every possible method
        const extractionResult = await comprehensivePDFExtraction(pdfFile);
        textToProcess = extractionResult.combinedText;
        extractionDebug = extractionResult.debug;
        
        console.log('=== PDF EXTRACTION RESULTS ===');
        console.log('Total methods tried:', extractionResult.debug.methodsAttempted);
        console.log('Successful methods:', extractionResult.debug.successfulMethods.join(', '));
        console.log('Combined text length:', textToProcess.length);
        console.log('Text preview (first 1000 chars):', textToProcess.substring(0, 1000));
        console.log('FULL EXTRACTED TEXT:', textToProcess);
        
      } else {
        throw new Error('PDF file required');
      }
    } else {
      throw new Error('Multipart form data required');
    }

    if (!textToProcess || textToProcess.length < 50) {
      throw new Error(`CRITICAL: PDF text extraction failed!

EXTRACTION DEBUG:
${JSON.stringify(extractionDebug, null, 2)}

Only extracted ${textToProcess?.length || 0} characters.

EXTRACTED TEXT:
"${textToProcess}"

POSSIBLE CAUSES:
1. PDF is image-based (scanned) rather than text-based
2. PDF uses advanced encoding we can't decode
3. PDF is password protected or corrupted
4. PDF uses non-standard text rendering

SOLUTIONS:
1. Try a different PDF with selectable text
2. Copy/paste the text directly if possible
3. Use a text-based PDF (not scanned image)
4. Check if PDF text is selectable in a PDF viewer`);
    }

    console.log('=== STARTING COMPREHENSIVE PARAMETER EXTRACTION ===');

    // METHOD 1: Enhanced Pattern Recognition
    console.log('\n🔍 METHOD 1: Enhanced Pattern Recognition');
    const patternResults = enhancedPatternExtraction(textToProcess);
    console.log('Pattern method results:', patternResults.length, 'parameters');
    patternResults.forEach((param, i) => {
      console.log(`  ${i+1}. ${param.parameter}: ${param.value} ${param.unit}`);
    });

    // METHOD 2: AI with Multiple Models/Prompts
    console.log('\n🤖 METHOD 2: Multi-Prompt AI Analysis');
    const aiResults = await comprehensiveAIExtraction(textToProcess, env);
    console.log('AI method results:', aiResults.length, 'parameters');
    aiResults.forEach((param, i) => {
      console.log(`  ${i+1}. ${param.parameter}: ${param.value} ${param.unit || ''}`);
    });

    // METHOD 3: Fuzzy Number Detection
    console.log('\n🔬 METHOD 3: Fuzzy Number Detection');
    const fuzzyResults = fuzzyNumberDetection(textToProcess);
    console.log('Fuzzy method results:', fuzzyResults.length, 'parameters');
    fuzzyResults.forEach((param, i) => {
      console.log(`  ${i+1}. ${param.parameter}: ${param.value} ${param.unit || ''}`);
    });

    // METHOD 4: Smart Combination
    console.log('\n🧩 METHOD 4: Smart Result Combination');
    const finalResults = smartCombination(patternResults, aiResults, fuzzyResults);
    console.log('Final combined results:', finalResults.length, 'parameters');

    if (finalResults.length === 0) {
      // FALLBACK: Show what we found in each method for debugging
      throw new Error(`NO PARAMETERS EXTRACTED BY ANY METHOD!

PDF EXTRACTION DEBUG:
- File: ${fileName} (${fileSize} bytes)
- Text length: ${textToProcess.length} characters
- Methods tried: ${extractionDebug.methodsAttempted}
- Successful extraction methods: ${extractionDebug.successfulMethods.join(', ')}

EXTRACTION METHOD RESULTS:
- Pattern Recognition: ${patternResults.length} parameters
- AI Analysis: ${aiResults.length} parameters  
- Fuzzy Detection: ${fuzzyResults.length} parameters

FULL EXTRACTED TEXT:
"${textToProcess}"

This indicates the PDF text extraction is incomplete or the document doesn't contain standard health parameters.`);
    }

    const testDate = advancedDateDetection(textToProcess) || '2025-09-09';
    
    const extractedData = {
      healthParameters: finalResults,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: finalResults.length,
      extractionMethods: {
        pdfMethods: extractionDebug.successfulMethods,
        patternResults: patternResults.length,
        aiResults: aiResults.length,
        fuzzyResults: fuzzyResults.length,
        finalCombined: finalResults.length
      }
    };

    console.log('=== EXTRACTION SUCCESS ===');
    console.log(`SUCCESS: Found ${finalResults.length} health parameters!`);
    finalResults.forEach((param, index) => {
      console.log(`${index + 1}. ${param.parameter}: ${param.value} ${param.unit} (${param.status})`);
    });

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      debugInfo: {
        fileName: fileName,
        fileSize: fileSize,
        textLength: textToProcess.length,
        extractionDebug: extractionDebug,
        fullExtractedText: textToProcess,
        parametersFound: finalResults.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== ULTIMATE EXTRACTION ERROR ===');
    console.error('Error:', error.message);
    
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

// COMPREHENSIVE PDF EXTRACTION - Try every possible method
async function comprehensivePDFExtraction(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    console.log('PDF Analysis:');
    console.log('- Total bytes:', uint8Array.length);
    console.log('- PDF header:', pdfString.substring(0, 20));
    
    const extractionMethods = [];
    const debug = {
      methodsAttempted: 0,
      successfulMethods: [],
      methodResults: {}
    };
    
    // METHOD 1: Standard Parentheses Extraction
    console.log('PDF Method 1: Parentheses extraction...');
    debug.methodsAttempted++;
    const method1 = extractMethod1(pdfString);
    if (method1.length > 10) {
      extractionMethods.push(method1);
      debug.successfulMethods.push('parentheses');
      debug.methodResults.parentheses = { length: method1.length, preview: method1.substring(0, 200) };
      console.log('✅ Method 1 success:', method1.length, 'characters');
    } else {
      console.log('❌ Method 1 failed:', method1.length, 'characters');
    }
    
    // METHOD 2: BT/ET Text Block Extraction
    console.log('PDF Method 2: BT/ET block extraction...');
    debug.methodsAttempted++;
    const method2 = extractMethod2(pdfString);
    if (method2.length > 10) {
      extractionMethods.push(method2);
      debug.successfulMethods.push('bt_et');
      debug.methodResults.bt_et = { length: method2.length, preview: method2.substring(0, 200) };
      console.log('✅ Method 2 success:', method2.length, 'characters');
    } else {
      console.log('❌ Method 2 failed:', method2.length, 'characters');
    }
    
    // METHOD 3: Stream Content Extraction
    console.log('PDF Method 3: Stream content extraction...');
    debug.methodsAttempted++;
    const method3 = extractMethod3(pdfString);
    if (method3.length > 10) {
      extractionMethods.push(method3);
      debug.successfulMethods.push('streams');
      debug.methodResults.streams = { length: method3.length, preview: method3.substring(0, 200) };
      console.log('✅ Method 3 success:', method3.length, 'characters');
    } else {
      console.log('❌ Method 3 failed:', method3.length, 'characters');
    }
    
    // METHOD 4: Raw Text Pattern Extraction
    console.log('PDF Method 4: Raw text pattern extraction...');
    debug.methodsAttempted++;
    const method4 = extractMethod4(pdfString);
    if (method4.length > 10) {
      extractionMethods.push(method4);
      debug.successfulMethods.push('raw_patterns');
      debug.methodResults.raw_patterns = { length: method4.length, preview: method4.substring(0, 200) };
      console.log('✅ Method 4 success:', method4.length, 'characters');
    } else {
      console.log('❌ Method 4 failed:', method4.length, 'characters');
    }
    
    // METHOD 5: Advanced Hex Decoding
    console.log('PDF Method 5: Hex decoding...');
    debug.methodsAttempted++;
    const method5 = extractMethod5(pdfString);
    if (method5.length > 10) {
      extractionMethods.push(method5);
      debug.successfulMethods.push('hex_decode');
      debug.methodResults.hex_decode = { length: method5.length, preview: method5.substring(0, 200) };
      console.log('✅ Method 5 success:', method5.length, 'characters');
    } else {
      console.log('❌ Method 5 failed:', method5.length, 'characters');
    }
    
    // METHOD 6: Content Stream Analysis
    console.log('PDF Method 6: Content stream analysis...');
    debug.methodsAttempted++;
    const method6 = extractMethod6(pdfString);
    if (method6.length > 10) {
      extractionMethods.push(method6);
      debug.successfulMethods.push('content_streams');
      debug.methodResults.content_streams = { length: method6.length, preview: method6.substring(0, 200) };
      console.log('✅ Method 6 success:', method6.length, 'characters');
    } else {
      console.log('❌ Method 6 failed:', method6.length, 'characters');
    }
    
    // Combine all successful extractions
    let combinedText = extractionMethods.join(' ');
    
    // Clean and normalize
    combinedText = combinedText
      .replace(/\\[rnt]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\d.,;:()\-\/\%<>=]/g, ' ')
      .trim();
    
    console.log('=== PDF EXTRACTION SUMMARY ===');
    console.log('Methods attempted:', debug.methodsAttempted);
    console.log('Successful methods:', debug.successfulMethods.length);
    console.log('Final combined text length:', combinedText.length);
    
    return {
      combinedText: combinedText,
      debug: debug
    };
    
  } catch (error) {
    throw new Error(`Comprehensive PDF extraction failed: ${error.message}`);
  }
}

// Individual extraction methods
function extractMethod1(pdfString) {
  const matches = pdfString.match(/\(([^)]+)\)/g);
  return matches ? matches.map(m => m.slice(1, -1)).filter(t => t.length > 0).join(' ') : '';
}

function extractMethod2(pdfString) {
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

function extractMethod3(pdfString) {
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

function extractMethod4(pdfString) {
  const matches = pdfString.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{20,}/g);
  return matches ? matches.join(' ') : '';
}

function extractMethod5(pdfString) {
  const hexMatches = pdfString.match(/<([0-9A-Fa-f\s]+)>/g);
  if (!hexMatches) return '';
  
  let text = '';
  hexMatches.forEach(hexStr => {
    try {
      const hex = hexStr.slice(1, -1).replace(/\s/g, '');
      if (hex.length % 2 === 0 && hex.length > 0) {
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

function extractMethod6(pdfString) {
  // Look for content between obj and endobj
  const matches = pdfString.match(/obj(.*?)endobj/gs);
  if (!matches) return '';
  
  let text = '';
  matches.forEach(obj => {
    const readable = obj.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{10,}/g);
    if (readable) text += readable.join(' ') + ' ';
  });
  return text;
}

// ENHANCED PATTERN EXTRACTION
function enhancedPatternExtraction(text) {
  console.log('🔍 Enhanced pattern extraction starting...');
  console.log('Text to analyze (length):', text.length);
  console.log('Text preview:', text.substring(0, 500));
  
  const parameters = [];
  const found = new Set();
  
  // Ultra-flexible patterns that catch various formats
  const patterns = [
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /total\s*cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /cholesterol\s*total\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*mg/gi,
        /(\d+(?:\.\d+)?)\s*mg\/dl.*?cholesterol/gi
      ],
      unit: 'mg/dL',
      expectedRange: [100, 500]
    },
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /ldl\s*cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /ldl\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /(\d+(?:\.\d+)?)\s*mg\/dl.*?ldl/gi
      ],
      unit: 'mg/dL',
      expectedRange: [50, 300]
    },
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /hemoglobin\s*a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: '%',
      expectedRange: [3.0, 20.0]
    },
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /(\d+(?:\.\d+)?)\s*u\/l.*?alt/gi,
        /liver\s*enzyme.*?alt\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'U/L',
      expectedRange: [5, 300]
    },
    {
      name: 'AST',
      category: 'Liver Function',
      patterns: [
        /ast\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /(\d+(?:\.\d+)?)\s*u\/l.*?ast/gi,
        /liver\s*enzyme.*?ast\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi
      ],
      unit: 'U/L',
      expectedRange: [5, 300]
    },
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)/gi,
        /(\d+(?:\.\d+)?)\s*mg\/dl.*?creatinine/gi
      ],
      unit: 'mg/dL',
      expectedRange: [0.3, 5.0]
    }
  ];

  patterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    console.log(`\nSearching for: ${pattern.name}`);
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0;
      
      const match = regex.exec(text);
      if (match && match[1]) {
        const value = match[1];
        const numericValue = parseFloat(value);
        
        console.log(`Found match: "${match[0]}" -> value: ${value}`);
        
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
            date: '2025-09-09'
          });
          
          console.log(`✅ Added: ${pattern.name} = ${value} ${pattern.unit}`);
          break;
        } else {
          console.log(`❌ Rejected: ${value} outside range ${pattern.expectedRange[0]}-${pattern.expectedRange[1]}`);
        }
      }
    }
  });

  console.log(`Pattern extraction found ${parameters.length} parameters`);
  return parameters;
}

// COMPREHENSIVE AI EXTRACTION with multiple attempts
async function comprehensiveAIExtraction(text, env) {
  console.log('🤖 Comprehensive AI extraction starting...');
  
  const allResults = [];
  
  // AI Attempt 1: Conservative extraction
  try {
    console.log('AI Attempt 1: Conservative extraction...');
    const prompt1 = `Extract health parameters from this lab report text. Be very precise.

TEXT: ${text}

Extract ONLY clear numerical values for these parameters:
- Total Cholesterol (mg/dL)
- LDL Cholesterol (mg/dL)
- HbA1c (%)
- ALT (U/L)
- AST (U/L)
- Creatinine (mg/dL)

Return JSON format:
{"healthParameters": [{"parameter": "Total Cholesterol", "value": "230", "unit": "mg/dL"}]}

JSON only:`;

    const response1 = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt1,
      max_tokens: 1000,
      temperature: 0.0
    });

    if (response1?.response) {
      const result1 = parseAIResponse(response1.response);
      if (result1.length > 0) {
        allResults.push(...result1);
        console.log(`AI Attempt 1 found: ${result1.length} parameters`);
      }
    }
  } catch (e) {
    console.warn('AI Attempt 1 failed:', e.message);
  }

  // AI Attempt 2: Aggressive extraction
  try {
    console.log('AI Attempt 2: Aggressive extraction...');
    const prompt2 = `Find ALL health parameters with numbers in this text: ${text}

Look for any numerical health values. Extract everything you can find.
JSON format: {"healthParameters": [{"parameter": "name", "value": "number"}]}`;

    const response2 = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt2,
      max_tokens: 1500,
      temperature: 0.2
    });

    if (response2?.response) {
      const result2 = parseAIResponse(response2.response);
      if (result2.length > 0) {
        allResults.push(...result2);
        console.log(`AI Attempt 2 found: ${result2.length} parameters`);
      }
    }
  } catch (e) {
    console.warn('AI Attempt 2 failed:', e.message);
  }

  // Deduplicate AI results
  const deduped = deduplicateResults(allResults);
  console.log(`AI extraction final: ${deduped.length} parameters`);
  
  return deduped;
}

function parseAIResponse(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return (data.healthParameters || []).map(param => ({
        ...param,
        category: getCategoryForParameter(param.parameter),
        referenceRange: getReferenceRange(param.parameter),
        status: 'Unknown',
        date: '2025-09-09',
        unit: param.unit || getDefaultUnit(param.parameter)
      }));
    }
  } catch (e) {
    console.warn('AI response parse error:', e.message);
  }
  return [];
}

// FUZZY NUMBER DETECTION - Find numbers near health terms
function fuzzyNumberDetection(text) {
  console.log('🔬 Fuzzy number detection starting...');
  
  const results = [];
  const healthTerms = [
    { term: 'cholesterol', name: 'Total Cholesterol', unit: 'mg/dL' },
    { term: 'ldl', name: 'LDL Cholesterol', unit: 'mg/dL' },
    { term: 'hdl', name: 'HDL Cholesterol', unit: 'mg/dL' },
    { term: 'hba1c', name: 'HbA1c', unit: '%' },
    { term: 'a1c', name: 'HbA1c', unit: '%' },
    { term: 'alt', name: 'ALT', unit: 'U/L' },
    { term: 'ast', name: 'AST', unit: 'U/L' },
    { term: 'creatinine', name: 'Creatinine', unit: 'mg/dL' }
  ];
  
  const found = new Set();
  
  healthTerms.forEach(item => {
    if (found.has(item.name)) return;
    
    const termIndex = text.toLowerCase().indexOf(item.term.toLowerCase());
    if (termIndex !== -1) {
      // Look for numbers within 30 characters
      const start = Math.max(0, termIndex - 15);
      const end = Math.min(text.length, termIndex + item.term.length + 15);
      const snippet = text.substring(start, end);
      
      const numberMatch = snippet.match(/(\d+(?:\.\d+)?)/);
      if (numberMatch) {
        const value = numberMatch[1];
        const numericValue = parseFloat(value);
        
        // Basic range validation
        let valid = false;
        if (item.name.includes('Cholesterol') && numericValue >= 50 && numericValue <= 500) valid = true;
        if (item.name === 'HbA1c' && numericValue >= 3 && numericValue <= 20) valid = true;
        if ((item.name === 'ALT' || item.name === 'AST') && numericValue >= 5 && numericValue <= 300) valid = true;
        if (item.name === 'Creatinine' && numericValue >= 0.3 && numericValue <= 5) valid = true;
        
        if (valid) {
          found.add(item.name);
          results.push({
            category: getCategoryForParameter(item.name),
            parameter: item.name,
            value: value,
            unit: item.unit,
            referenceRange: getReferenceRange(item.name),
            status: 'Unknown',
            date: '2025-09-09'
          });
          console.log(`Fuzzy found: ${item.name} = ${value} (near "${item.term}")`);
        }
      }
    }
  });
  
  console.log(`Fuzzy detection found ${results.length} parameters`);
  return results;
}

// SMART COMBINATION of all methods
function smartCombination(patternResults, aiResults, fuzzyResults) {
  console.log('🧩 Smart combination starting...');
  
  const combined = new Map();
  
  // Priority: Pattern > AI > Fuzzy
  patternResults.forEach(param => {
    combined.set(param.parameter, { ...param, source: 'pattern' });
  });
  
  aiResults.forEach(param => {
    if (!combined.has(param.parameter)) {
      combined.set(param.parameter, { ...param, source: 'ai' });
    }
  });
  
  fuzzyResults.forEach(param => {
    if (!combined.has(param.parameter)) {
      combined.set(param.parameter, { ...param, source: 'fuzzy' });
    }
  });
  
  return Array.from(combined.values());
}

// Helper functions
function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(param => {
    const key = param.parameter;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

function getDefaultUnit(paramName) {
  const units = {
    'Total Cholesterol': 'mg/dL',
    'LDL Cholesterol': 'mg/dL',
    'HDL Cholesterol': 'mg/dL',
    'HbA1c': '%',
    'ALT': 'U/L',
    'AST': 'U/L',
    'Creatinine': 'mg/dL'
  };
  return units[paramName] || '';
}

function advancedDateDetection(text) {
  const patterns = [
    /(?:test\s+date|collection\s+date|date)\s*[:\-]?\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/gi,
    /(?:test\s+date|collection\s+date|date)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi,
    /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/g,
    /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\b/g
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
