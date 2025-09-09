export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== ENHANCED DEBUG EXTRACT API ===');
    console.log('Content-Type:', request.headers.get('content-type'));
    
    let textToProcess = '';
    let processingMethod = 'unknown';
    let fileName = 'unknown';
    let fileSize = 0;
    let extractionDebug = {};
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      console.log('Processing FormData request');
      
      const formData = await request.formData();
      const pdfFile = formData.get('pdfFile');
      const documentText = formData.get('documentText');
      
      if (pdfFile && pdfFile instanceof File) {
        fileName = pdfFile.name;
        fileSize = pdfFile.size;
        console.log('=== PDF FILE ANALYSIS ===');
        console.log('File name:', fileName);
        console.log('File size:', fileSize);
        console.log('File type:', pdfFile.type);
        
        // NEW: Enhanced PDF extraction with multiple methods
        const extractionResult = await extractTextFromPDFEnhanced(pdfFile);
        textToProcess = extractionResult.text;
        processingMethod = 'Enhanced PDF extraction';
        extractionDebug = extractionResult.debug;
        
        console.log('=== EXTRACTION RESULTS ===');
        console.log('Extracted text length:', textToProcess.length);
        console.log('Methods used:', extractionResult.methodsUsed);
        console.log('Text preview:', textToProcess.substring(0, 500));
        
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

    // Enhanced text validation
    if (!textToProcess || textToProcess.length < 10) {
      throw new Error(`INSUFFICIENT TEXT EXTRACTED

DEBUG INFORMATION:
- File: ${fileName}
- Size: ${fileSize} bytes
- Method: ${processingMethod}
- Text length: ${textToProcess?.length || 0}
- Text preview: "${textToProcess?.substring(0, 200) || 'EMPTY'}"

EXTRACTION DEBUG:
${JSON.stringify(extractionDebug, null, 2)}

LIKELY CAUSES:
1. PDF is image-based (scanned) rather than text-based
2. PDF has complex encoding that our extraction can't handle
3. File is corrupted or password-protected

SOLUTIONS:
1. Try a different PDF with selectable text
2. Copy/paste the text directly instead of uploading PDF
3. Use a text-based PDF (not a scanned image)`);
    }

    console.log('=== STARTING AI PARAMETER EXTRACTION ===');
    console.log('Text being sent to AI:', textToProcess.length, 'characters');

    // Enhanced parameter extraction with better prompting
    const extractedData = await extractParametersEnhanced(textToProcess, env, fileName, fileSize, extractionDebug);
    
    // Validate we found parameters
    if (!extractedData.healthParameters || extractedData.healthParameters.length === 0) {
      throw new Error(`NO HEALTH PARAMETERS FOUND

DETAILED DEBUG INFO:
- File: ${fileName}
- Size: ${fileSize} bytes
- Text length: ${textToProcess.length}
- Processing method: ${processingMethod}
- AI response details: ${extractedData.debugInfo || 'Not available'}

EXTRACTED TEXT SAMPLE (first 1000 chars):
"${textToProcess.substring(0, 1000)}"

FULL EXTRACTED TEXT:
"${textToProcess}"

AI PROCESSING DEBUG:
${JSON.stringify(extractedData.aiDebug || {}, null, 2)}

This means either:
1. The PDF text extraction failed to get readable content
2. The text doesn't contain recognizable health parameters
3. AI model couldn't parse the text format`);
    }

    console.log('=== SUCCESS ===');
    console.log('Parameters found:', extractedData.healthParameters.length);

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      debugInfo: {
        fileName: fileName,
        fileSize: fileSize,
        processingMethod: processingMethod,
        textLength: textToProcess.length,
        extractionDebug: extractionDebug,
        fullExtractedText: textToProcess, // FULL TEXT FOR DEBUGGING
        parametersFound: extractedData.healthParameters.length,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== EXTRACT API ERROR ===');
    console.error('Error details:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Enhanced debug extraction failed',
      timestamp: new Date().toISOString()
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// ENHANCED PDF text extraction with multiple methods
async function extractTextFromPDFEnhanced(pdfFile) {
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log('=== ENHANCED PDF EXTRACTION ===');
    console.log('File size:', uint8Array.length, 'bytes');
    
    if (uint8Array.length === 0) {
      throw new Error('PDF file is empty or corrupted');
    }
    
    // Convert to string for text extraction
    const pdfString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    
    let extractedText = '';
    const methodsUsed = [];
    const debugInfo = {
      totalBytes: uint8Array.length,
      pdfVersion: '',
      methodResults: {}
    };
    
    // Detect PDF version
    const versionMatch = pdfString.match(/%PDF-(\d\.\d)/);
    if (versionMatch) {
      debugInfo.pdfVersion = versionMatch[1];
      console.log('PDF Version:', debugInfo.pdfVersion);
    }
    
    // METHOD 1: Enhanced parentheses extraction
    console.log('Method 1: Enhanced parentheses extraction...');
    const parenthesesMatches = pdfString.match(/\(([^)]{1,})\)/g);
    if (parenthesesMatches && parenthesesMatches.length > 0) {
      console.log('Found', parenthesesMatches.length, 'parentheses blocks');
      methodsUsed.push('parentheses');
      
      const parenthesesText = parenthesesMatches
        .map(match => match.slice(1, -1)) // Remove parentheses
        .filter(text => text.length > 0 && /[A-Za-z0-9]/.test(text)) // Filter readable text
        .join(' ');
      
      extractedText += parenthesesText + ' ';
      debugInfo.methodResults.parentheses = {
        blocksFound: parenthesesMatches.length,
        textLength: parenthesesText.length,
        sample: parenthesesText.substring(0, 200)
      };
      console.log('Parentheses method extracted:', parenthesesText.length, 'characters');
    }
    
    // METHOD 2: BT/ET text blocks
    console.log('Method 2: BT/ET text blocks...');
    const btMatches = pdfString.match(/BT\s+(.*?)\s+ET/gs);
    if (btMatches && btMatches.length > 0) {
      console.log('Found', btMatches.length, 'BT/ET blocks');
      methodsUsed.push('bt_et');
      
      let btText = '';
      btMatches.forEach(match => {
        const content = match.replace(/BT\s*|\s*ET/g, '');
        // Look for text show commands
        const textCommands = content.match(/\((.*?)\)\s*Tj/g);
        if (textCommands) {
          textCommands.forEach(cmd => {
            const text = cmd.match(/\((.*?)\)/);
            if (text && text[1] && text[1].length > 0) {
              btText += text[1] + ' ';
            }
          });
        }
      });
      
      extractedText += btText;
      debugInfo.methodResults.bt_et = {
        blocksFound: btMatches.length,
        textLength: btText.length,
        sample: btText.substring(0, 200)
      };
      console.log('BT/ET method extracted:', btText.length, 'characters');
    }
    
    // METHOD 3: Stream content analysis
    console.log('Method 3: Stream content analysis...');
    const streamMatches = pdfString.match(/stream\s*(.*?)\s*endstream/gs);
    if (streamMatches && streamMatches.length > 0) {
      console.log('Found', streamMatches.length, 'streams');
      methodsUsed.push('streams');
      
      let streamText = '';
      streamMatches.forEach(stream => {
        const streamContent = stream.replace(/^stream\s*|\s*endstream$/g, '');
        
        // Try to extract readable text patterns
        const readableMatches = streamContent.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{3,}/g);
        if (readableMatches) {
          streamText += readableMatches.join(' ') + ' ';
        }
      });
      
      extractedText += streamText;
      debugInfo.methodResults.streams = {
        streamsFound: streamMatches.length,
        textLength: streamText.length,
        sample: streamText.substring(0, 200)
      };
      console.log('Stream method extracted:', streamText.length, 'characters');
    }
    
    // METHOD 4: Raw text extraction (fallback)
    console.log('Method 4: Raw text extraction...');
    const rawTextMatches = pdfString.match(/[A-Za-z][A-Za-z\s\d.,;:()\-\/\%]{10,}/g);
    if (rawTextMatches && rawTextMatches.length > 0) {
      console.log('Found', rawTextMatches.length, 'raw text blocks');
      methodsUsed.push('raw_text');
      
      const rawText = rawTextMatches.join(' ');
      extractedText += rawText + ' ';
      debugInfo.methodResults.raw_text = {
        blocksFound: rawTextMatches.length,
        textLength: rawText.length,
        sample: rawText.substring(0, 200)
      };
      console.log('Raw text method extracted:', rawText.length, 'characters');
    }
    
    // Clean up extracted text
    extractedText = extractedText
      .replace(/\\[rnt]/g, ' ')  // Remove escape sequences
      .replace(/\s+/g, ' ')      // Multiple spaces to single
      .replace(/[^\w\s\d.,;:()\-\/\%]/g, ' ')  // Remove special chars but keep medical symbols
      .trim();
    
    console.log('=== FINAL EXTRACTION RESULTS ===');
    console.log('Total extracted length:', extractedText.length);
    console.log('Methods used:', methodsUsed.join(', '));
    console.log('Final text preview:', extractedText.substring(0, 500));
    
    debugInfo.finalTextLength = extractedText.length;
    debugInfo.methodsUsed = methodsUsed;
    
    if (extractedText.length < 10) {
      throw new Error(`PDF text extraction failed - insufficient text

EXTRACTION METHODS ATTEMPTED:
${Object.entries(debugInfo.methodResults).map(([method, result]) => 
  `- ${method}: ${result.blocksFound} blocks, ${result.textLength} chars`
).join('\n')}

PDF INFO:
- Version: ${debugInfo.pdfVersion || 'Unknown'}
- Size: ${debugInfo.totalBytes} bytes
- Methods tried: ${methodsUsed.join(', ')}

This PDF appears to be image-based or uses unsupported encoding.`);
    }
    
    return {
      text: extractedText,
      methodsUsed: methodsUsed,
      debug: debugInfo
    };
    
  } catch (error) {
    throw new Error(`Enhanced PDF extraction failed: ${error.message}`);
  }
}

