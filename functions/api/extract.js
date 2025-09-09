export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== UNIVERSAL HEALTH PARAMETER EXTRACTION ===');
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
        console.log('=== PROCESSING FILE ===');
        console.log('Name:', fileName);
        console.log('Size:', fileSize, 'bytes');
        
        // STAGE 1: Advanced PDF text extraction
        const extractionResult = await advancedPDFExtraction(pdfFile);
        textToProcess = extractionResult.text;
        
        console.log('=== RAW EXTRACTED TEXT ===');
        console.log('Length:', textToProcess.length, 'characters');
        console.log('Preview:', textToProcess.substring(0, 1000));
        console.log('Full text:', textToProcess);
        
      } else {
        throw new Error('PDF file required');
      }
    } else {
      throw new Error('Multipart form data required');
    }

    if (!textToProcess || textToProcess.length < 10) {
      throw new Error(`Text extraction failed. Only extracted ${textToProcess?.length || 0} characters`);
    }

    console.log('=== STARTING MULTI-STRATEGY EXTRACTION ===');

    // STRATEGY 1: Aggressive Pattern Matching (most reliable)
    console.log('\n🔍 STRATEGY 1: Aggressive Pattern Matching...');
    const patternResults = aggressivePatternExtraction(textToProcess);
    console.log('Pattern strategy found:', patternResults.length, 'parameters');

    // STRATEGY 2: AI-Powered Smart Extraction
    console.log('\n🤖 STRATEGY 2: AI Smart Extraction...');
    const aiResults = await smartAIExtraction(textToProcess, env);
    console.log('AI strategy found:', aiResults.length, 'parameters');

    // STRATEGY 3: Fuzzy Text Analysis (backup)
    console.log('\n🔬 STRATEGY 3: Fuzzy Text Analysis...');
    const fuzzyResults = fuzzyTextExtraction(textToProcess);
    console.log('Fuzzy strategy found:', fuzzyResults.length, 'parameters');

    // STRATEGY 4: Combine all strategies intelligently
    console.log('\n🧩 STRATEGY 4: Intelligent Combination...');
    const finalResults = intelligentCombination(patternResults, aiResults, fuzzyResults);
    console.log('Final combined results:', finalResults.length, 'parameters');

    if (finalResults.length === 0) {
      throw new Error(`COMPLETE EXTRACTION FAILURE

EXTRACTED TEXT (${textToProcess.length} chars):
"${textToProcess}"

STRATEGY RESULTS:
- Pattern matching: ${patternResults.length} parameters
- AI extraction: ${aiResults.length} parameters  
- Fuzzy analysis: ${fuzzyResults.length} parameters

This document may not contain recognizable health parameters.`);
    }

    // Detect test date
    const testDate = advancedDateDetection(textToProcess) || '2025-09-09';
    
    const extractedData = {
      healthParameters: finalResults,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: finalResults.length,
      extractionStrategies: {
        patternMatching: patternResults.length,
        aiExtraction: aiResults.length,
        fuzzyAnalysis: fuzzyResults.length,
        finalCombined: finalResults.length
      }
    };

    console.log('=== EXTRACTION COMPLETE ===');
    console.log('SUCCESS! Found', finalResults.length, 'health parameters');
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
        fullExtractedText: textToProcess,
        parametersFound: finalResults.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== UNIVERSAL EXTRACTION ERROR ===');
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

