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
    const requestData = await request.json();
    const { action, sessionToken } = requestData;

    console.log('Documents API called:', action, 'Session token provided:', !!sessionToken);

    if (!sessionToken) {
      throw new Error('Session token required');
    }

    // Verify session
    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid or expired session');
    }

    switch (action) {
      case 'list':
        return await listDocuments(session, env, corsHeaders);
      case 'store':
        return await storeHealthDocument(session, requestData, env, corsHeaders);
      case 'delete':
        return await deleteDocument(session, requestData, env, corsHeaders);
      case 'getHealthRecords':
        return await getEnhancedHealthRecords(session, env, corsHeaders);
      case 'getRecordStats':
        return await getHealthRecordStats(session, env, corsHeaders);
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Documents API Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
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
    console.log('Documents GET API called:', action, 'Session token provided:', !!sessionToken);

    if (!sessionToken) {
      throw new Error('Session token required');
    }

    const session = await verifySessionToken(sessionToken, env);
    if (!session) {
      throw new Error('Invalid or expired session');
    }

    if (action === 'healthRecords') {
      return await getEnhancedHealthRecords(session, env, corsHeaders);
    } else if (action === 'stats') {
      return await getHealthRecordStats(session, env, corsHeaders);
    } else {
      return await listDocuments(session, env, corsHeaders);
    }

  } catch (error) {
    console.error('Documents GET API Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: corsHeaders
    });
  }
}

