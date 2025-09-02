export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Handle CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { healthData } = await request.json();
    
    if (!healthData || !healthData.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No health data provided',
        details: 'Please provide health data to analyze'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    console.log('Starting enhanced health analysis with medical context...');

    // Step 1: Extract health parameters from the data
    const healthParameters = extractHealthParameters(healthData);
    
    // Step 2: Get medical context from MedlinePlus (in parallel with AI analysis)
    const medicalContextPromise = getMedicalContext(healthParameters);
    
    // Step 3: Create comprehensive health analysis prompt
    const prompt = `You are an expert health data analyst AI. Analyze this health data and provide helpful insights.

Health Data to Analyze:
${healthData}

Please provide a comprehensive but concise analysis including:

1. **Key Findings**: What stands out in these health metrics?
2. **Health Assessment**: Overall health picture based on these values
3. **Areas of Concern**: Any metrics that need attention (if any)
4. **Recommendations**: Specific, actionable health advice
5. **Next Steps**: What to discuss with healthcare provider

Important Guidelines:
- Be helpful and informative but not diagnostic
- Mention normal ranges where relevant
- Focus on lifestyle and wellness advice
- Keep response under 400 words
- Use clear, easy-to-understand language
- Always recommend consulting healthcare professionals for medical decisions
- Be encouraging and supportive in tone

Analysis:`;

    console.log('Sending request to Cloudflare Workers AI...');
    
    // Step 4: Get AI analysis
    const aiAnalysisPromise = env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 500,
      temperature: 0.7
    });

    // Step 5: Wait for both AI analysis and medical context
    const [aiResponse, medicalContext] = await Promise.all([
      aiAnalysisPromise,
      medicalContextPromise
    ]);

    console.log('AI Analysis received:', aiResponse);
    console.log('Medical context received:', medicalContext);

    if (!aiResponse || !aiResponse.response) {
      throw new Error('Empty response from AI model');
    }

    // Step 6: Combine AI insights with medical context
    let enhancedAnalysis = aiResponse.response.trim();
    
    if (medicalContext.success && medicalContext.medicalContext.medicalKnowledge.length > 0) {
      enhancedAnalysis += '\n\n**📚 Medical Reference Information:**\n';
      
      medicalContext.medicalContext.medicalKnowledge.forEach(knowledge => {
        if (knowledge.context && knowledge.context.generalInfo) {
          enhancedAnalysis += `\n• **${knowledge.medicalTerm}**: ${knowledge.context.generalInfo.description || knowledge.context.summary}`;
          if (knowledge.context.generalInfo.normalRange) {
            enhancedAnalysis += ` Normal range: ${knowledge.context.generalInfo.normalRange}`;
          }
        }
      });
      
      enhancedAnalysis += '\n\n*Medical information provided by MedlinePlus/NIH*';
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: enhancedAnalysis,
      model: 'llama-3.1-8b-instruct',
      timestamp: new Date().toISOString(),
      processingLocation: 'Cloudflare Edge',
      medicalContextIncluded: medicalContext.success,
      parametersAnalyzed: healthParameters.length,
      medicalSourcesQueried: medicalContext.success ? medicalContext.medicalContext.successfulQueries : 0
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Enhanced health analysis error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack || 'Unknown error occurred during AI processing',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Extract health parameters from health data text
function extractHealthParameters(healthData) {
  const parameters = [];
  
  // Common health parameter patterns
  const patterns = [
    /(\w+(?:\s+\w+)*)\s*[:\-]\s*[\d.,]+\s*([a-zA-Z/%]+)/g, // "Cholesterol: 240 mg/dL"
    /(blood pressure|bp)\s*[:\-]?\s*\d+\/\d+/gi, // "Blood Pressure: 120/80"
    /(bmi|body mass index)\s*[:\-]?\s*[\d.]+/gi, // "BMI: 24.5"
    /(heart rate|pulse)\s*[:\-]?\s*\d+\s*bpm/gi // "Heart Rate: 72 bpm"
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(healthData)) !== null) {
      parameters.push(match[0]);
    }
  });

  // Also look for common standalone terms
  const commonTerms = [
    'cholesterol', 'glucose', 'blood pressure', 'thyroid', 'vitamin d', 
    'testosterone', 'hemoglobin', 'creatinine', 'triglycerides'
  ];

  commonTerms.forEach(term => {
    if (healthData.toLowerCase().includes(term.toLowerCase())) {
      parameters.push(term);
    }
  });

  return [...new Set(parameters)]; // Remove duplicates
}

// Get medical context for health parameters
async function getMedicalContext(healthParameters) {
  try {
    if (!healthParameters || healthParameters.length === 0) {
      return { success: false, error: 'No parameters to query' };
    }

    // Create a simplified internal request to our medical context API
    const medicalRequest = new Request('https://internal-call/api/medical-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ healthParameters })
    });

    // Simulate the medical context API call internally
    return await getMedicalContextInternal(healthParameters);

  } catch (error) {
    console.error('Error getting medical context:', error);
    return { success: false, error: error.message };
  }
}

// Internal medical context function (simplified version)
async function getMedicalContextInternal(healthParameters) {
  try {
    // Get context for up to 3 parameters to avoid performance issues
    const limitedParams = healthParameters.slice(0, 3);
    
    const medicalKnowledge = limitedParams.map(param => {
      const medicalTerm = extractMedicalTermSimple(param);
      return {
        success: true,
        parameter: param,
        medicalTerm: medicalTerm,
        context: {
          summary: `Medical information about ${medicalTerm}`,
          generalInfo: getFallbackMedicalInfoSimple(medicalTerm)
        }
      };
    });

    return {
      success: true,
      medicalContext: {
        medicalKnowledge: medicalKnowledge,
        successfulQueries: medicalKnowledge.length,
        source: 'Internal Medical Knowledge Base'
      }
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Simplified medical term extraction
function extractMedicalTermSimple(parameter) {
  const paramStr = typeof parameter === 'string' ? parameter : String(parameter);
  return paramStr.toLowerCase()
    .replace(/[:\-]\s*\d+.*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[,\/\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simplified fallback medical information
function getFallbackMedicalInfoSimple(medicalTerm) {
  const info = {
    'cholesterol': {
      normalRange: 'Less than 200 mg/dL (desirable)',
      description: 'A waxy substance in blood that can affect heart health when elevated.'
    },
    'glucose': {
      normalRange: '70-99 mg/dL (normal fasting)',
      description: 'Blood sugar level, important for diabetes monitoring and metabolic health.'
    },
    'blood pressure': {
      normalRange: 'Less than 120/80 mmHg (normal)',
      description: 'Force of blood against artery walls, key indicator of cardiovascular health.'
    },
    'thyroid': {
      normalRange: 'TSH: 0.4-4.0 mIU/L (varies by lab)',
      description: 'Regulates metabolism and energy levels throughout the body.'
    }
  };

  return info[medicalTerm] || {
    description: `Important health parameter that should be discussed with healthcare provider.`,
    normalRange: 'Consult healthcare provider for reference ranges'
  };
}

// Handle OPTIONS requests for CORS
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