// ADVANCED PDF TEXT EXTRACTION - Multiple methods
async function advancedPDFExtraction(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    console.log('PDF size:', uint8Array.length, 'bytes');
    
    let extractedText = '';
    const methods = [];
    
    // Method 1: Parentheses text (most common)
    const parenthesesText = extractParenthesesText(pdfString);
    if (parenthesesText.length > 10) {
      extractedText += parenthesesText + ' ';
      methods.push('parentheses');
    }
    
    // Method 2: BT/ET blocks
    const btText = extractBTETText(pdfString);
    if (btText.length > 10) {
      extractedText += btText + ' ';
      methods.push('bt_et');
    }
    
    // Method 3: Stream content
    const streamText = extractStreamText(pdfString);
    if (streamText.length > 10) {
      extractedText += streamText + ' ';
      methods.push('streams');
    }
    
    // Method 4: Raw text patterns
    const rawText = extractRawText(pdfString);
    if (rawText.length > 10) {
      extractedText += rawText + ' ';
      methods.push('raw');
    }
    
    // Method 5: Hex decoded text
    const hexText = extractHexText(pdfString);
    if (hexText.length > 10) {
      extractedText += hexText + ' ';
      methods.push('hex');
    }
    
    // Clean up the combined text
    extractedText = extractedText
      .replace(/\\[rnt]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\d.,;:()\-\/\%<>=]/g, ' ')
      .trim();
    
    console.log('Extraction methods used:', methods.join(', '));
    console.log('Total extracted length:', extractedText.length);
    
    return { text: extractedText, methods: methods };
    
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// PDF Text extraction helper functions
function extractParenthesesText(pdfString) {
  const matches = pdfString.match(/\(([^)]+)\)/g);
  if (!matches) return '';
  
  return matches
    .map(match => match.slice(1, -1))
    .filter(text => text.length > 0 && /[A-Za-z0-9]/.test(text))
    .join(' ');
}

function extractBTETText(pdfString) {
  const matches = pdfString.match(/BT(.*?)ET/gs);
  if (!matches) return '';
  
  let text = '';
  matches.forEach(block => {
    const textCommands = block.match(/\(([^)]*)\)\s*Tj/g);
    if (textCommands) {
      textCommands.forEach(cmd => {
        const match = cmd.match(/\(([^)]*)\)/);
        if (match && match[1]) {
          text += match[1] + ' ';
        }
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
    const readable = content.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{5,}/g);
    if (readable) {
      text += readable.join(' ') + ' ';
    }
  });
  return text;
}

function extractRawText(pdfString) {
  const matches = pdfString.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{15,}/g);
  return matches ? matches.join(' ') : '';
}

function extractHexText(pdfString) {
  // Try to decode hex-encoded text
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
          if (char.match(/[A-Za-z0-9\s.,;:()\-\/\%]/)) {
            decoded += char;
          }
        }
        if (decoded.length > 3) {
          text += decoded + ' ';
        }
      }
    } catch (e) {
      // Skip invalid hex
    }
  });
  return text;
}

