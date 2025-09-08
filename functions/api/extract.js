export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
        
        // Validate file size (25MB limit)
        if (pdfFile.size > 25 * 1024 * 1024) {
          throw new Error('File size exceeds 25MB limit');
        }
        
        // Validate file type
        if (!pdfFile.type.includes('pdf') && !fileName.toLowerCase().includes('.pdf')) {
          throw new Error('Only PDF files are supported');
        }
        
        try {
          // Try to extract text from PDF using a more robust method
          textToProcess = await extractTextFromPDF(pdfFile);
          processingMethod = 'PDF text extraction';
          
          console.log('PDF extraction result length:', textToProcess.length);
          
          if (!textToProcess || textToProcess.trim().length < 10) {
            throw new Error('No readable text found in PDF. This may be a scanned/image-based PDF.');
          }
          
        } catch (pdfError) {
          console.error('PDF extraction failed:', pdfError.message);
          throw new Error(`PDF processing failed: ${pdfError.message}. Please ensure your PDF contains readable text (not scanned images).`);
        }
        
      } else if (documentText && documentText.trim()) {
        textToProcess = documentText.trim();
        processingMethod = 'Direct text input';
        console.log('Using provided document text, length:', textToProcess.length);
        
      } else {
        throw new Error('Either PDF file or document text must be provided');
      }
      
    } else {
      // Handle JSON requests
      const requestData = await request.json();
      if (requestData.documentText && requestData.documentText.trim()) {
        textToProcess = requestData.documentText.trim();
        processingMethod = 'JSON text input';
      } else {
        throw new Error('No document text provided in JSON request');
      }
    }

    // Validate that we have meaningful text to process
    if (!textToProcess || textToProcess.trim().length < 10) {
      throw new Error('Insufficient text content for processing');
    }

    console.log(`Processing ${textToProcess.length} characters using ${processingMethod}`);

    // Truncate text if too long to prevent token limit issues
    const MAX_TEXT_LENGTH = 15000; // Conservative limit
    if (textToProcess.length > MAX_TEXT_LENGTH) {
      console.log(`Text too long (${textToProcess.length} chars), truncating to ${MAX_TEXT_LENGTH}`);
      textToProcess = textToProcess.substring(0, MAX_TEXT_LENGTH) + '...';
    }

    // Enhanced extraction prompt for medical data
    const extractionPrompt = `Extract health and medical data from this document. Find all numerical health values, test results, and measurements.

Document text:
${textToProcess}

Extract and return a JSON object with this exact structure:
{
  "healthParameters": [
    {
      "name": "parameter name",
      "value": "numerical value with unit",
      "category": "category like 'blood work', 'vital signs', etc.",
      "date": "test date if found"
    }
  ]
}

Look for parameters like:
- Blood tests (cholesterol, glucose, hemoglobin, etc.)
- Vital signs (blood pressure, heart rate, temperature)
- Body measurements (weight, height, BMI)
- Hormone levels
- Vitamin levels
- Any other numerical health values

Return only valid JSON. If no health parameters found, return {"healthParameters": []}.`;

    console.log('Calling Workers AI for extraction');
    
    // Call Workers AI
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: extractionPrompt,
      max_tokens: 1000,
      temperature: 0.1
    });

    console.log('AI Response received:', JSON.stringify(aiResponse));

    if (!aiResponse || !aiResponse.response) {
      throw new Error('No response from AI model');
    }

    // Parse AI response
    let extractedData;
    try {
      // Try to extract JSON from AI response
      const responseText = aiResponse.response.trim();
      console.log('Raw AI response:', responseText);
      
      // Look for JSON in the response
      let jsonStart = responseText.indexOf('{');
      let jsonEnd = responseText.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error('No JSON found in AI response');
      }
      
      const jsonText = responseText.substring(jsonStart, jsonEnd);
      extractedData = JSON.parse(jsonText);
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError.message);
      console.error('AI response was:', aiResponse.response);
      throw new Error('Failed to parse health data from document. The AI response was not in valid JSON format.');
    }

    // Validate extracted data structure
    if (!extractedData || !Array.isArray(extractedData.healthParameters)) {
      console.error('Invalid extracted data structure:', extractedData);
      throw new Error('Invalid data structure returned from AI analysis');
    }

    console.log(`Successfully extracted ${extractedData.healthParameters.length} health parameters`);

    // Return success response
    const result = {
      success: true,
      healthParameters: extractedData.healthParameters,
      metadata: {
        fileName: fileName,
        processingMethod: processingMethod,
        textLength: textToProcess.length,
        parametersFound: extractedData.healthParameters.length,
        timestamp: new Date().toISOString()
      }
    };

    console.log('Returning result:', JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Extract API Error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Return detailed error for debugging
    const errorResponse = {
      success: false,
      error: error.message,
      details: "Document extraction failed",
      timestamp: new Date().toISOString(),
      troubleshooting: {
        pdfRequirements: "PDF must contain readable text (not scanned images)",
        dataRequirements: "Document must contain numerical health values (lab results, measurements, etc.)",
        supportedFormats: "Text-based PDFs with medical data",
        commonIssues: [
          "Scanned/image-based PDFs cannot be processed",
          "Documents without numerical health values",
          "Corrupted or password-protected files",
          "Non-medical documents"
        ]
      }
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// PDF text extraction function
async function extractTextFromPDF(pdfFile) {
  try {
    console.log('Starting PDF text extraction');
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer();
    console.log('PDF converted to ArrayBuffer, size:', arrayBuffer.byteLength);
    
    // For now, we'll use a simple approach
    // In a real implementation, you'd use a PDF parsing library
    // This is a placeholder that will need to be replaced with actual PDF parsing
    
    // Try to read as text (this won't work for real PDFs, but helps with debugging)
    const uint8Array = new Uint8Array(arrayBuffer);
    let text = '';
    
    // Look for text patterns in the PDF
    for (let i = 0; i < uint8Array.length - 1; i++) {
      const char = String.fromCharCode(uint8Array[i]);
      if (char.match(/[a-zA-Z0-9\s.,()%-]/)) {
        text += char;
      }
    }
    
    // Clean up the extracted text
    text = text.replace(/\s+/g, ' ').trim();
    
    console.log('Extracted text length:', text.length);
    console.log('Text preview:', text.substring(0, 200));
    
    if (text.length < 50) {
      throw new Error('Unable to extract sufficient text from PDF. This appears to be a scanned or image-based PDF.');
    }
    
    return text;
    
  } catch (error) {
    console.error('PDF extraction error:', error.message);
    throw new Error(`PDF text extraction failed: ${error.message}`);
  }
}
