export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // Create tables one by one with individual statements
    
    // Create anonymous_sessions table
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
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_hash 
      ON anonymous_sessions(user_email_hash)
    `).run();

    // Create device_access table
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
    await env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_device_access 
      ON device_access(user_email_hash, device_fingerprint)
    `).run();

    // Create processing_logs table
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
    const tablesCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).first();

    return new Response(JSON.stringify({
      success: true,
      message: 'Database tables created successfully',
      tablesCreated: tablesCount.count,
      tables: [
        'anonymous_sessions',
        'device_access', 
        'processing_logs',
        'analysis_cache',
        'health_documents',
        'health_parameters'
      ],
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
