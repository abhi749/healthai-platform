export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // Create anonymous_sessions table
    await env.DB.exec(`
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
        document_count INTEGER DEFAULT 0,
        UNIQUE(user_email_hash)
      )
    `);

    // Create device_access table
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS device_access (
        access_id TEXT PRIMARY KEY,
        user_email_hash TEXT NOT NULL,
        device_fingerprint TEXT NOT NULL,
        first_access TEXT NOT NULL,
        last_access TEXT NOT NULL,
        access_count INTEGER DEFAULT 1,
        recovery_method TEXT DEFAULT 'security_questions',
        UNIQUE(user_email_hash, device_fingerprint)
      )
    `);

    // Create processing_logs table
    await env.DB.exec(`
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
    `);

    // Create analysis_cache table
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        cache_key TEXT PRIMARY KEY,
        health_data_hash TEXT,
        analysis_result TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);

    return new Response(JSON.stringify({
      success: true,
      message: 'Database tables created successfully',
      tables: [
        'anonymous_sessions',
        'device_access', 
        'processing_logs',
        'analysis_cache'
      ]
    }), {
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error) {
    console.error('Database setup error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}
