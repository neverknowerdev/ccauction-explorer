import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get request body
    const body = await request.json().catch(() => null);
    
    // Get all headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    
    // Log everything to console
    console.log('=== handle-event API called ===');
    console.log('Method:', request.method);
    console.log('URL:', request.url);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Query Params:', JSON.stringify(queryParams, null, 2));
    console.log('Body:', JSON.stringify(body, null, 2));
    console.log('================================');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Event received and logged',
      received: {
        method: request.method,
        url: request.url,
        headers,
        queryParams,
        body
      }
    });
  } catch (error) {
    console.error('Error in handle-event:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process event' },
      { status: 500 }
    );
  }
}

// Also handle GET requests for testing
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const queryParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });
  
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  
  console.log('=== handle-event API called (GET) ===');
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('Query Params:', JSON.stringify(queryParams, null, 2));
  console.log('=====================================');
  
  return NextResponse.json({ 
    success: true, 
    message: 'Event received and logged',
    received: {
      method: request.method,
      url: request.url,
      headers,
      queryParams
    }
  });
}
