export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== FIXED EXTRACT API - MULTI-PARAMETER DETECTION ===');
    console.log('Request timestamp:', new Date().toISOString());
    
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
        console.log('=== PROCESSING NEW PDF ===');
        console.log('File:', fileName, 'Size:', fileSize);
        
        // Extract text from PDF
        const extractionResult = await extractTextFromPDFAdvanced(pdfFile);
        textToProcess = extractionResult.text;
        
        console.log('=== EXTRACTED TEXT ===');
        console.log('Length:', textToProcess.length);
        console.log('Full text:', textToProcess);
        
      } else {
        throw new Error('PDF file required');
      }
    } else {
      throw new Error('Multipart form data required');
    }

    if (!textToProcess || textToProcess.length < 20) {
      throw new Error(`Text extraction failed. Got only ${textToProcess?.length || 0} characters`);
    }

    console.log('=== STARTING DUAL EXTRACTION METHOD ===');

    // METHOD 1: Pattern-based extraction (for reliability)
    console.log('Method 1: Pattern-based parameter extraction...');
    const patternParams = extractParametersWithPatterns(textToProcess);
    console.log('Pattern method found:', patternParams.length, 'parameters');
    console.log('Pattern parameters:', patternParams);

    // METHOD 2: AI extraction (for completeness)  
    console.log('Method 2: AI-based parameter extraction...');
    const aiParams = await extractParametersWithAI(textToProcess, env);
    console.log('AI method found:', aiParams.length, 'parameters');
    console.log('AI parameters:', aiParams);

    // METHOD 3: Combine and deduplicate results
    console.log('Method 3: Combining results...');
    const combinedParams = combineParameterResults(patternParams, aiParams);
    console.log('Combined total:', combinedParams.length, 'parameters');

    if (combinedParams.length === 0) {
      throw new Error(`NO PARAMETERS FOUND

EXTRACTED TEXT:
"${textToProcess}"

PATTERN RESULTS: ${patternParams.length} found
AI RESULTS: ${aiParams.length} found

The document may not contain recognizable health data.`);
    }

    // Detect test date from document
    const testDate = detectTestDate(textToProcess) || '2025-09-09';
    
    const extractedData = {
      healthParameters: combinedParams,
      documentType: 'Lab Results',
      testDate: testDate,
      totalParametersFound: combinedParams.length,
      extractionMethods: {
        patternBased: patternParams.length,
        aiBased: aiParams.length,
        combined: combinedParams.length
      }
    };

    console.log('=== EXTRACTION SUCCESS ===');
    console.log('Final parameter count:', combinedParams.length);
    console.log('Test date detected:', testDate);

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      debugInfo: {
        fileName: fileName,
        fileSize: fileSize,
        textLength: textToProcess.length,
        fullExtractedText: textToProcess,
        parametersFound: combinedParams.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== EXTRACTION ERROR ===');
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

// ADVANCED PDF TEXT EXTRACTION
async function extractTextFromPDFAdvanced(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    let extractedText = '';
    
    // Method 1: Extract all text in parentheses (most common PDF text storage)
    const parenthesesMatches = pdfString.match(/\(([^)]+)\)/g);
    if (parenthesesMatches) {
      const parenthesesText = parenthesesMatches
        .map(match => match.slice(1, -1))
        .filter(text => text.length > 0)
        .join(' ');
      extractedText += parenthesesText + ' ';
    }

    // Method 2: Extract text from BT/ET blocks
    const btMatches = pdfString.match(/BT(.*?)ET/gs);
    if (btMatches) {
      btMatches.forEach(block => {
        const textCommands = block.match(/\((.*?)\)\s*Tj/g);
        if (textCommands) {
          textCommands.forEach(cmd => {
            const text = cmd.match(/\((.*?)\)/);
            if (text && text[1]) {
              extractedText += text[1] + ' ';
            }
          });
        }
      });
    }

    // Method 3: Extract from streams
    const streamMatches = pdfString.match(/stream(.*?)endstream/gs);
    if (streamMatches) {
      streamMatches.forEach(stream => {
        const streamContent = stream.replace(/^stream\s*|\s*endstream$/g, '');
        const readableText = streamContent.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{5,}/g);
        if (readableText) {
          extractedText += readableText.join(' ') + ' ';
        }
      });
    }

    // Clean up text
    extractedText = extractedText
      .replace(/\\[rnt]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\d.,;:()\-\/\%<>]/g, ' ')
      .trim();

    return { text: extractedText };
    
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

