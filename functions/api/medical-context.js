export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { healthParameters, queryType = 'general' } = await request.json();
    
    if (!healthParameters || !Array.isArray(healthParameters)) {
      throw new Error('Health parameters array required');
    }

    console.log('Fetching medical context for parameters:', healthParameters);

    // Process each health parameter to get medical context
    const medicalContexts = await Promise.all(
      healthParameters.slice(0, 5).map(param => // Limit to 5 parameters to avoid rate limits
        getMedicalContextForParameter(param)
      )
    );

    // Combine all contexts
    const combinedContext = {
      parameters: healthParameters,
      medicalKnowledge: medicalContexts.filter(context => context.success),
      totalQueries: medicalContexts.length,
      successfulQueries: medicalContexts.filter(context => context.success).length,
      timestamp: new Date().toISOString(),
      source: 'MedlinePlus/NIH'
    };

    return new Response(JSON.stringify({
      success: true,
      medicalContext: combinedContext,
      processingInfo: {
        apiSource: 'MedlinePlus Web Service',
        privacyNote: 'Only generic medical terms queried - no personal data transmitted',
        queryMethod: 'Anonymous health parameter lookup'
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Medical context error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      fallbackAdvice: 'Consult healthcare provider for medical interpretation'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Get medical context for a specific health parameter
async function getMedicalContextForParameter(parameter) {
  try {
    // Extract medical term from parameter (e.g., "Cholesterol: 240 mg/dL" -> "cholesterol")
    const medicalTerm = extractMedicalTerm(parameter);
    
    if (!medicalTerm) {
      return {
        success: false,
        parameter: parameter,
        error: 'Could not extract medical term'
      };
    }

    // Query MedlinePlus API with generic medical term only
    const medicalInfo = await queryMedlinePlus(medicalTerm);
    
    return {
      success: true,
      parameter: parameter,
      medicalTerm: medicalTerm,
      context: medicalInfo
    };

  } catch (error) {
    console.error(`Error getting context for ${parameter}:`, error);
    return {
      success: false,
      parameter: parameter,
      error: error.message
    };
  }
}

// Extract medical term from health parameter
function extractMedicalTerm(parameter) {
  // Handle different parameter formats
  const paramStr = typeof parameter === 'string' ? parameter : parameter.parameter || parameter.name;
  
  if (!paramStr) return null;

  // Remove values, units, and reference ranges to get clean medical term
  const cleanTerm = paramStr
    .toLowerCase()
    .replace(/[:\-]\s*\d+.*$/, '') // Remove ": 240 mg/dL" etc.
    .replace(/\(.*?\)/g, '') // Remove parentheses
    .replace(/[,\/\-]/g, ' ') // Replace separators with spaces
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim();

  // Map common variations to standard medical terms
  const termMappings = {
    'cholesterol total': 'cholesterol',
    'cholesterol ldl': 'ldl cholesterol',
    'cholesterol hdl': 'hdl cholesterol',
    'glucose fasting': 'blood glucose',
    'blood pressure systolic': 'blood pressure',
    'blood pressure diastolic': 'blood pressure',
    'hemoglobin a1c': 'hemoglobin a1c',
    'thyroid stimulating hormone': 'tsh',
    'tsh': 'thyroid',
    'free t4': 'thyroid',
    'free t3': 'thyroid',
    'testosterone total': 'testosterone',
    'vitamin d': 'vitamin d deficiency',
    'crp': 'c reactive protein',
    'esr': 'erythrocyte sedimentation rate'
  };

  return termMappings[cleanTerm] || cleanTerm;
}

// Query MedlinePlus Web Service API
async function queryMedlinePlus(medicalTerm) {
  try {
    // MedlinePlus Web Service API endpoint
    const baseUrl = 'https://wsearch.nlm.nih.gov/ws/query';
    
    // Create search query (generic medical term only - no personal data)
    const searchParams = new URLSearchParams({
      db: 'healthTopics', // Search health topics database
      term: medicalTerm,
      retmax: '3', // Limit results
      rettype: 'brief' // Brief format for faster response
    });

    console.log(`Querying MedlinePlus for term: ${medicalTerm}`);

    // Make request to MedlinePlus API
    const response = await fetch(`${baseUrl}?${searchParams}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'HealthAI/1.0 (Privacy-First Health Analysis)',
        'Accept': 'application/json'
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`MedlinePlus API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Process and structure the medical information
    return processMedlinePlusResponse(data, medicalTerm);

  } catch (error) {
    console.error(`MedlinePlus query failed for ${medicalTerm}:`, error);
    
    // Return fallback information
    return {
      source: 'Fallback Medical Knowledge',
      term: medicalTerm,
      summary: `${medicalTerm} is an important health parameter. Consult your healthcare provider for interpretation of your specific values.`,
      generalInfo: getFallbackMedicalInfo(medicalTerm),
      timestamp: new Date().toISOString(),
      note: 'MedlinePlus API unavailable - using fallback information'
    };
  }
}

// Process MedlinePlus API response
function processMedlinePlusResponse(data, medicalTerm) {
  try {
    // Extract relevant information from MedlinePlus response
    const documents = data.nlmSearchResult?.list?.document || [];
    
    if (documents.length === 0) {
      return {
        source: 'MedlinePlus/NIH',
        term: medicalTerm,
        summary: `Medical information about ${medicalTerm}`,
        generalInfo: getFallbackMedicalInfo(medicalTerm),
        timestamp: new Date().toISOString(),
        note: 'No specific results found - using general information'
      };
    }

    // Get the first relevant document
    const firstDoc = documents[0];
    
    return {
      source: 'MedlinePlus/NIH',
      term: medicalTerm,
      title: firstDoc.title || `Information about ${medicalTerm}`,
      summary: firstDoc.snippet || firstDoc.content || `Medical information about ${medicalTerm}`,
      url: firstDoc.url,
      lastUpdated: firstDoc.dateRevised || firstDoc.dateCreated,
      generalInfo: getFallbackMedicalInfo(medicalTerm),
      timestamp: new Date().toISOString(),
      totalResults: documents.length
    };

  } catch (error) {
    console.error('Error processing MedlinePlus response:', error);
    return {
      source: 'MedlinePlus/NIH',
      term: medicalTerm,
      summary: `Medical information about ${medicalTerm}`,
      generalInfo: getFallbackMedicalInfo(medicalTerm),
      timestamp: new Date().toISOString(),
      note: 'Response processing error - using fallback information'
    };
  }
}

// Fallback medical information for common health parameters
function getFallbackMedicalInfo(medicalTerm) {
  const fallbackInfo = {
    'cholesterol': {
      normalRange: 'Total cholesterol: Less than 200 mg/dL (desirable)',
      description: 'A waxy substance found in blood. High levels can increase heart disease risk.',
      factors: 'Diet, exercise, genetics, and medications can affect cholesterol levels.'
    },
    'blood glucose': {
      normalRange: 'Fasting glucose: 70-99 mg/dL (normal)',
      description: 'The amount of sugar in your blood. Important for diabetes monitoring.',
      factors: 'Diet, exercise, stress, and medications can affect blood glucose.'
    },
    'blood pressure': {
      normalRange: 'Less than 120/80 mmHg (normal)',
      description: 'The force of blood against artery walls. High BP increases cardiovascular risk.',
      factors: 'Diet, exercise, stress, weight, and medications affect blood pressure.'
    },
    'thyroid': {
      normalRange: 'TSH: 0.4-4.0 mIU/L (varies by lab)',
      description: 'Thyroid hormones regulate metabolism, energy, and many body functions.',
      factors: 'Age, medications, stress, and diet can affect thyroid function.'
    },
    'vitamin d': {
      normalRange: '30-100 ng/mL (sufficient)',
      description: 'Essential for bone health, immune function, and overall wellness.',
      factors: 'Sun exposure, diet, supplements, and geographic location affect vitamin D levels.'
    }
  };

  return fallbackInfo[medicalTerm] || {
    description: `${medicalTerm} is an important health parameter that should be interpreted by a healthcare professional.`,
    recommendation: 'Consult your doctor or healthcare provider for personalized medical advice.'
  };
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