// Enhanced AI parameter extraction with better debugging
async function extractParametersEnhanced(textToProcess, env, fileName, fileSize, extractionDebug) {
  const startTime = Date.now();
  
  // ENHANCED PROMPT with better instructions
  const prompt = `You are an expert medical data extraction AI. Extract ALL health parameters from this text.

CRITICAL INSTRUCTIONS:
1. Look for ANY numerical values with units (mg/dL, %, U/L, etc.)
2. Find dates in ANY format (YYYY-MM-DD, MM/DD/YYYY, Month Day Year, etc.)
3. Extract patient data like cholesterol, glucose, blood pressure, etc.
4. Include test names, values, units, and reference ranges

TEXT TO ANALYZE:
${textToProcess}

EXPECTED PARAMETERS TO LOOK FOR:
- Cholesterol (Total, LDL, HDL, Triglycerides)
- Blood glucose, HbA1c
- Liver enzymes (ALT, AST)
- Kidney function (Creatinine)
- Blood counts (Hemoglobin, etc.)
- Any other numerical health values

Respond with ONLY a JSON object in this EXACT format:
{
  "healthParameters": [
    {
      "category": "Cardiovascular",
      "parameter": "Total Cholesterol", 
      "value": "230",
      "unit": "mg/dL",
      "referenceRange": "<200",
      "date": "2025-01-15",
      "status": "High"
    }
  ],
  "documentType": "Lab Results",
  "testDate": "2025-01-15",
  "totalParametersFound": 1
}

CRITICAL: Find the ACTUAL test date from the document. Look for dates near "Date:", "Test Date:", "Collection Date:", etc.
JSON only, no other text:`;

  try {
    console.log('=== ENHANCED AI EXTRACTION ===');
    console.log('Sending', textToProcess.length, 'characters to AI');
    console.log('Text preview for AI:', textToProcess.substring(0, 1000));
    
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 3000,
      temperature: 0.1
    });

    const processingTime = Date.now() - startTime;
    console.log('AI response received after', processingTime, 'ms');
    console.log('AI response length:', aiResponse?.response?.length || 0);
    console.log('AI response preview:', aiResponse?.response?.substring(0, 500) || 'EMPTY');

    if (!aiResponse || !aiResponse.response) {
      throw new Error('AI model returned empty response');
    }

    // Enhanced JSON parsing
    let jsonString = aiResponse.response.trim();
    
    // Extract JSON from response
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    } else {
      throw new Error(`AI response does not contain valid JSON: "${jsonString}"`);
    }
    
    // Clean JSON
    jsonString = jsonString
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    
    let extractedData;
    try {
      extractedData = JSON.parse(jsonString);
    } catch (parseError) {
      throw new Error(`JSON parse error: ${parseError.message}. AI response: "${jsonString}"`);
    }
    
    // Validate structure
    if (!extractedData.healthParameters || !Array.isArray(extractedData.healthParameters)) {
      throw new Error(`Invalid response structure: ${JSON.stringify(extractedData)}`);
    }
    
    // Set defaults
    extractedData.totalParametersFound = extractedData.healthParameters.length;
    extractedData.processingTime = processingTime;
    extractedData.aiDebug = {
      aiResponseLength: aiResponse.response.length,
      processingTimeMs: processingTime,
      inputTextLength: textToProcess.length,
      extractionDebug: extractionDebug
    };
    
    console.log('=== EXTRACTION SUCCESS ===');
    console.log('Parameters found:', extractedData.totalParametersFound);
    
    return extractedData;
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== AI EXTRACTION FAILED ===');
    console.error('Error:', error.message);
    console.error('Processing time:', processingTime, 'ms');
    
    throw new Error(`AI parameter extraction failed: ${error.message}`);
  }
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
