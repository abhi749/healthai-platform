export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { sessionToken, healthParameters, userProfile } = await request.json();
    
    if (!sessionToken) {
      throw new Error('Session token required');
    }

    if (!healthParameters || healthParameters.length === 0) {
      throw new Error('Health parameters required for risk assessment');
    }

    console.log('Starting risk assessment for', healthParameters.length, 'parameters');

    // Verify session
    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid session token');
    }

    // Get user's historical data for context
    const historicalData = await getHistoricalHealthData(sessionToken, env);
    
    // Calculate comprehensive risk scores
    const riskAssessment = await calculateHealthRisks(healthParameters, historicalData, userProfile, env);
    
    // Generate personalized recommendations
    const recommendations = await generatePersonalizedRecommendations(riskAssessment, healthParameters, userProfile, env);
    
    // Store risk assessment for trend tracking
    await storeRiskAssessment(sessionToken, riskAssessment, env);

    return new Response(JSON.stringify({
      success: true,
      riskAssessment: riskAssessment,
      recommendations: recommendations,
      timestamp: new Date().toISOString(),
      parametersAnalyzed: healthParameters.length,
      historicalDataPoints: historicalData.length
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Risk assessment error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Calculate comprehensive health risks
async function calculateHealthRisks(healthParameters, historicalData, userProfile, env) {
  const riskScores = {
    cardiovascular: 0,
    metabolic: 0,
    inflammatory: 0,
    nutritional: 0,
    overall: 0
  };

  const riskFactors = [];
  const protectiveFactors = [];

  // Analyze each health parameter for risk
  for (const param of healthParameters) {
    const parameterRisk = assessParameterRisk(param, userProfile);
    
    // Add to appropriate risk category
    if (parameterRisk.category === 'cardiovascular') {
      riskScores.cardiovascular += parameterRisk.score;
    } else if (parameterRisk.category === 'metabolic') {
      riskScores.metabolic += parameterRisk.score;
    } else if (parameterRisk.category === 'inflammatory') {
      riskScores.inflammatory += parameterRisk.score;
    } else if (parameterRisk.category === 'nutritional') {
      riskScores.nutritional += parameterRisk.score;
    }

    // Collect risk and protective factors
    if (parameterRisk.riskLevel === 'high' || parameterRisk.riskLevel === 'moderate') {
      riskFactors.push(parameterRisk);
    } else if (parameterRisk.riskLevel === 'optimal') {
      protectiveFactors.push(parameterRisk);
    }
  }

  // Normalize scores (0-100 scale)
  const parameterCount = healthParameters.length;
  if (parameterCount > 0) {
    riskScores.cardiovascular = Math.min(100, (riskScores.cardiovascular / parameterCount) * 20);
    riskScores.metabolic = Math.min(100, (riskScores.metabolic / parameterCount) * 20);
    riskScores.inflammatory = Math.min(100, (riskScores.inflammatory / parameterCount) * 20);
    riskScores.nutritional = Math.min(100, (riskScores.nutritional / parameterCount) * 20);
  }

  // Calculate overall risk score
  riskScores.overall = Math.round(
    (riskScores.cardiovascular + riskScores.metabolic + riskScores.inflammatory + riskScores.nutritional) / 4
  );

  // Assess trends if historical data available
  const trends = analyzeTrends(healthParameters, historicalData);

  // Generate AI-powered risk insights
  const aiInsights = await generateRiskInsights(riskScores, riskFactors, protectiveFactors, trends, env);

  return {
    scores: riskScores,
    riskFactors: riskFactors,
    protectiveFactors: protectiveFactors,
    trends: trends,
    overallRiskLevel: determineRiskLevel(riskScores.overall),
    insights: aiInsights,
    assessmentDate: new Date().toISOString()
  };
}

// Assess individual parameter risk
function assessParameterRisk(parameter, userProfile) {
  const paramName = parameter.parameter?.toLowerCase() || parameter.name?.toLowerCase() || '';
  const value = parseFloat(parameter.value) || 0;
  const unit = parameter.unit || '';

  // Age and gender adjustments
  const age = userProfile?.age || 40;
  const gender = userProfile?.gender?.toLowerCase() || 'unknown';

  if (paramName.includes('cholesterol total')) {
    return assessCholesterolRisk(value, age, gender);
  } else if (paramName.includes('hdl')) {
    return assessHDLRisk(value, gender);
  } else if (paramName.includes('ldl')) {
    return assessLDLRisk(value, age);
  } else if (paramName.includes('triglycerides')) {
    return assessTriglyceridesRisk(value);
  } else if (paramName.includes('glucose') || paramName.includes('blood sugar')) {
    return assessGlucoseRisk(value);
  } else if (paramName.includes('hemoglobin a1c') || paramName.includes('hba1c')) {
    return assessA1CRisk(value);
  } else if (paramName.includes('blood pressure')) {
    return assessBloodPressureRisk(parameter.value);
  } else if (paramName.includes('crp') || paramName.includes('c-reactive protein')) {
    return assessCRPRisk(value);
  } else if (paramName.includes('vitamin d')) {
    return assessVitaminDRisk(value);
  } else {
    // Generic assessment for unknown parameters
    return {
      parameter: paramName,
      value: value,
      unit: unit,
      riskLevel: 'unknown',
      score: 0,
      category: 'general',
      message: 'Parameter requires professional interpretation'
    };
  }
}

// Specific risk assessment functions
function assessCholesterolRisk(value, age, gender) {
  let riskLevel, score, message;
  
  if (value < 200) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Desirable cholesterol level - heart healthy range';
  } else if (value < 240) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Borderline high - dietary and lifestyle changes recommended';
  } else {
    riskLevel = 'high';
    score = 5;
    message = 'High cholesterol - significant cardiovascular risk factor';
  }

  return {
    parameter: 'Total Cholesterol',
    value: value,
    unit: 'mg/dL',
    riskLevel: riskLevel,
    score: score,
    category: 'cardiovascular',
    message: message,
    normalRange: '<200 mg/dL'
  };
}

function assessHDLRisk(value, gender) {
  const maleThreshold = 40;
  const femaleThreshold = 50;
  const threshold = gender === 'male' ? maleThreshold : femaleThreshold;
  
  let riskLevel, score, message;
  
  if (value >= 60) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Excellent HDL - protective against heart disease';
  } else if (value >= threshold) {
    riskLevel = 'normal';
    score = 2;
    message = 'Adequate HDL cholesterol level';
  } else {
    riskLevel = 'high';
    score = 4;
    message = 'Low HDL - increased cardiovascular risk';
  }

  return {
    parameter: 'HDL Cholesterol',
    value: value,
    unit: 'mg/dL',
    riskLevel: riskLevel,
    score: score,
    category: 'cardiovascular',
    message: message,
    normalRange: `>${threshold} mg/dL`
  };
}

