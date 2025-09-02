export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // Drop existing tables to start clean
    try {
      await env.DB.prepare(`DROP TABLE IF EXISTS health_documents`).run();
      await env.DB.prepare(`DROP TABLE IF EXISTS health_parameters`).run();
    } catch (e) {
      console.log('Tables did not exist, continuing...');
    }

    // Create health_documents table
    await env.DB.prepare(`
      CREATE TABLE health_documents (
        document_id TEXT PRIMARY KEY,
        session_token TEXT NOT NULL,
        document_name TEXT NOT NULL,
        document_type TEXT,
        test_date TEXT,
        parameters_json TEXT,
        analysis_result TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        parameter_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
      )
    `).run();

    // Create health_parameters table
    await env.DB.prepare(`
      CREATE TABLE health_parameters (
        parameter_id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        session_token TEXT NOT NULL,
        parameter_name TEXT NOT NULL,
        parameter_value REAL,
        parameter_unit TEXT,
        reference_range TEXT,
        test_date TEXT,
        category TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    // Create indexes
    await env.DB.prepare(`
      CREATE INDEX idx_health_docs_session 
      ON health_documents(session_token, test_date)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX idx_health_params_session_name 
      ON health_parameters(session_token, parameter_name, test_date)
    `).run();

    // Count total tables
    const tablesCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).first();

    return new Response(JSON.stringify({
      success: true,
      message: 'Database tables created successfully',
      tablesCreated: tablesCount.count,
      newTablesAdded: ['health_documents', 'health_parameters'],
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('Database setup error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.cause ? error.cause.message : 'Unknown database error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}