// STRATEGY 1: Aggressive Pattern Matching
function aggressivePatternExtraction(text) {
  console.log('🔍 AGGRESSIVE PATTERN EXTRACTION');
  console.log('Analyzing text:', text);
  
  const parameters = [];
  const found = new Set();
  
  // Comprehensive health parameter patterns
  const patterns = [
    // Cholesterol (multiple variations)
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /(?:total\s+)?cholesterol\s*(?:total)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?\s*(?:total\s+)?cholesterol/gi
      ],
      unit: 'mg/dL',
      normalRange: '<200 mg/dL'
    },
    // LDL Cholesterol
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /ldl\s*(?:cholesterol)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(?:cholesterol\s+)?ldl\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?\s*ldl/gi
      ],
      unit: 'mg/dL',
      normalRange: '<100 mg/dL'
    },
    // HDL Cholesterol  
    {
      name: 'HDL Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /hdl\s*(?:cholesterol)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(?:cholesterol\s+)?hdl\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?\s*hdl/gi
      ],
      unit: 'mg/dL',
      normalRange: '>40 mg/dL'
    },
    // HbA1c (multiple variations)
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/gi,
        /hemoglobin\s+a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/gi,
        /a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/gi,
        /(\d+(?:\.\d+)?)\s*%?\s*hba1c/gi
      ],
      unit: '%',
      normalRange: '<5.7%'
    },
    // ALT (Liver enzyme)
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s*(?:\(liver\s+enzyme\))?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /alanine\s+aminotransferase\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /liver\s+enzyme\s*alt\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?\s*alt/gi
      ],
      unit: 'U/L',
      normalRange: '7-55 U/L'
    },
    // AST (Liver enzyme)
    {
      name: 'AST',
      category: 'Liver Function',
      patterns: [
        /ast\s*(?:\(liver\s+enzyme\))?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /aspartate\s+aminotransferase\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /liver\s+enzyme\s*ast\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:u\/l|U\/L|ul)?\s*ast/gi
      ],
      unit: 'U/L',
      normalRange: '8-48 U/L'
    },
    // Creatinine
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?/gi,
        /(\d+(?:\.\d+)?)\s*(?:mg\/dl|mg\/dL|mgdl)?\s*creatinine/gi
      ],
      unit: 'mg/dL',
      normalRange: '0.7-1.3 mg/dL'
    }
  ];

  // Extract using all patterns
  patterns.forEach(pattern => {
    if (found.has(pattern.name)) return;
    
    console.log(`\n--- Searching for: ${pattern.name} ---`);
    
    for (const regex of pattern.patterns) {
      regex.lastIndex = 0; // Reset regex
      
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[1] && !found.has(pattern.name)) {
          const value = match[1];
          const fullMatch = match[0];
          
          console.log(`🎯 FOUND: "${fullMatch}" -> ${pattern.name}: ${value}`);
          
          found.add(pattern.name);
          
          const numericValue = parseFloat(value);
          let status = 'Normal';
          
          // Status determination
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
            date: '2025-09-09'
          });
          
          console.log(`✅ ADDED: ${pattern.name} = ${value} ${pattern.unit} (${status})`);
          break;
        }
        
        if (!regex.global) break;
      }
      
      if (found.has(pattern.name)) break;
    }
  });

  console.log(`🔍 Pattern extraction complete: ${parameters.length} parameters found`);
  return parameters;
}

