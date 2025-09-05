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

// ENHANCED: Store health document with smart test date handling
async function storeHealthDocument(data, session, env, corsHeaders) {
  const { documentName, extractedParameters, analysisResult, documentType, testDate } = data;
  
  console.log('=== STORING HEALTH DOCUMENT ===');
  console.log('Document name:', documentName);
  console.log('Test date provided:', testDate);
  console.log('Parameters count:', extractedParameters?.length || 0);
  
  if (!documentName || !extractedParameters) {
    throw new Error('Document name and extracted parameters required');
  }

  // Generate document ID
  const documentId = generateDocumentId();
  const currentTime = new Date().toISOString();
  
  // ENHANCED: Smart test date extraction and validation
  let finalTestDate = testDate;
  
  // Try to extract test date from the first parameter if not provided
  if (!finalTestDate && Array.isArray(extractedParameters) && extractedParameters.length > 0) {
    for (const param of extractedParameters) {
      if (param.date && param.date !== 'null' && param.date !== '') {
        finalTestDate = param.date;
        console.log('Using test date from parameter:', finalTestDate);
        break;
      }
    }
  }
  
  // Apply smart date normalization (including month-middle assumption)
  finalTestDate = smartNormalizeTestDate(finalTestDate);
  
  console.log('Final test date to be used:', finalTestDate);

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
      finalTestDate, // Use the smartly validated test date
      JSON.stringify(extractedParameters),
      analysisResult || '',
      currentTime,
      Array.isArray(extractedParameters) ? extractedParameters.length : 0,
      'active'
    ).run();

    console.log('Document stored with ID:', documentId);
    console.log('Document test_date stored as:', finalTestDate);

    // Store individual parameters for detailed records
    if (Array.isArray(extractedParameters)) {
      for (const param of extractedParameters) {
        await storeHealthParameter(documentId, param, session
