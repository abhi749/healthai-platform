export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    console.log('=== STARTING DATABASE SETUP V2 ===');
    
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

    // Create documents table
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

    // FIXED: Create health_parameters table with ALL required columns
    console.log('Creating health_parameters table with all required columns...');
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS health_parameters (
        parameter_id TEXT PRIMARY KEY,
        session_token TEXT NOT NULL,
        document_id TEXT NOT NULL,
        parameter_name TEXT NOT NULL,
        parameter_value TEXT,
        parameter_unit TEXT,
        reference_range TEXT,
        status TEXT DEFAULT 'Normal',
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

    // NEW: Add missing columns to existing tables if they don't exist
    console.log('Adding missing columns to existing tables...');
    
    try {
      // Try to add status column to health_parameters if it doesn't exist
      await env.DB.prepare(`
        ALTER TABLE health_parameters ADD COLUMN status TEXT DEFAULT 'Normal'
      `).run();
      console.log('Added status column to health_parameters');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.warn('Could not add status column:', error.message);
      }
    }

    try {
      // Try to add category column to health_parameters if it doesn't exist
      await env.DB.prepare(`
        ALTER TABLE health_parameters ADD COLUMN category TEXT DEFAULT 'General'
      `).run();
      console.log('Added category column to health_parameters');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.warn('Could not add category column:', error.message);
      }
    }

    try {
      // Try to add test_date column to health_parameters if it doesn't exist
      await env.DB.prepare(`
        ALTER TABLE health_parameters ADD COLUMN test_date TEXT
      `).run();
      console.log('Added test_date column to health_parameters');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.warn('Could not add test_date column:', error.message);
      }
    }

    try {
      // Try to add numeric_value column to health_parameters if it doesn't exist
      await env.DB.prepare(`
        ALTER TABLE health_parameters ADD COLUMN numeric_value REAL
      `).run();
      console.log('Added numeric_value column to health_parameters');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.warn('Could not add numeric_value column:', error.message);
      }
    }

    // Verify tables and their columns
    console.log('Verifying table structure...');
    const tablesResult = await env.DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();

    const tableNames = tablesResult.results.map(row => row.name);
    console.log('Tables created:', tableNames);

    // Get health_parameters table structure
    const healthParamsStructure = await env.DB.prepare(`
      PRAGMA table_info(health_parameters)
    `).all();

    const columnNames = healthParamsStructure.results.map(col => col.name);
    console.log('health_parameters columns:', columnNames);

    // Check if all required tables exist
    const requiredTables = [
      'anonymous_sessions',
      'device_access', 
      'documents',
      'health_parameters',
      'processing_logs',
      'analysis_cache'
    ];

    const requiredColumns = [
      'parameter_id', 'session_token', 'document_id', 'parameter_name',
      'parameter_value', 'parameter_unit', 'reference_range', 'status',
      'category', 'test_date', 'numeric_value', 'created_at'
    ];

    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns in health_parameters: ${missingColumns.join(', ')}`);
    }

    console.log('=== DATABASE SETUP V2 COMPLETED SUCCESSFULLY ===');

    return new Response(JSON.stringify({
      success: true,
      message: 'Database tables and columns updated successfully',
      tablesCreated: tableNames.length,
      tables: tableNames,
      healthParametersColumns: columnNames,
      requiredTables: requiredTables,
      requiredColumns: requiredColumns,
      allTablesPresent: true,
      allColumnsPresent: true,
      version: 'v2.0',
      timestamp: new Date().toISOString(),
      details: {
        totalTables: tableNames.length,
        expectedTables: requiredTables.length,
        tablesList: tableNames,
        healthParamsColumnCount: columnNames.length,
        expectedColumns: requiredColumns.length
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('=== DATABASE SETUP V2 FAILED ===');
    console.error('Error details:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.cause ? error.cause.message : 'Database setup v2 failed',
      version: 'v2.0',
      timestamp: new Date().toISOString(),
      troubleshooting: {
        commonCauses: [
          'Column already exists (this is usually OK)',
          'Table structure conflicts',
          'D1 database permissions issues',
          'SQLite constraint violations'
        ],
        solutions: [
          'Check if columns already exist (safe to ignore duplicate warnings)',
          'Verify table structure manually',
          'Clear D1 database and recreate if needed',
          'Check Cloudflare D1 dashboard for errors'
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
