export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    console.log('=== EXTRACT API CALLED ===');
    console.log('Content-Type:', request.headers.get('content-type'));
    
    // Always return sample data for now to test the flow
    const sampleData = {
      personalDataFound: [],
      healthParameters: [
        {
          category: "Cardiovascular",
          parameter: "Total Cholesterol",
          value: "185",
          unit: "mg/dL",
          referenceRange: "<200",
          date: "2024-09-05",
          status: "Normal"
        },
        {
          category: "Cardiovascular", 
          parameter: "HDL Cholesterol",
          value: "52",
          unit: "mg/dL",
          referenceRange: ">40",
          date: "2024-09-05",
          status: "Normal"
        },
        {
          category: "Cardiovascular",
          parameter: "LDL Cholesterol", 
          value: "110",
          unit: "mg/dL",
          referenceRange: "<100",
          date: "2024-09-05",
          status: "Slightly High"
        },
        {
          category: "Metabolic",
          parameter: "Glucose",
          value: "92",
          unit: "mg/dL", 
          referenceRange: "70-99",
          date: "2024-09-05",
          status: "Normal"
        },
        {
          category: "Metabolic",
          parameter: "Hemoglobin A1C",
          value: "5.4",
          unit: "%",
          referenceRange: "<5.7",
          date: "2024-09-05", 
          status: "Normal"
        },
        {
          category: "Hormonal",
          parameter: "TSH",
          value: "2.1",
          unit: "mIU/L",
          referenceRange: "0.4-4.0",
          date: "2024-09-05",
          status: "Normal"
        },
        {
          category: "Nutritional",
          parameter: "Vitamin D",
          value: "35",
          unit: "ng/mL",
          referenceRange: "30-100", 
          date: "2024-09-05",
          status: "Normal"
        },
        {
          category: "Physical",
          parameter: "Blood Pressure",
          value: "120/80",
          unit: "mmHg",
          referenceRange: "<120/80",
          date: "2024-09-05",
          status: "Normal"
        }
      ],
      documentType: "Comprehensive Lab Panel",
      testDate: "2024-09-05",
      totalParametersFound: 8
    };

    console.log('=== RETURNING SAMPLE DATA ===');
    console.log('Parameters:', sampleData.totalParametersFound);

    return new Response(JSON.stringify({
      success: true,
      extractedData: sampleData,
      processingInfo: {
        model: 'test-mode',
        extractionMethod: 'Sample data for testing',
        textLength: 500,
        timestamp: new Date().toISOString(),
        parametersFound: sampleData.totalParametersFound,
        note: 'This is sample data to test the analysis flow'
      }
    }), {
      headers: corsHeaders
    });

  } catch (error) {
    console.error('Extract API error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Extract API failed',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: corsHeaders
    });
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
