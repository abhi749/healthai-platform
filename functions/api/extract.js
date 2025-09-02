export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { documentText } = await request.json();
    
    if (!documentText || !documentText.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No document text provided'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // Smart extraction prompt for ANY medical parameters
    const extractionPrompt = `You are a medical data extraction AI. Your job is to:

1. IDENTIFY all health/medical parameters from this document
2. SEPARATE personal identifiers from medical data
3. OUTPUT structured data in JSON format

Document Text:
${documentText}

EXTRACT ALL medical parameters you find. This could include:
- Lab values (cholesterol, glucose, etc.)
- Vital signs (blood pressure, heart rate, temperature)
- Body composition (weight, BMI, body fat %, muscle mass)
- Hormones (testosterone, estrogen, thyroid, cortisol)
- Vitamins & minerals (D3, B12, iron, calcium)
- Metabolic markers (A1C, insulin, ketones)
- Cardiac markers (troponin, BNP, CK-MB)
- Inflammatory markers (CRP, ESR, white blood cell count)
- Reproductive health (menstrual cycle data, fertility markers)
- Fitness data (steps, calories burned, VO2 max)
- Bone density (DEXA scan results, T-scores, Z-scores)
- Cancer markers (PSA, CEA, CA-125)
- Genetic markers (DNA analysis, RNA levels)
- Sleep data (sleep stages, REM, sleep efficiency)
- Mental health assessments (mood scores, anxiety levels)
- Nutritional analysis (macros, micronutrients, hydration)
- ANY other health-related measurements

IMPORTANT RULES:
- Do NOT include personal identifiers (names, addresses, phone numbers, IDs)
- Do NOT include doctor names, clinic names, or provider info
- DO include test dates, reference ranges, and units
- DO include ALL numerical health measurements you find
- BE COMPREHENSIVE - don't miss any health parameter

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
      "date": "2024-08-15"
    },
    {
      "category": "Metabolic",
      "parameter": "Glucose Fasting",
      "value": "110", 
      "unit": "mg/dL",
      "referenceRange": "70-99",
      "date": "2024-08-15"
    }
  ],
  "documentType": "Lab Results",
  "testDate": "2024-08-15",
  "totalParametersFound": 12
}

Extract from this document now:`;

    console.log('Sending extraction request to AI...');
    
    // Use Llama to intelligently extract health parameters
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: extractionPrompt,
      max_tokens: 1000,
      temperature: 0.1 // Low temperature for consistent extraction
    });

    console.log('AI extraction response:', aiResponse);

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
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Fallback: return raw response for manual processing
      extractedData = {
        personalDataFound: [],
        healthParameters: [],
        rawAIResponse: aiResponse.response,
        documentType: "Unknown",
        testDate: null,
        totalParametersFound: 0,
        parseError: parseError.message
      };
    }

    return new Response(JSON.stringify({
      success: true,
      extractedData: extractedData,
      processingInfo: {
        model: 'llama-3.1-8b-instruct',
        extractionMethod: 'AI-powered dynamic extraction',
        timestamp: new Date().toISOString()
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
