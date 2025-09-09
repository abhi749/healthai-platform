export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    console.log('=== STARTING DATABASE SETUP ===');
    
    // Create anonymous_sessions table
    console.log('Creating anonymous_sessions table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS anonymous_sessions (
        session_token TEXT PRIMARY KEY,
        user_email_hash TEXT NOT NULL,
        user_salt TEXT NOT NULL,
        answer_hash_1 TEXT NOT NULL,
        answer_hash_2 TEXT NOT NULL,
        answer_hash_3 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_activity TEXT NOT NULL,
        device_fingerprint TEXT,
        document_count INTEGER DEFAULT 0
      )
    `).run();

    // Create unique index for user_email_hash
    console.log('Creating user_email_hash index...');
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_hash 
      ON anonymous_sessions(user_email_hash)
    `).run();

    // Create device_access table
    console.log('Creating device_access table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS device_access (
        access_id TEXT PRIMARY KEY,
        user_email_hash TEXT NOT NULL,
        device_fingerprint TEXT NOT NULL,
        first_access TEXT NOT NULL,
        last_access TEXT NOT NULL,
        access_count INTEGER DEFAULT 1,
        recovery_method TEXT DEFAULT 'security_questions'
      )
    `).run();

    // Create unique index for device access
    console.log('Creating device_access index...');
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_device_access 
      ON device_access(user_email_hash, device_fingerprint)
    `).run();

    // Create documents table (CRITICAL - THIS WAS MISSING)
    console.log('Creating documents table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        session_token TEXT NOT NULL,
        file_name TEXT NOT NULL,
        document_type TEXT DEFAULT 'Health Report',
        analysis_results TEXT,
        created_at TEXT NOT NULL,
        parameter_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
      )
    `).run();

    // Create health_parameters table (CRITICAL - THIS WAS MISSING)
    console.log('Creating health_parameters table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS health_parameters (
        parameter_id TEXT PRIMARY KEY,
        session_token TEXT NOT NULL,
        document_id TEXT NOT NULL,
        parameter_name TEXT NOT NULL,
        parameter_value TEXT,
        parameter_unit TEXT,
        reference_range TEXT,
        status TEXT,
        category TEXT DEFAULT 'General',
        test_date TEXT,
        numeric_value REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(document_id)
      )
    `).run();

    // Create processing_logs table
    console.log('Creating processing_logs table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS processing_logs (
        log_id TEXT PRIMARY KEY,
        session_token TEXT,
        document_hash TEXT,
        processing_duration_ms INTEGER,
        analysis_type TEXT,
        device_type TEXT,
        created_at TEXT NOT NULL,
        purged_at TEXT
      )
    `).run();

    // Create analysis_cache table
    console.log('Creating analysis_cache table...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        cache_key TEXT PRIMARY KEY,
        health_data_hash TEXT,
        analysis_result TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `).run();

    // Verify tables were created by counting them
    console.log('Verifying table creation...');
    const tablesResult = await env.DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    const tableNames = tablesResult.results.map(row => row.name);
    console.log('Tables created:', tableNames);

    // Check if all required tables exist
    const requiredTables = [
      'anonymous_sessions',
      'device_access', 
      'documents',
      'health_parameters',
      'processing_logs',
      'analysis_cache'
    ];

    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    console.log('=== DATABASE SETUP COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({
      success: true,
      message: 'Database tables created successfully',
      tablesCreated: tableNames.length,
      tables: tableNames,
      requiredTables: requiredTables,
      allTablesPresent: true,
      timestamp: new Date().toISOString(),
      details: {
        totalTables: tableNames.length,
        expectedTables: requiredTables.length,
        tablesList: tableNames
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('=== DATABASE SETUP FAILED ===');
    console.error('Error details:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.cause ? error.cause.message : 'Database setup failed',
      timestamp: new Date().toISOString(),
      troubleshooting: {
        commonCauses: [
          'D1 database not properly bound to Workers',
          'Database permissions issues', 
          'SQLite syntax errors',
          'Cloudflare Workers AI binding issues'
        ],
        solutions: [
          'Check wrangler.toml D1 database binding',
          'Verify database_id is correct',
          'Ensure D1 database exists in Cloudflare dashboard',
          'Try recreating the D1 database'
        ]
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
