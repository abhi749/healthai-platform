export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Handle CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { healthData } = await request.json();
    
    if (!healthData || !healthData.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No health data provided',
        details: 'Please provide health data to analyze'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // Create health analysis prompt
    const prompt = `You are an expert health data analyst AI. Analyze this health data and provide helpful insights.

Health Data to Analyze:
${healthData}

Please provide a comprehensive but concise analysis including:

1. **Key Findings**: What stands out in these health metrics?
2. **Health Assessment**: Overall health picture based on these values
3. **Areas of Concern**: Any metrics that need attention (if any)
4. **Recommendations**: Specific, actionable health advice
5. **Next Steps**: What to discuss with healthcare provider

Important Guidelines:
- Be helpful and informative but not diagnostic
- Mention normal ranges where relevant
- Focus on lifestyle and wellness advice
- Keep response under 300 words
- Use clear, easy-to-understand language
- Always recommend consulting healthcare professionals for medical decisions

Analysis:`;

    console.log('Sending request to Cloudflare Workers AI...');
    
    // Call Cloudflare Workers AI
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 400,
      temperature: 0.7
    });

    console.log('AI Response received:', aiResponse);

    if (!aiResponse || !aiResponse.response) {
      throw new Error('Empty response from AI model');
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: aiResponse.response.trim(),
      model: 'llama-3.1-8b-instruct',
      timestamp: new Date().toISOString(),
      processingLocation: 'Cloudflare Edge'
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Health analysis error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack || 'Unknown error occurred during AI processing',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

// Handle OPTIONS requests for CORS
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