function assessLDLRisk(value, age) {
  let riskLevel, score, message;
  
  if (value < 100) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Optimal LDL - lowest cardiovascular risk';
  } else if (value < 130) {
    riskLevel = 'normal';
    score = 2;
    message = 'Near optimal LDL cholesterol';
  } else if (value < 160) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Borderline high LDL - lifestyle changes recommended';
  } else {
    riskLevel = 'high';
    score = 5;
    message = 'High LDL - significant heart disease risk factor';
  }

  return {
    parameter: 'LDL Cholesterol',
    value: value,
    unit: 'mg/dL',
    riskLevel: riskLevel,
    score: score,
    category: 'cardiovascular',
    message: message,
    normalRange: '<100 mg/dL'
  };
}

function assessGlucoseRisk(value) {
  let riskLevel, score, message;
  
  if (value < 100) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Normal fasting glucose - good metabolic health';
  } else if (value < 126) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Prediabetic range - lifestyle intervention recommended';
  } else {
    riskLevel = 'high';
    score = 5;
    message = 'Diabetic range - medical evaluation needed';
  }

  return {
    parameter: 'Fasting Glucose',
    value: value,
    unit: 'mg/dL',
    riskLevel: riskLevel,
    score: score,
    category: 'metabolic',
    message: message,
    normalRange: '70-99 mg/dL'
  };
}

function assessA1CRisk(value) {
  let riskLevel, score, message;
  
  if (value < 5.7) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Excellent diabetes control - optimal range';
  } else if (value < 6.5) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Prediabetic range - increased diabetes risk';
  } else {
    riskLevel = 'high';
    score = 5;
    message = 'Diabetic range - medical management required';
  }

  return {
    parameter: 'Hemoglobin A1C',
    value: value,
    unit: '%',
    riskLevel: riskLevel,
    score: score,
    category: 'metabolic',
    message: message,
    normalRange: '<5.7%'
  };
}

function assessCRPRisk(value) {
  let riskLevel, score, message;
  
  if (value < 1.0) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Low inflammation - cardiovascular protective';
  } else if (value < 3.0) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Moderate inflammation - lifestyle modifications beneficial';
  } else {
    riskLevel = 'high';
    score = 4;
    message = 'High inflammation - increased cardiovascular risk';
  }

  return {
    parameter: 'C-Reactive Protein',
    value: value,
    unit: 'mg/L',
    riskLevel: riskLevel,
    score: score,
    category: 'inflammatory',
    message: message,
    normalRange: '<1.0 mg/L'
  };
}

