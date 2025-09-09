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
      error: error.message,
      details: `Session operation failed: ${error.message}`,
      timestamp: new Date().toISOString(),
      troubleshooting: {
        commonCauses: [
          'User already has an active session (try verify instead)',
          'Invalid security answers format',
          'Database connection issues',
          'Missing required fields'
        ],
        solutions: [
          'Use verify action for existing users',
          'Check all security answers are provided',
          'Ensure database is properly initialized',
          'Verify all required fields are included'
        ]
      }
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// FIXED: Create anonymous session with proper existing user handling
async function createAnonymousSession(data, env, corsHeaders) {
  const { userEmailHash, securityAnswers, deviceFingerprint } = data;
  
  if (!userEmailHash || !securityAnswers || securityAnswers.length < 3) {
    throw new Error('Missing required session data: userEmailHash and 3 securityAnswers required');
  }

  console.log('=== CREATE SESSION ATTEMPT ===');
  console.log('User email hash provided:', !!userEmailHash);
  console.log('Security answers provided:', securityAnswers.length);
  console.log('Device fingerprint provided:', !!deviceFingerprint);

  try {
    // STEP 1: Check if user already exists
    console.log('Checking for existing user...');
    const existingSession = await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE user_email_hash = ?
      ORDER BY created_at DESC LIMIT 1
    `).bind(userEmailHash).first();

    if (existingSession) {
      console.log('Existing session found for user');
      
      // Check if session is still valid
      const now = new Date().toISOString();
      if (existingSession.expires_at > now) {
        console.log('Existing session is still valid, returning existing session');
        
        // Update last activity and device
        await env.DB.prepare(`
          UPDATE anonymous_sessions 
          SET last_activity = ?, device_fingerprint = ?
          WHERE session_token = ?
        `).bind(
          now,
          deviceFingerprint,
          existingSession.session_token
        ).run();

        return new Response(JSON.stringify({
          success: true,
          sessionToken: existingSession.session_token,
          userSalt: existingSession.user_salt,
          message: 'Existing session found and reactivated',
          expiresAt: existingSession.expires_at,
          isExisting: true
        }), {
          headers: corsHeaders
        });
      } else {
        console.log('Existing session expired, will delete and create new');
        
        // Delete expired session
        await env.DB.prepare(`
          DELETE FROM anonymous_sessions 
          WHERE user_email_hash = ?
        `).bind(userEmailHash).run();
      }
    }

    // STEP 2: Generate new session components
    console.log('Generating new session...');
    const sessionToken = generateAnonymousToken();
    const userSalt = generateSalt();
    
    console.log('Session token generated:', sessionToken.substring(0, 20) + '...');
    console.log('User salt generated:', userSalt.substring(0, 10) + '...');

    // STEP 3: Hash security answers for verification
    console.log('Hashing security answers...');
    const answerHashes = await Promise.all(
      securityAnswers.map(answer => hashSecurityAnswer(answer.toLowerCase().trim(), userSalt))
    );
    console.log('Security answers hashed successfully');

    // STEP 4: Prepare session data
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

    const sessionData = {
      session_token: sessionToken,
      user_email_hash: userEmailHash,
      user_salt: userSalt,
      answer_hash_1: answerHashes[0],
      answer_hash_2: answerHashes[1], 
      answer_hash_3: answerHashes[2],
      created_at: now,
      expires_at: expiresAt,
      last_activity: now,
      device_fingerprint: deviceFingerprint || 'unknown',
      document_count: 0
    };

    console.log('Session data prepared, inserting into database...');

    // STEP 5: Insert into D1 database with detailed error handling
    try {
      const insertResult = await env.DB.prepare(`
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

      console.log('Database insert successful:', insertResult);

    } catch (dbError) {
      console.error('Database insert failed:', dbError);
      
      if (dbError.message.includes('UNIQUE constraint failed')) {
        throw new Error('User session already exists. This should not happen after our checks. Please try again or contact support.');
      } else {
        throw new Error(`Database error during session creation: ${dbError.message}`);
      }
    }

    console.log('=== SESSION CREATED SUCCESSFULLY ===');

    return new Response(JSON.stringify({
      success: true,
      sessionToken: sessionToken,
      userSalt: userSalt,
      message: 'Anonymous session created successfully',
      expiresAt: expiresAt,
      isExisting: false,
      debugInfo: {
        userEmailHashLength: userEmailHash.length,
        saltLength: userSalt.length,
        sessionTokenLength: sessionToken.length,
        answersHashed: answerHashes.length
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== SESSION CREATION FAILED ===');
    console.error('Error details:', error);
    throw error;
  }
}

// ENHANCED: Verify session with security questions (cross-device access)
async function verifySession(data, env, corsHeaders) {
  const { userEmailHash, securityAnswers, deviceFingerprint } = data;
  
  if (!userEmailHash || !securityAnswers || securityAnswers.length < 3) {
    throw new Error('Missing verification data: userEmailHash and 3 securityAnswers required');
  }

  console.log('=== VERIFY SESSION ATTEMPT ===');
  console.log('User email hash provided:', !!userEmailHash);
  console.log('Security answers provided:', securityAnswers.length);

  try {
    // Find session by email hash
    const session = await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE user_email_hash = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).bind(userEmailHash).first();

    if (!session) {
      throw new Error('No active session found for this user. Please create a new session first.');
    }

    console.log('Session found, verifying security answers...');

    // Verify security answers
    const answerHashes = await Promise.all(
      securityAnswers.map(answer => hashSecurityAnswer(answer.toLowerCase().trim(), session.user_salt))
    );

    const answersMatch = 
      answerHashes[0] === session.answer_hash_1 &&
      answerHashes[1] === session.answer_hash_2 &&
      answerHashes[2] === session.answer_hash_3;

    if (!answersMatch) {
      console.warn('Security verification failed for user:', userEmailHash);
      throw new Error('Security verification failed. Please check your answers and try again.');
    }

    console.log('Security verification successful');

    // Update last activity and device
    await env.DB.prepare(`
      UPDATE anonymous_sessions 
      SET last_activity = ?, device_fingerprint = ?
      WHERE session_token = ?
    `).bind(
      new Date().toISOString(),
      deviceFingerprint || session.device_fingerprint,
      session.session_token
    ).run();

    // Log successful cross-device access
    await env.DB.prepare(`
      INSERT OR REPLACE INTO device_access (
        access_id, user_email_hash, device_fingerprint,
        first_access, last_access, access_count, recovery_method
      ) VALUES (?, ?, ?, ?, ?, 1, 'security_questions')
    `).bind(
      generateAnonymousToken(),
      userEmailHash,
      deviceFingerprint || 'unknown',
      new Date().toISOString(),
      new Date().toISOString()
    ).run();

    console.log('=== SESSION VERIFICATION SUCCESSFUL ===');

    return new Response(JSON.stringify({
      success: true,
      sessionToken: session.session_token,
      userSalt: session.user_salt,
      documentCount: session.document_count || 0,
      message: 'Cross-device access verified successfully',
      lastActivity: session.last_activity,
      expiresAt: session.expires_at
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== SESSION VERIFICATION FAILED ===');
    console.error('Error details:', error);
    throw error;
  }
}

// Regenerate session key (for security or device changes)
async function regenerateSessionKey(data, env, corsHeaders) {
  const { currentSessionToken, newDeviceFingerprint } = data;
  
  if (!currentSessionToken) {
    throw new Error('Current session token required for regeneration');
  }

  console.log('=== REGENERATE SESSION KEY ===');

  try {
    // Verify current session exists
    const session = await env.DB.prepare(`
      SELECT * FROM anonymous_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).bind(currentSessionToken).first();

    if (!session) {
      throw new Error('Invalid or expired session token');
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

    console.log('Session token regenerated successfully');

    return new Response(JSON.stringify({
      success: true,
      sessionToken: newSessionToken,
      message: 'Session token regenerated successfully'
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('=== SESSION REGENERATION FAILED ===');
    console.error('Error details:', error);
    throw error;
  }
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
  try {
    // Enhanced hashing for security answers
    const encoder = new TextEncoder();
    const data = encoder.encode(answer + salt + 'healthai_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Error hashing security answer:', error);
    throw new Error('Failed to hash security answer');
  }
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
