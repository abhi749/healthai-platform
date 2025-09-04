export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  try {
    const { action, sessionToken, ...data } = await request.json();
    
    console.log('Documents API called:', action, 'Session token provided:', !!sessionToken);
    
    // Verify session token
    if (!sessionToken) {
      throw new Error('Session token required');
    }

    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid or expired session token');
    }

    console.log('Session verified for user:', session.user_email_hash);

    switch (action) {
      case 'store':
        return await storeHealthDocument(data, session, env, corsHeaders);
      case 'list':
        return await listUserDocuments(session, env, corsHeaders);
      case 'analyze-trends':
        return await analyzeTrends(data, session, env, corsHeaders);
      case 'delete':
        return await deleteDocument(data, session, env, corsHeaders);
      default:
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error) {
    console.error('Document management error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Store health document with extracted parameters
async function storeHealthDocument(data, session, env, corsHeaders) {
  const { documentName, extractedParameters, analysisResult, documentType, testDate } = data;
  
  console.log('Storing document:', documentName, 'Parameters:', extractedParameters?.length || 0);
  
  if (!documentName || !extractedParameters) {
    throw new Error('Document name and extracted parameters required');
  }

  // Generate document ID
  const documentId = generateDocumentId();
  const currentTime = new Date().toISOString();
  
  try {
    // Store document metadata in D1
    const insertResult = await env.DB.prepare(`
      INSERT INTO health_documents (
        document_id, session_token, document_name, document_type,
        test_date, parameters_json, analysis_result, created_at,
        parameter_count, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      documentId,
      session.session_token,
      documentName,
      documentType || 'Health Report',
      testDate || new Date().toISOString().split('T')[0],
      JSON.stringify(extractedParameters),
      analysisResult || '',
      currentTime,
      Array.isArray(extractedParameters) ? extractedParameters.length : 0,
      'active'
    ).run();

    console.log('Document stored with ID:', documentId, 'Insert result:', insertResult);

    // Store individual parameters for detailed records
    if (Array.isArray(extractedParameters)) {
      for (const param of extractedParameters) {
        await storeHealthParameter(documentId, param, session.session_token, testDate, env);
      }
      console.log('Stored', extractedParameters.length, 'individual parameters');
    }

    // Update document count in session
    await env.DB.prepare(`
      UPDATE anonymous_sessions 
      SET document_count = document_count + 1, last_activity = ?
      WHERE session_token = ?
    `).bind(currentTime, session.session_token).run();

    console.log('Document storage complete');

    return new Response(JSON.stringify({
      success: true,
      documentId: documentId,
      message: 'Document stored successfully',
      parametersStored: Array.isArray(extractedParameters) ? extractedParameters.length : 0,
      timestamp: currentTime
    }), {
      headers: corsHeaders
    });

  } catch (dbError) {
    console.error('Database error storing document:', dbError);
    throw new Error(`Failed to store document: ${dbError.message}`);
  }
}

// Store individual health parameter for detailed records
async function storeHealthParameter(documentId, parameter, sessionToken, testDate, env) {
  try {
    const paramValue = extractNumericValue(parameter.value || parameter.parameter);
    const currentTime = new Date().toISOString();
    
    await env.DB.prepare(`
      INSERT INTO health_parameters (
        parameter_id, document_id, session_token, parameter_name,
        parameter_value, parameter_unit, reference_range, test_date,
        category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateParameterId(),
      documentId,
      sessionToken,
      parameter.parameter || parameter.name || 'Unknown Parameter',
      paramValue,
      parameter.unit || '',
      parameter.referenceRange || parameter.reference_range || '',
      testDate || new Date().toISOString().split('T')[0],
      parameter.category || 'General',
      currentTime
    ).run();
    
  } catch (error) {
    console.error('Error storing parameter:', parameter, error);
    // Don't throw - continue with other parameters
  }
}

// List user's documents with detailed health records
async function listUserDocuments(session, env, corsHeaders) {
  console.log('Loading documents for session:', session.session_token);
  
  try {
    // Get documents
    const documentsResult = await env.DB.prepare(`
      SELECT document_id, document_name, document_type, test_date,
             parameter_count, created_at, status, parameters_json
      FROM health_documents 
      WHERE session_token = ? AND status = 'active'
      ORDER BY test_date DESC, created_at DESC
    `).bind(session.session_token).all();

    console.log('Found', documentsResult.results?.length || 0, 'documents');

    // Get all health parameters for detailed records
    const parametersResult = await env.DB.prepare(`
      SELECT p.parameter_name, p.parameter_value, p.parameter_unit, 
             p.reference_range, p.test_date, p.category, p.created_at,
             d.document_name, d.document_id, d.document_type
      FROM health_parameters p
      JOIN health_documents d ON p.document_id = d.document_id
      WHERE p.session_token = ? AND d.status = 'active'
      ORDER BY p.test_date DESC, p.created_at DESC
    `).bind(session.session_token).all();

    console.log('Found', parametersResult.results?.length || 0, 'health parameters');

    // Format health records for the frontend
    const healthRecords = (parametersResult.results || []).map(param => ({
      testDate: param.test_date,
      uploadDate: param.created_at,
      parameterName: param.parameter_name,
      value: param.parameter_value,
      unit: param.parameter_unit,
      referenceRange: param.reference_range || 'Not specified',
      status: determineParameterStatus(param.parameter_value, param.reference_range, param.parameter_name),
      category: param.category,
      documentName: param.document_name,
      documentId: param.document_id,
      documentType: param.document_type
    }));

    return new Response(JSON.stringify({
      success: true,
      documents: documentsResult.results || [],
      healthRecords: healthRecords,
      totalDocuments: documentsResult.results?.length || 0,
      totalParameters: parametersResult.results?.length || 0,
      userSession: {
        documentCount: session.document_count || 0,
        memberSince: session.created_at
      }
    }), {
      headers: corsHeaders
    });

  } catch (dbError) {
    console.error('Database error loading documents:', dbError);
    throw new Error(`Failed to load documents: ${dbError.message}`);
  }
}

// Analyze health trends across documents
async function analyzeTrends(data, session, env, corsHeaders) {
  const { parameters, timeRange = '1year' } = data;
  
  console.log('Analyzing trends for time range:', timeRange);
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  switch (timeRange) {
    case '3months':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6months':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case '2years':
      startDate.setFullYear(startDate.getFullYear() - 2);
      break;
  }

  try {
    // Get trend data for specified parameters
    let trendData = [];
    
    if (parameters && parameters.length > 0) {
      // Specific parameters requested
      for (const paramName of parameters) {
        const paramData = await getParameterTrend(paramName, session.session_token, startDate, endDate, env);
        if (paramData.length > 0) {
          trendData.push({
            parameter: paramName,
            data: paramData,
            trend: calculateTrend(paramData)
          });
        }
      }
    } else {
      // Get all available parameters
      const allParams = await env.DB.prepare(`
        SELECT DISTINCT parameter_name
        FROM health_parameters 
        WHERE session_token = ? AND test_date >= ? AND test_date <= ?
        ORDER BY parameter_name
      `).bind(
        session.session_token,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ).all();

      for (const param of (allParams.results || [])) {
        const paramData = await getParameterTrend(param.parameter_name, session.session_token, startDate, endDate, env);
        if (paramData.length > 1) { // Only include if there are multiple data points
          trendData.push({
            parameter: param.parameter_name,
            data: paramData,
            trend: calculateTrend(paramData)
          });
        }
      }
    }

    // Generate trend analysis using AI
    const trendAnalysis = await generateTrendAnalysis(trendData, env);

    return new Response(JSON.stringify({
      success: true,
      timeRange: timeRange,
      trendsFound: trendData.length,
      trendData: trendData,
      analysis: trendAnalysis,
      generatedAt: new Date().toISOString()
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Trend analysis error:', error);
    throw new Error(`Trend analysis failed: ${error.message}`);
  }
}

// Get parameter trend data
async function getParameterTrend(parameterName, sessionToken, startDate, endDate, env) {
  const results = await env.DB.prepare(`
    SELECT parameter_value, parameter_unit, test_date, reference_range
    FROM health_parameters 
    WHERE session_token = ? AND parameter_name LIKE ? 
    AND test_date >= ? AND test_date <= ?
    AND parameter_value IS NOT NULL
    ORDER BY test_date ASC
  `).bind(
    sessionToken,
    `%${parameterName}%`,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ).all();

  return (results.results || []).map(row => ({
    value: parseFloat(row.parameter_value) || 0,
    unit: row.parameter_unit,
    date: row.test_date,
    referenceRange: row.reference_range
  }));
}

// Calculate trend (improving, stable, declining)
function calculateTrend(data) {
  if (data.length < 2) return 'insufficient_data';

  const values = data.map(d => d.value);
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const percentChange = ((lastValue - firstValue) / firstValue) * 100;

  // Calculate if trend is significant (>5% change)
  if (Math.abs(percentChange) < 5) return 'stable';
  
  return percentChange > 0 ? 'increasing' : 'decreasing';
}

// Generate AI-powered trend analysis
async function generateTrendAnalysis(trendData, env) {
  if (trendData.length === 0) {
    return 'No trend data available for analysis. Upload more documents over time to see health parameter trends.';
  }

  const trendSummary = trendData.map(trend => {
    const latestValue = trend.data[trend.data.length - 1];
    const oldestValue = trend.data[0];
    return `${trend.parameter}: ${oldestValue.value} → ${latestValue.value} ${latestValue.unit} (${trend.trend})`;
  }).join('\n');

  const prompt = `Analyze these health parameter trends and provide insights:

${trendSummary}

Please provide:
1. Overall health trend assessment
2. Notable improvements or concerns
3. Recommendations for maintaining/improving trends
4. Suggestions for discussion with healthcare provider

Keep response concise (under 300 words) and encouraging.`;

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 400,
      temperature: 0.7
    });

    return aiResponse.response || 'Trend analysis unavailable. Please consult your healthcare provider for interpretation.';
  } catch (error) {
    console.error('AI trend analysis error:', error);
    return 'Trend analysis unavailable. Please consult your healthcare provider for interpretation.';
  }
}

// Delete document
async function deleteDocument(data, session, env, corsHeaders) {
  const { documentId } = data;
  
  if (!documentId) {
    throw new Error('Document ID required');
  }

  console.log('Deleting document:', documentId);

  try {
    // Verify document belongs to user
    const document = await env.DB.prepare(`
      SELECT document_id FROM health_documents 
      WHERE document_id = ? AND session_token = ?
    `).bind(documentId, session.session_token).first();

    if (!document) {
      throw new Error('Document not found or access denied');
    }

    // Soft delete document
    await env.DB.prepare(`
      UPDATE health_documents 
      SET status = 'deleted', deleted_at = ?
      WHERE document_id = ?
    `).bind(new Date().toISOString(), documentId).run();

    // Update document count
    await env.DB.prepare(`
      UPDATE anonymous_sessions 
      SET document_count = document_count - 1
      WHERE session_token = ?
    `).bind(session.session_token).run();

    console.log('Document deleted successfully');

    return new Response(JSON.stringify({
      success: true,
      message: 'Document deleted successfully'
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Delete document error:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

// Utility functions
async function verifySessionToken(sessionToken, env) {
  try {
    return await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).bind(sessionToken).first();
  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
}

function generateDocumentId() {
  return 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2);
}

function generateParameterId() {
  return 'param_' + Date.now() + '_' + Math.random().toString(36).substring(2);
}

function extractNumericValue(value) {
  if (typeof value === 'number') return value;
  const match = String(value).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function determineParameterStatus(value, referenceRange, parameterName) {
  if (!value || !referenceRange) return 'Unknown';
  
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return 'Unknown';
  
  // Simple status determination
  const param = parameterName?.toLowerCase() || '';
  
  if (param.includes('cholesterol') && referenceRange.includes('<200')) {
    return numValue > 200 ? 'High' : 'Normal';
  }
  if (param.includes('glucose') && referenceRange.includes('70-99')) {
    return numValue > 99 ? 'High' : (numValue < 70 ? 'Low' : 'Normal');
  }
  if (param.includes('hdl') && referenceRange.includes('>40')) {
    return numValue < 40 ? 'Low' : 'Normal';
  }
  
  return 'Normal';
}

// Handle GET requests for listing documents
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionToken = url.searchParams.get('session');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  
  if (!sessionToken) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Session token required' 
    }), { 
      status: 401, 
      headers: corsHeaders 
    });
  }

  try {
    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid session' 
      }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    return await listUserDocuments(session, env, corsHeaders);
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
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
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