// STRATEGY 2: Smart AI Extraction
async function smartAIExtraction(text, env) {
  try {
    console.log('🤖 SMART AI EXTRACTION');
    
    const prompt = `You are a medical AI expert. Extract ALL health parameters with numerical values from this lab report.

IMPORTANT: Extract ONLY parameters with clear numerical values. Do not guess or estimate.

TEXT:
${text}

Find all parameters like:
- Total Cholesterol, LDL, HDL (mg/dL)
- HbA1c (%)
- ALT, AST (U/L) 
- Creatinine (mg/dL)
- Any other numerical health values

Return ONLY JSON:
{
  "healthParameters": [
    {"parameter": "Total Cholesterol", "value": "218", "unit": "mg/dL", "category": "Cardiovascular"},
    {"parameter": "LDL Cholesterol", "value": "155", "unit": "mg/dL", "category": "Cardiovascular"}
  ]
}

Extract ALL parameters you can identify. JSON only:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 2000,
      temperature: 0.0
    });

    if (!response?.response) {
      console.warn('AI returned no response');
      return [];
    }

    console.log('AI response preview:', response.response.substring(0, 500));

    const jsonMatch = response.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('AI response missing JSON');
      return [];
    }

    const data = JSON.parse(jsonMatch[0]);
    const params = data.healthParameters || [];
    
    console.log(`🤖 AI found ${params.length} parameters`);
    return params;

  } catch (error) {
    console.warn('AI extraction failed:', error.message);
    return [];
  }
}

// STRATEGY 3: Fuzzy Text Extraction (numbers near health terms)
function fuzzyTextExtraction(text) {
  console.log('🔬 FUZZY TEXT EXTRACTION');
  
  const parameters = [];
  const healthTerms = [
    { term: 'cholesterol', name: 'Total Cholesterol', category: 'Cardiovascular', unit: 'mg/dL' },
    { term: 'ldl', name: 'LDL Cholesterol', category: 'Cardiovascular', unit: 'mg/dL' },
    { term: 'hdl', name: 'HDL Cholesterol', category: 'Cardiovascular', unit: 'mg/dL' },
    { term: 'hba1c', name: 'HbA1c', category: 'Metabolic', unit: '%' },
    { term: 'a1c', name: 'HbA1c', category: 'Metabolic', unit: '%' },
    { term: 'alt', name: 'ALT', category: 'Liver Function', unit: 'U/L' },
    { term: 'ast', name: 'AST', category: 'Liver Function', unit: 'U/L' },
    { term: 'creatinine', name: 'Creatinine', category: 'Kidney Function', unit: 'mg/dL' }
  ];
  
  const found = new Set();
  
  healthTerms.forEach(item => {
    if (found.has(item.name)) return;
    
    const termRegex = new RegExp(item.term, 'gi');
    const match = text.search(termRegex);
    
    if (match !== -1) {
      // Look for numbers within 50 characters of the term
      const start = Math.max(0, match - 25);
      const end = Math.min(text.length, match + item.term.length + 25);
      const snippet = text.substring(start, end);
      
      const numberMatch = snippet.match(/(\d+(?:\.\d+)?)/);
      if (numberMatch) {
        const value = numberMatch[1];
        
        console.log(`🔬 Fuzzy found: ${item.name} = ${value} (near "${item.term}")`);
        
        found.add(item.name);
        parameters.push({
          category: item.category,
          parameter: item.name,
          value: value,
          unit: item.unit,
          referenceRange: 'Check with healthcare provider',
          status: 'Unknown',
          date: '2025-09-09'
        });
      }
    }
  });
  
  console.log(`🔬 Fuzzy extraction complete: ${parameters.length} parameters found`);
  return parameters;
}

// STRATEGY 4: Intelligent Combination
function intelligentCombination(patternResults, aiResults, fuzzyResults) {
  console.log('🧩 INTELLIGENT COMBINATION');
  
  const combined = new Map();
  
  // Priority: Pattern > AI > Fuzzy
  
  // Add pattern results (highest priority)
  patternResults.forEach(param => {
    combined.set(param.parameter, { ...param, source: 'pattern' });
    console.log(`📌 Pattern: ${param.parameter} = ${param.value}`);
  });
  
  // Add AI results (if not already found by patterns)
  aiResults.forEach(param => {
    if (!combined.has(param.parameter)) {
      combined.set(param.parameter, { 
        ...param, 
        source: 'ai',
        referenceRange: param.referenceRange || 'Check with healthcare provider',
        status: param.status || 'Unknown',
        date: param.date || '2025-09-09'
      });
      console.log(`🤖 AI: ${param.parameter} = ${param.value}`);
    } else {
      console.log(`⚠️ AI duplicate skipped: ${param.parameter}`);
    }
  });
  
  // Add fuzzy results (lowest priority)
  fuzzyResults.forEach(param => {
    if (!combined.has(param.parameter)) {
      combined.set(param.parameter, { ...param, source: 'fuzzy' });
      console.log(`🔬 Fuzzy: ${param.parameter} = ${param.value}`);
    } else {
      console.log(`⚠️ Fuzzy duplicate skipped: ${param.parameter}`);
    }
  });
  
  const final = Array.from(combined.values());
  console.log(`🧩 Final combination: ${final.length} unique parameters`);
  
  return final;
}

// Advanced date detection
function advancedDateDetection(text) {
  const datePatterns = [
    /(?:test\s+date|collection\s+date|sample\s+date|report\s+date|date)\s*[:\-]?\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/gi,
    /(?:test\s+date|collection\s+date|sample\s+date|report\s+date|date)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi,
    /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/g,
    /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\b/g
  ];

  for (const pattern of datePatterns) {
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