// PATTERN-BASED PARAMETER EXTRACTION (Reliable method)
function extractParametersWithPatterns(text) {
  console.log('=== PATTERN EXTRACTION STARTING ===');
  console.log('Text to analyze:', text);
  
  const parameters = [];
  
  // Define comprehensive patterns for health parameters
  const healthPatterns = [
    // Cholesterol patterns
    {
      name: 'Total Cholesterol',
      category: 'Cardiovascular',
      patterns: [
        /total\s+cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i,
        /cholesterol\s+total\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i,
        /cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i
      ],
      unit: 'mg/dL',
      normalRange: '<200 mg/dL'
    },
    {
      name: 'LDL Cholesterol',
      category: 'Cardiovascular', 
      patterns: [
        /ldl\s+cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i,
        /ldl\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i
      ],
      unit: 'mg/dL',
      normalRange: '<100 mg/dL'
    },
    {
      name: 'HDL Cholesterol', 
      category: 'Cardiovascular',
      patterns: [
        /hdl\s+cholesterol\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i,
        /hdl\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i
      ],
      unit: 'mg/dL',
      normalRange: '>40 mg/dL'
    },
    // HbA1c patterns
    {
      name: 'HbA1c',
      category: 'Metabolic',
      patterns: [
        /hba1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i,
        /hemoglobin\s+a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i,
        /a1c\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*%?/i
      ],
      unit: '%',
      normalRange: '<5.7%'
    },
    // Liver enzymes
    {
      name: 'ALT',
      category: 'Liver Function',
      patterns: [
        /alt\s*(?:\(liver enzyme\))?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(u\/l|U\/L)?/i,
        /alanine\s+aminotransferase\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(u\/l|U\/L)?/i
      ],
      unit: 'U/L',
      normalRange: '7-55 U/L'
    },
    {
      name: 'AST',
      category: 'Liver Function', 
      patterns: [
        /ast\s*(?:\(liver enzyme\))?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(u\/l|U\/L)?/i,
        /aspartate\s+aminotransferase\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(u\/l|U\/L)?/i
      ],
      unit: 'U/L',
      normalRange: '8-48 U/L'
    },
    // Kidney function
    {
      name: 'Creatinine',
      category: 'Kidney Function',
      patterns: [
        /creatinine\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i
      ],
      unit: 'mg/dL',
      normalRange: '0.7-1.3 mg/dL'
    },
    // Blood glucose
    {
      name: 'Glucose',
      category: 'Metabolic',
      patterns: [
        /glucose\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i,
        /blood\s+glucose\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(mg\/dl|mg\/dL)?/i
      ],
      unit: 'mg/dL', 
      normalRange: '70-99 mg/dL'
    }
  ];

  // Extract parameters using patterns
  healthPatterns.forEach(pattern => {
    console.log(`Checking pattern for: ${pattern.name}`);
    
    for (const regex of pattern.patterns) {
      const match = text.match(regex);
      if (match && match[1]) {
        const value = match[1];
        console.log(`✅ Found ${pattern.name}: ${value}`);
        
        // Determine status based on value and normal range
        const numericValue = parseFloat(value);
        let status = 'Normal';
        
        // Simple status determination (can be enhanced)
        if (pattern.name === 'Total Cholesterol' && numericValue > 200) status = 'High';
        if (pattern.name === 'LDL Cholesterol' && numericValue > 100) status = 'High';
        if (pattern.name === 'HbA1c' && numericValue > 5.7) status = 'High';
        if (pattern.name === 'ALT' && numericValue > 55) status = 'High';
        if (pattern.name === 'AST' && numericValue > 48) status = 'High';
        
        parameters.push({
          category: pattern.category,
          parameter: pattern.name,
          value: value,
          unit: pattern.unit,
          referenceRange: pattern.normalRange,
          status: status,
          date: detectTestDate(text) || '2025-09-09'
        });
        
        break; // Found this parameter, move to next
      }
    }
  });

  console.log('Pattern extraction complete. Found:', parameters.length, 'parameters');
  return parameters;
}