function assessVitaminDRisk(value) {
  let riskLevel, score, message;
  
  if (value >= 30) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Sufficient vitamin D - supports immune and bone health';
  } else if (value >= 20) {
    riskLevel = 'moderate';
    score = 2;
    message = 'Insufficient vitamin D - supplementation may be beneficial';
  } else {
    riskLevel = 'high';
    score = 3;
    message = 'Deficient vitamin D - supplementation recommended';
  }

  return {
    parameter: 'Vitamin D',
    value: value,
    unit: 'ng/mL',
    riskLevel: riskLevel,
    score: score,
    category: 'nutritional',
    message: message,
    normalRange: '30-100 ng/mL'
  };
}

function assessBloodPressureRisk(bpValue) {
  // Parse blood pressure (e.g., "140/90")
  const bpMatch = String(bpValue).match(/(\d+)\/(\d+)/);
  if (!bpMatch) {
    return {
      parameter: 'Blood Pressure',
      value: bpValue,
      riskLevel: 'unknown',
      score: 0,
      category: 'cardiovascular',
      message: 'Blood pressure format not recognized'
    };
  }

  const systolic = parseInt(bpMatch[1]);
  const diastolic = parseInt(bpMatch[2]);
  
  let riskLevel, score, message;
  
  if (systolic < 120 && diastolic < 80) {
    riskLevel = 'optimal';
    score = 1;
    message = 'Normal blood pressure - heart healthy';
  } else if (systolic < 130 && diastolic < 80) {
    riskLevel = 'normal';
    score = 2;
    message = 'Elevated blood pressure - monitor closely';
  } else if (systolic < 140 || diastolic < 90) {
    riskLevel = 'moderate';
    score = 3;
    message = 'Stage 1 hypertension - lifestyle changes needed';
  } else {
    riskLevel = 'high';
    score = 5;
    message = 'Stage 2 hypertension - medical treatment indicated';
  }

  return {
    parameter: 'Blood Pressure',
    value: `${systolic}/${diastolic}`,
    unit: 'mmHg',
    riskLevel: riskLevel,
    score: score,
    category: 'cardiovascular',
    message: message,
    normalRange: '<120/80 mmHg'
  };
}

// Generate AI-powered risk insights
async function generateRiskInsights(riskScores, riskFactors, protectiveFactors, trends, env) {
  const prompt = `Analyze this health risk assessment and provide insights:

Risk Scores:
- Cardiovascular: ${riskScores.cardiovascular}/100
- Metabolic: ${riskScores.metabolic}/100  
- Inflammatory: ${riskScores.inflammatory}/100
- Nutritional: ${riskScores.nutritional}/100
- Overall: ${riskScores.overall}/100

High Risk Factors: ${riskFactors.length}
Protective Factors: ${protectiveFactors.length}

Provide:
1. Overall health risk assessment
2. Key areas of concern 
3. Positive health indicators
4. Risk mitigation strategies
5. When to consult healthcare provider

Keep response under 250 words, professional but encouraging tone.`;

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 350,
      temperature: 0.7
    });

    return aiResponse.response || 'Risk assessment complete. Consult healthcare provider for interpretation.';
  } catch (error) {
    console.error('AI insights error:', error);
    return 'Risk assessment complete. Consult healthcare provider for professional interpretation.';
  }
}

// Helper functions
function determineRiskLevel(overallScore) {
  if (overallScore <= 25) return 'low';
  if (overallScore <= 50) return 'moderate';
  if (overallScore <= 75) return 'high';
  return 'very_high';
}

function analyzeTrends(currentParams, historicalData) {
  // Placeholder for trend analysis - would implement actual trend calculations
  return {
    improving: [],
    stable: [],
    worsening: [],
    dataPoints: historicalData.length
  };
}

async function getHistoricalHealthData(sessionToken, env) {
  try {
    const results = await env.DB.prepare(`
      SELECT parameter_name, parameter_value, test_date
      FROM health_parameters
      WHERE session_token = ?
      ORDER BY test_date DESC
      LIMIT 50
    `).bind(sessionToken).all();
    
    return results.results || [];
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return [];
  }
}

async function generatePersonalizedRecommendations(riskAssessment, healthParameters, userProfile, env) {
  // This would generate specific recommendations based on risk factors
  return {
    immediate: ["Continue current health management"],
    shortTerm: ["Schedule regular checkups"], 
    longTerm: ["Maintain healthy lifestyle"]
  };
}

async function storeRiskAssessment(sessionToken, riskAssessment, env) {
  // Store risk assessment for historical tracking
  try {
    await env.DB.prepare(`
      INSERT INTO processing_logs (
        log_id, session_token, analysis_type, created_at
      ) VALUES (?, ?, 'risk_assessment', ?)
    `).bind(
      'risk_' + Date.now(),
      sessionToken,
      new Date().toISOString()
    ).run();
  } catch (error) {
    console.error('Error storing risk assessment:', error);
  }
}

async function verifySessionToken(sessionToken, env) {
  return await env.DB.prepare(`
    SELECT * FROM anonymous_sessions 
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(sessionToken).first();
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
