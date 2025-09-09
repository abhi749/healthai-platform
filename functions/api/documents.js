export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== DOCUMENTS API CALLED ===');
    
    const requestData = await request.json();
    const { action, sessionToken } = requestData;

    console.log('Action:', action);
    console.log('Session token provided:', !!sessionToken);

    if (!sessionToken) {
      throw new Error('Session token required');
    }

    // Verify session exists
    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid or expired session');
    }

    console.log('Session verified successfully');

    switch (action) {
      case 'list':
        return await listDocuments(session, env, corsHeaders);
      case 'store':
        return await storeHealthDocument(session, requestData, env, corsHeaders);
      case 'delete':
        return await deleteDocument(session, requestData, env, corsHeaders);
      case 'healthRecords':
        return await getHealthRecords(session, env, corsHeaders);
      default:
        throw new Error(`Invalid action: ${action}`);
    }

  } catch (error) {
    console.error('Documents API Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: `Documents API failed: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionToken = url.searchParams.get('sessionToken');
  const action = url.searchParams.get('action') || 'list';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== DOCUMENTS GET API CALLED ===');
    console.log('Action:', action);
    console.log('Session token provided:', !!sessionToken);

    if (!sessionToken) {
      throw new Error('Session token required in query parameters');
    }

    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid or expired session');
    }

    if (action === 'healthRecords') {
      return await getHealthRecords(session, env, corsHeaders);
    } else {
      return await listDocuments(session, env, corsHeaders);
    }

  } catch (error) {
    console.error('Documents GET API Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: `Documents GET API failed: ${error.message}`,
      timestamp: new Date().toISOString()
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// Get health records from database
async function getHealthRecords(session, env, corsHeaders) {
  console.log('=== GETTING HEALTH RECORDS ===');
  
  try {
    // Get all health parameters for this session
    const healthRecordsQuery = `
      SELECT 
        hp.*,
        d.file_name,
        d.document_type,
        d.created_at as upload_date
      FROM health_parameters hp
      LEFT JOIN documents d ON hp.document_id = d.document_id
      WHERE hp.session_token = ?
      ORDER BY hp.test_date DESC, hp.created_at DESC
    `;

    console.log('Executing health records query...');
    const healthRecords = await env.DB.prepare(healthRecordsQuery)
      .bind(session.session_token)
      .all();

    console.log(`Found ${healthRecords.results?.length || 0} health record entries`);

    return new Response(JSON.stringify({
      success: true,
      healthRecords: healthRecords.results || [],
      totalRecords: healthRecords.results?.length || 0,
      sessionToken: session.session_token
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error in getHealthRecords:', error);
    throw new Error(`Failed to load health records: ${error.message}`);
  }
}

// Store health document with parameters
async function storeHealthDocument(session, requestData, env, corsHeaders) {
  const { fileName, documentType, extractedData, analysisResults } = requestData;
  
  console.log('=== STORING HEALTH DOCUMENT ===');
  console.log('File name:', fileName);
  console.log('Extracted data received:', !!extractedData);
  
  try {
    // Generate document ID
    const documentId = generateDocumentId();
    
    // Store document metadata
    await env.DB.prepare(`
      INSERT INTO documents (
        document_id, session_token, file_name, document_type, 
        analysis_results, created_at, parameter_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      documentId,
      session.session_token,
      fileName,
      documentType || 'Health Report',
      JSON.stringify(analysisResults || {}),
      new Date().toISOString(),
      extractedData?.healthParameters?.length || 0
    ).run();

    console.log('Document metadata stored with ID:', documentId);

    // Store health parameters if provided
    let storedParametersCount = 0;
    
    if (extractedData && extractedData.healthParameters && Array.isArray(extractedData.healthParameters)) {
      console.log('Processing', extractedData.healthParameters.length, 'health parameters');
      
      for (const param of extractedData.healthParameters) {
        const parameterId = generateParameterId();
        
        // Extract parameter data
        const paramName = param.parameter || param.name || 'Unknown Parameter';
        const paramValue = param.value || '';
        const paramUnit = param.unit || '';
        const paramCategory = param.category || categorizeParameter(paramName);
        const testDate = param.date || extractedData.testDate || new Date().toISOString().split('T')[0];
        const referenceRange = param.referenceRange || param.reference_range || '';
        const status = param.status || 'Normal';
        
        // Extract numeric value for trend analysis
        const numericValue = extractNumericValue(paramValue);
        
        console.log(`Storing parameter: ${paramName} = ${paramValue}`);
        
        await env.DB.prepare(`
          INSERT INTO health_parameters (
            parameter_id, session_token, document_id, parameter_name,
            parameter_value, parameter_unit, reference_range, status,
            category, test_date, numeric_value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          parameterId,
          session.session_token,
          documentId,
          paramName,
          paramValue,
          paramUnit,
          referenceRange,
          status,
          paramCategory,
          testDate,
          numericValue,
          new Date().toISOString()
        ).run();

        storedParametersCount++;
      }
    }

    console.log(`Document stored successfully. ${storedParametersCount} parameters saved.`);

    return new Response(JSON.stringify({
      success: true,
      documentId: documentId,
      parametersStored: storedParametersCount,
      message: `Document "${fileName}" stored with ${storedParametersCount} health parameters`
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error storing document:', error);
    throw new Error(`Failed to store document: ${error.message}`);
  }
}

// List documents for session
async function listDocuments(session, env, corsHeaders) {
  console.log('=== LISTING DOCUMENTS ===');
  
  try {
    const documents = await env.DB.prepare(`
      SELECT * FROM documents 
      WHERE session_token = ? 
      ORDER BY created_at DESC
    `).bind(session.session_token).all();

    console.log(`Found ${documents.results?.length || 0} documents`);

    return new Response(JSON.stringify({
      success: true,
      documents: documents.results || [],
      totalDocuments: documents.results?.length || 0
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error listing documents:', error);
    throw new Error(`Failed to list documents: ${error.message}`);
  }
}

// Delete document
async function deleteDocument(session, requestData, env, corsHeaders) {
  const { documentId } = requestData;
  
  console.log('Deleting document:', documentId);
  
  try {
    // Delete health parameters first (foreign key constraint)
    await env.DB.prepare(`
      DELETE FROM health_parameters WHERE document_id = ? AND session_token = ?
    `).bind(documentId, session.session_token).run();

    // Delete document
    await env.DB.prepare(`
      DELETE FROM documents WHERE document_id = ? AND session_token = ?
    `).bind(documentId, session.session_token).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Document deleted successfully'
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

// Verify session token
async function verifySessionToken(sessionToken, env) {
  try {
    console.log('Verifying session token...');
    const session = await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).bind(sessionToken).first();
    
    console.log('Session verification result:', session ? 'valid' : 'invalid');
    return session;
  } catch (error) {
    console.error('Database error in verifySessionToken:', error);
    throw new Error(`Session verification failed: ${error.message}`);
  }
}

// Utility functions
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

function categorizeParameter(paramName) {
  const name = paramName.toLowerCase();
  
  if (name.includes('cholesterol') || name.includes('hdl') || name.includes('ldl') || name.includes('triglyceride')) {
    return 'Cardiovascular';
  }
  if (name.includes('glucose') || name.includes('a1c') || name.includes('insulin') || name.includes('diabetes')) {
    return 'Metabolic';
  }
  if (name.includes('testosterone') || name.includes('estrogen') || name.includes('thyroid') || name.includes('hormone')) {
    return 'Hormonal';
  }
  if (name.includes('vitamin') || name.includes('b12') || name.includes('d3') || name.includes('iron') || name.includes('folate')) {
    return 'Nutritional';
  }
  if (name.includes('hemoglobin') || name.includes('hematocrit') || name.includes('rbc') || name.includes('wbc')) {
    return 'Hematology';
  }
  
  return 'General';
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