// ENHANCED: Get comprehensive health records with advanced filtering
async function getEnhancedHealthRecords(session, env, corsHeaders) {
  console.log('=== GETTING ENHANCED HEALTH RECORDS ===');
  
  try {
    // Get all health parameters with document information
    const healthRecordsQuery = `
      SELECT 
        hp.parameter_id,
        hp.parameter_name,
        hp.parameter_value,
        hp.parameter_unit,
        hp.reference_range,
        hp.status,
        hp.category,
        hp.test_date,
        hp.created_at,
        hp.numeric_value,
        d.document_id,
        d.file_name,
        d.document_type,
        d.created_at as upload_date,
        ROW_NUMBER() OVER (PARTITION BY hp.parameter_name ORDER BY hp.test_date DESC) as parameter_rank
      FROM health_parameters hp
      LEFT JOIN documents d ON hp.document_id = d.document_id
      WHERE hp.session_token = ?
      ORDER BY hp.test_date DESC, hp.created_at DESC
    `;

    console.log('Executing enhanced health records query...');
    const healthRecords = await env.DB.prepare(healthRecordsQuery)
      .bind(session.session_token)
      .all();

    console.log(`Found ${healthRecords.results?.length || 0} health record entries`);

    // Group records by parameter for trend analysis
    const parameterGroups = {};
    const documentSummary = {};
    let totalRecords = 0;

    if (healthRecords.results) {
      healthRecords.results.forEach(record => {
        totalRecords++;
        
        // Group by parameter name for trend analysis
        if (!parameterGroups[record.parameter_name]) {
          parameterGroups[record.parameter_name] = [];
        }
        parameterGroups[record.parameter_name].push(record);

        // Track document summary
        if (record.document_id && !documentSummary[record.document_id]) {
          documentSummary[record.document_id] = {
            document_id: record.document_id,
            file_name: record.file_name,
            document_type: record.document_type,
            upload_date: record.upload_date,
            parameter_count: 0
          };
        }
        if (record.document_id) {
          documentSummary[record.document_id].parameter_count++;
        }
      });
    }

    // Calculate parameter statistics
    const parameterStats = Object.keys(parameterGroups).map(paramName => {
      const records = parameterGroups[paramName];
      const numericValues = records
        .map(r => r.numeric_value)
        .filter(v => v !== null && !isNaN(v));
      
      let trend = 'stable';
      if (numericValues.length >= 2) {
        const recent = numericValues[0];
        const previous = numericValues[1];
        const changePercent = ((recent - previous) / previous) * 100;
        if (changePercent > 5) trend = 'increasing';
        else if (changePercent < -5) trend = 'decreasing';
      }

      return {
        parameter_name: paramName,
        total_records: records.length,
        latest_value: records[0].parameter_value,
        latest_date: records[0].test_date,
        trend: trend,
        category: records[0].category,
        numeric_values: numericValues
      };
    });

    console.log(`Processed ${Object.keys(parameterGroups).length} unique parameters`);
    console.log(`Processed ${Object.keys(documentSummary).length} documents`);

    return new Response(JSON.stringify({
      success: true,
      healthRecords: healthRecords.results || [],
      parameterGroups: parameterGroups,
      parameterStats: parameterStats,
      documentSummary: Object.values(documentSummary),
      totalRecords: totalRecords,
      uniqueParameters: Object.keys(parameterGroups).length,
      documentsCount: Object.keys(documentSummary).length
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error in getEnhancedHealthRecords:', error);
    throw error;
  }
}

// Get comprehensive health record statistics
async function getHealthRecordStats(session, env, corsHeaders) {
  console.log('=== GETTING HEALTH RECORD STATS ===');
  
  try {
    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_parameters,
        COUNT(DISTINCT parameter_name) as unique_parameters,
        COUNT(DISTINCT document_id) as total_documents,
        MIN(test_date) as earliest_date,
        MAX(test_date) as latest_date,
        COUNT(DISTINCT category) as categories_count
      FROM health_parameters 
      WHERE session_token = ?
    `;

    const stats = await env.DB.prepare(statsQuery)
      .bind(session.session_token)
      .first();

    // Get category breakdown
    const categoryQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        COUNT(DISTINCT parameter_name) as unique_params
      FROM health_parameters 
      WHERE session_token = ?
      GROUP BY category
      ORDER BY count DESC
    `;

    const categoryStats = await env.DB.prepare(categoryQuery)
      .bind(session.session_token)
      .all();

    // Get recent activity (last 30 days)
    const recentQuery = `
      SELECT 
        DATE(created_at) as upload_date,
        COUNT(*) as parameters_added
      FROM health_parameters 
      WHERE session_token = ? AND created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY upload_date DESC
    `;

    const recentActivity = await env.DB.prepare(recentQuery)
      .bind(session.session_token)
      .all();

    console.log('Stats calculated:', {
      totalParameters: stats?.total_parameters || 0,
      uniqueParameters: stats?.unique_parameters || 0,
      totalDocuments: stats?.total_documents || 0
    });

    return new Response(JSON.stringify({
      success: true,
      stats: stats || {},
      categoryBreakdown: categoryStats.results || [],
      recentActivity: recentActivity.results || [],
      dateRange: {
        earliest: stats?.earliest_date,
        latest: stats?.latest_date
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error in getHealthRecordStats:', error);
    throw error;
  }
}

// Enhanced document storage with better parameter handling
async function storeHealthDocument(session, requestData, env, corsHeaders) {
  const { fileName, documentType, extractedData, analysisResults } = requestData;
  
  console.log('=== STORING HEALTH DOCUMENT ===');
  console.log('Storing document:', fileName);
  console.log('Extracted data received:', extractedData ? 'Yes' : 'No');
  
  try {
    // Generate document ID
    const documentId = generateDocumentId();
    
    // Store document metadata
    await env.DB.prepare(`
      INSERT INTO documents (
        document_id, session_token, file_name, document_type, 
        analysis_results, created_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      documentId,
      session.session_token,
      fileName,
      documentType || 'Health Report',
      JSON.stringify(analysisResults || {}),
    ).run();

    console.log('Document metadata stored with ID:', documentId);

    // Enhanced parameter extraction and storage
    let storedParametersCount = 0;
    
    if (extractedData && extractedData.healthParameters) {
      console.log('Processing', extractedData.healthParameters.length, 'health parameters');
      
      for (const param of extractedData.healthParameters) {
        const parameterId = generateParameterId();
        
        // Enhanced parameter data extraction
        const paramName = param.name || param.parameter || param.parameterName || 'Unknown Parameter';
        const paramValue = param.value || param.parameterValue || '';
        const paramUnit = param.unit || param.units || '';
        const paramCategory = param.category || categorizeParameter(paramName);
        const testDate = param.date || param.test_date || param.testDate || 
                        extractedData.metadata?.testDate || 
                        new Date().toISOString().split('T')[0];
        const referenceRange = param.reference_range || param.referenceRange || 
                              param.normal_range || getDefaultReferenceRange(paramName);
        const status = param.status || determineStatus(paramValue, referenceRange);
        
        // Extract numeric value for trend analysis
        const numericValue = extractNumericValue(paramValue);
        
        console.log(`Storing parameter: ${paramName} = ${paramValue} (${paramCategory}) [${testDate}]`);
        
        await env.DB.prepare(`
          INSERT INTO health_parameters (
            parameter_id, session_token, document_id, parameter_name,
            parameter_value, parameter_unit, reference_range, status,
            category, test_date, numeric_value, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          numericValue
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
    throw error;
  }
}

// Enhanced parameter categorization
function categorizeParameter(paramName) {
  const name = paramName.toLowerCase();
  
  // Cardiovascular markers
  if (name.includes('cholesterol') || name.includes('hdl') || name.includes('ldl') || 
      name.includes('triglyceride') || name.includes('blood pressure') || name.includes('bp')) {
    return 'Cardiovascular';
  }
  
  // Metabolic markers
  if (name.includes('glucose') || name.includes('a1c') || name.includes('insulin') || 
      name.includes('diabetes') || name.includes('bmi') || name.includes('weight')) {
    return 'Metabolic';
  }
  
  // Hormonal markers
  if (name.includes('testosterone') || name.includes('estrogen') || name.includes('thyroid') || 
      name.includes('tsh') || name.includes('t3') || name.includes('t4') || name.includes('cortisol')) {
    return 'Hormonal';
  }
  
  // Nutritional markers
  if (name.includes('vitamin') || name.includes('b12') || name.includes('d3') || 
      name.includes('iron') || name.includes('folate') || name.includes('calcium')) {
    return 'Nutritional';
  }
  
  // Inflammatory markers
  if (name.includes('crp') || name.includes('esr') || name.includes('inflammatory')) {
    return 'Inflammatory';
  }
  
  // Blood work
  if (name.includes('hemoglobin') || name.includes('hematocrit') || name.includes('rbc') || 
      name.includes('wbc') || name.includes('platelet')) {
    return 'Hematology';
  }
  
  // Liver function
  if (name.includes('alt') || name.includes('ast') || name.includes('liver') || 
      name.includes('bilirubin') || name.includes('alkaline')) {
    return 'Liver Function';
  }
  
  // Kidney function
  if (name.includes('creatinine') || name.includes('bun') || name.includes('kidney') || 
      name.includes('urea')) {
    return 'Kidney Function';
  }
  
  return 'General';
}

// Enhanced status determination
function determineStatus(value, referenceRange) {
  if (!value || !referenceRange) return 'Normal';
  
  const numericValue = extractNumericValue(value);
  if (numericValue === null) return 'Normal';
  
  // Parse reference range (e.g., "70-100", "<200", ">5.0")
  const rangeStr = referenceRange.toLowerCase().replace(/[^\d\-<>.]/g, '');
  
  if (rangeStr.includes('-')) {
    const [min, max] = rangeStr.split('-').map(v => parseFloat(v));
    if (!isNaN(min) && !isNaN(max)) {
      if (numericValue < min) return 'Low';
      if (numericValue > max) return 'High';
      return 'Normal';
    }
  }
  
  if (rangeStr.startsWith('<')) {
    const maxValue = parseFloat(rangeStr.substring(1));
    if (!isNaN(maxValue)) {
      return numericValue <= maxValue ? 'Normal' : 'High';
    }
  }
  
  if (rangeStr.startsWith('>')) {
    const minValue = parseFloat(rangeStr.substring(1));
    if (!isNaN(minValue)) {
      return numericValue >= minValue ? 'Normal' : 'Low';
    }
  }
  
  return 'Normal';
}

// Get default reference ranges for common parameters
function getDefaultReferenceRange(paramName) {
  const name = paramName.toLowerCase();
  
  const ranges = {
    'total cholesterol': '<200 mg/dL',
    'hdl cholesterol': '>40 mg/dL (men), >50 mg/dL (women)',
    'ldl cholesterol': '<100 mg/dL',
    'triglycerides': '<150 mg/dL',
    'glucose': '70-99 mg/dL',
    'hemoglobin a1c': '<5.7%',
    'fasting glucose': '70-99 mg/dL',
    'blood pressure': '<120/80 mmHg',
    'bmi': '18.5-24.9',
    'hemoglobin': '13.5-17.5 g/dL (men), 12.0-15.5 g/dL (women)',
    'vitamin d': '30-100 ng/mL',
    'vitamin b12': '200-900 pg/mL',
    'tsh': '0.4-4.0 mIU/L',
    'creatinine': '0.6-1.2 mg/dL'
  };
  
  for (const [key, range] of Object.entries(ranges)) {
    if (name.includes(key)) {
      return range;
    }
  }
  
  return 'Normal range varies';
}

// Other utility functions remain the same...
async function verifySessionToken(sessionToken, env) {
  try {
    console.log('Querying database for session...');
    const session = await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).bind(sessionToken).first();
    
    console.log('Session query result:', session ? 'found' : 'not found');
    return session;
  } catch (error) {
    console.error('Database error in verifySessionToken:', error);
    throw error;
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

// Additional utility functions for document listing and deletion...
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
      documents: documents.results || []
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Error listing documents:', error);
    throw error;
  }
}

async function deleteDocument(session, requestData, env, corsHeaders) {
  const { documentId } = requestData;
  
  console.log('Deleting document:', documentId);
  
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
