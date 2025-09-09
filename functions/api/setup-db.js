export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    console.log('=== EMERGENCY DATABASE FIX ===');
    
    // STEP 1: Check current table structure
    console.log('Checking current health_parameters table structure...');
    const currentStructure = await env.DB.prepare(`
      PRAGMA table_info(health_parameters)
    `).all();
    
    const existingColumns = currentStructure.results.map(col => col.name);
    console.log('Existing columns:', existingColumns);
    
    // STEP 2: Add missing columns one by one with detailed error handling
    const requiredColumns = [
      { name: 'status', type: 'TEXT', default: "'Normal'" },
      { name: 'category', type: 'TEXT', default: "'General'" },
      { name: 'test_date', type: 'TEXT', default: 'NULL' },
      { name: 'numeric_value', type: 'REAL', default: 'NULL' }
    ];
    
    const addedColumns = [];
    const skippedColumns = [];
    const failedColumns = [];
    
    for (const column of requiredColumns) {
      if (existingColumns.includes(column.name)) {
        console.log(`Column ${column.name} already exists, skipping...`);
        skippedColumns.push(column.name);
        continue;
      }
      
      try {
        const sql = `ALTER TABLE health_parameters ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}`;
        console.log(`Executing: ${sql}`);
        
        await env.DB.prepare(sql).run();
        
        console.log(`✅ Successfully added column: ${column.name}`);
        addedColumns.push(column.name);
        
      } catch (error) {
        console.error(`❌ Failed to add column ${column.name}:`, error);
        failedColumns.push({ name: column.name, error: error.message });
      }
    }
    
    // STEP 3: Verify final table structure
    console.log('Verifying final table structure...');
    const finalStructure = await env.DB.prepare(`
      PRAGMA table_info(health_parameters)
    `).all();
    
    const finalColumns = finalStructure.results.map(col => col.name);
    console.log('Final columns:', finalColumns);
    
    // STEP 4: Test insert to verify the fix worked
    console.log('Testing insert with all columns...');
    const testData = {
      parameter_id: 'test_' + Date.now(),
      session_token: 'test_session',
      document_id: 'test_doc',
      parameter_name: 'Test Parameter',
      parameter_value: '100',
      parameter_unit: 'mg/dL',
      reference_range: '70-100',
      status: 'Normal',
      category: 'Test',
      test_date: '2025-09-09',
      numeric_value: 100.0,
      created_at: new Date().toISOString()
    };
    
    try {
      await env.DB.prepare(`
        INSERT INTO health_parameters (
          parameter_id, session_token, document_id, parameter_name,
          parameter_value, parameter_unit, reference_range, status,
          category, test_date, numeric_value, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        testData.parameter_id,
        testData.session_token,
        testData.document_id,
        testData.parameter_name,
        testData.parameter_value,
        testData.parameter_unit,
        testData.reference_range,
        testData.status,
        testData.category,
        testData.test_date,
        testData.numeric_value,
        testData.created_at
      ).run();
      
      console.log('✅ Test insert successful');
      
      // Clean up test data
      await env.DB.prepare(`
        DELETE FROM health_parameters WHERE parameter_id = ?
      `).bind(testData.parameter_id).run();
      
      console.log('✅ Test data cleaned up');
      
    } catch (testError) {
      console.error('❌ Test insert failed:', testError);
      throw new Error(`Database still not fixed: ${testError.message}`);
    }
    
    // STEP 5: Return detailed results
    const allRequiredPresent = requiredColumns.every(col => finalColumns.includes(col.name));
    
    console.log('=== DATABASE FIX COMPLETED ===');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Emergency database fix completed successfully',
      details: {
        columnsAdded: addedColumns,
        columnsSkipped: skippedColumns,
        columnsFailed: failedColumns,
        finalColumns: finalColumns,
        allRequiredPresent: allRequiredPresent,
        testInsertPassed: true
      },
      tableStructure: finalStructure.results,
      timestamp: new Date().toISOString(),
      version: 'EMERGENCY_FIX_v1.0'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('=== EMERGENCY DATABASE FIX FAILED ===');
    console.error('Error details:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.cause ? error.cause.message : 'Emergency database fix failed',
      timestamp: new Date().toISOString(),
      troubleshooting: {
        issue: 'Database columns missing or cannot be added',
        solutions: [
          'Check D1 database permissions',
          'Verify wrangler.toml D1 binding is correct',
          'Try recreating the D1 database completely',
          'Check Cloudflare D1 dashboard for errors'
        ],
        manualFix: 'You may need to recreate the D1 database from scratch'
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