// ENHANCED AI-BASED PARAMETER EXTRACTION
async function extractParametersWithAI(text, env) {
  try {
    console.log('=== AI EXTRACTION STARTING ===');
    
    const prompt = `You are a medical data extraction expert. Extract ONLY the main health parameters with their numerical values from this lab report text.

TEXT TO ANALYZE:
${text}

INSTRUCTIONS:
1. Find ONLY parameters with clear numerical values
2. Do NOT create duplicate entries  
3. Focus on: Total Cholesterol, LDL, HDL, HbA1c, ALT, AST, Creatinine
4. Extract the EXACT values from the text, don't guess

Return ONLY valid JSON in this format:
{
  "healthParameters": [
    {"parameter": "Total Cholesterol", "value": "218", "unit": "mg/dL", "category": "Cardiovascular"},
    {"parameter": "LDL Cholesterol", "value": "155", "unit": "mg/dL", "category": "Cardiovascular"},
    {"parameter": "HbA1c", "value": "6.8", "unit": "%", "category": "Metabolic"}
  ]
}

Extract ONLY what you can clearly identify. JSON response only:`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 1500,
      temperature: 0.0 // Very deterministic
    });

    console.log('AI response received:', response?.response?.substring(0, 500));

    if (!response?.response) {
      console.warn('AI extraction failed - no response');
      return [];
    }

    // Extract JSON more carefully
    let jsonString = response.response.trim();
    
    // Remove any markdown formatting
    jsonString = jsonString.replace(/```json\s*/i, '').replace(/\s*```/i, '');
    
    // Find JSON object
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('AI response missing JSON format');
      return [];
    }

    try {
      const data = JSON.parse(jsonMatch[0]);
      const aiParams = data.healthParameters || [];
      
      console.log(`AI found ${aiParams.length} parameters:`);
      aiParams.forEach((param, index) => {
        console.log(`${index + 1}. ${param.parameter}: ${param.value} ${param.unit || ''}`);
      });
      
      return aiParams;
      
    } catch (parseError) {
      console.warn('AI JSON parse error:', parseError.message);
      return [];
    }

  } catch (error) {
    console.warn('AI extraction failed:', error.message);
    return [];
  }
}

// COMBINE RESULTS FROM PATTERN AND AI METHODS
function combineParameterResults(patternParams, aiParams) {
  const combined = [...patternParams];
  const existingParams = new Set(patternParams.map(p => p.parameter.toLowerCase()));

  // Add AI parameters that weren't found by patterns
  aiParams.forEach(aiParam => {
    if (!existingParams.has(aiParam.parameter.toLowerCase())) {
      // Enhance AI parameters with missing fields
      combined.push({
        category: aiParam.category || 'General',
        parameter: aiParam.parameter,
        value: aiParam.value,
        unit: aiParam.unit || '',
        referenceRange: aiParam.referenceRange || 'Consult healthcare provider',
        status: aiParam.status || 'Unknown',
        date: aiParam.date || '2025-09-09'
      });
    }
  });

  return combined;
}

// DETECT TEST DATE FROM DOCUMENT
function detectTestDate(text) {
  const datePatterns = [
    /(?:test\s+date|collection\s+date|date\s+collected|report\s+date)\s*[:\-]?\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
    /(?:test\s+date|collection\s+date|date\s+collected|report\s+date)\s*[:\-]?\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i,
    /\b(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})\b/g,
    /\b(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})\b/g
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const dateStr = match[1];
      try {
        const date = new Date(dateStr);
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
