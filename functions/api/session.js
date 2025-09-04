export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { action, ...data } = await request.json();
    
    switch (action) {
      case 'create':
        return await createAnonymousSession(data, env, corsHeaders);
      case 'verify':
        return await verifySession(data, env, corsHeaders);
      case 'regenerate':
        return await regenerateSessionKey(data, env, corsHeaders);
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Session management error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Create anonymous session with security questions
async function createAnonymousSession(data, env, corsHeaders) {
  const { userEmailHash, securityAnswers, deviceFingerprint } = data;
  
  if (!userEmailHash || !securityAnswers || securityAnswers.length < 3) {
    throw new Error('Missing required session data');
  }

  // Generate anonymous session token
  const sessionToken = generateAnonymousToken();
  
  // Create user salt for cross-device key regeneration
  const userSalt = generateSalt();
  
  // Hash security answers for verification (but don't store the answers)
  const answerHashes = await Promise.all(
    securityAnswers.map(answer => hashSecurityAnswer(answer.toLowerCase().trim(), userSalt))
  );

  // Store anonymous session data
  const sessionData = {
    session_token: sessionToken,
    user_email_hash: userEmailHash,
    user_salt: userSalt,
    answer_hash_1: answerHashes[0],
    answer_hash_2: answerHashes[1], 
    answer_hash_3: answerHashes[2],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    last_activity: new Date().toISOString(),
    device_fingerprint: deviceFingerprint,
    document_count: 0
  };

  // Insert into D1 database
  await env.DB.prepare(`
    INSERT INTO anonymous_sessions (
      session_token, user_email_hash, user_salt,
      answer_hash_1, answer_hash_2, answer_hash_3,
      created_at, expires_at, last_activity, device_fingerprint, document_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionData.session_token,
    sessionData.user_email_hash,
    sessionData.user_salt,
    sessionData.answer_hash_1,
    sessionData.answer_hash_2,
    sessionData.answer_hash_3,
    sessionData.created_at,
    sessionData.expires_at,
    sessionData.last_activity,
    sessionData.device_fingerprint,
    sessionData.document_count
  ).run();

  return new Response(JSON.stringify({
    success: true,
    sessionToken: sessionToken,
    userSalt: userSalt,
    message: 'Anonymous session created successfully',
    expiresAt: sessionData.expires_at
  }), {
    headers: corsHeaders
  });
}

// Verify session with security questions (cross-device access)
async function verifySession(data, env, corsHeaders) {
  const { userEmailHash, securityAnswers, deviceFingerprint } = data;
  
  if (!userEmailHash || !securityAnswers || securityAnswers.length < 3) {
    throw new Error('Missing verification data');
  }

  // Find session by email hash
  const session = await env.DB.prepare(`
    SELECT * FROM anonymous_sessions 
    WHERE user_email_hash = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC LIMIT 1
  `).bind(userEmailHash).first();

  if (!session) {
    throw new Error('No active session found for this user');
  }

  // Verify security answers
  const answerHashes = await Promise.all(
    securityAnswers.map(answer => hashSecurityAnswer(answer.toLowerCase().trim(), session.user_salt))
  );

  const answersMatch = 
    answerHashes[0] === session.answer_hash_1 &&
    answerHashes[1] === session.answer_hash_2 &&
    answerHashes[2] === session.answer_hash_3;

  if (!answersMatch) {
    // Log failed attempt
    console.warn('Failed session verification attempt', { userEmailHash, deviceFingerprint });
    throw new Error('Security verification failed');
  }

  // Update last activity and device
  await env.DB.prepare(`
    UPDATE anonymous_sessions 
    SET last_activity = ?, device_fingerprint = ?
    WHERE session_token = ?
  `).bind(
    new Date().toISOString(),
    deviceFingerprint,
    session.session_token
  ).run();

  // Log successful cross-device access
  await env.DB.prepare(`
    INSERT INTO device_access (
      access_id, user_email_hash, device_fingerprint,
      first_access, last_access, access_count, recovery_method
    ) VALUES (?, ?, ?, ?, ?, 1, 'security_questions')
    ON CONFLICT(user_email_hash, device_fingerprint) DO UPDATE SET
      last_access = ?, access_count = access_count + 1
  `).bind(
    generateAnonymousToken(),
    userEmailHash,
    deviceFingerprint,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return new Response(JSON.stringify({
    success: true,
    sessionToken: session.session_token,
    userSalt: session.user_salt,
    documentCount: session.document_count,
    message: 'Cross-device access verified successfully',
    lastActivity: session.last_activity
  }), {
    headers: corsHeaders
  });
}

// Regenerate session key (for security or device changes)
async function regenerateSessionKey(data, env, corsHeaders) {
  const { currentSessionToken, newDeviceFingerprint } = data;
  
  if (!currentSessionToken) {
    throw new Error('Current session token required');
  }

  // Verify current session exists
  const session = await env.DB.prepare(`
    SELECT * FROM anonymous_sessions 
    WHERE session_token = ? AND expires_at > datetime('now')
  `).bind(currentSessionToken).first();

  if (!session) {
    throw new Error('Invalid or expired session');
  }

  // Generate new session token
  const newSessionToken = generateAnonymousToken();

  // Update session with new token
  await env.DB.prepare(`
    UPDATE anonymous_sessions 
    SET session_token = ?, device_fingerprint = ?, last_activity = ?
    WHERE session_token = ?
  `).bind(
    newSessionToken,
    newDeviceFingerprint || session.device_fingerprint,
    new Date().toISOString(),
    currentSessionToken
  ).run();

  return new Response(JSON.stringify({
    success: true,
    sessionToken: newSessionToken,
    message: 'Session token regenerated successfully'
  }), {
    headers: corsHeaders
  });
}

// Utility functions
function generateAnonymousToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'anon_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSalt() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function hashSecurityAnswer(answer, salt) {
  // Simple hash function for demo - in production would use stronger hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(answer + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
