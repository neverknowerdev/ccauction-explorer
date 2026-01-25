import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('X-API-KEY');
    const expectedApiKey = process.env.ALCHEMY_API_KEY;
    
    if (!expectedApiKey) {
      console.error('ALCHEMY_API_KEY environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    if (!apiKey || apiKey !== expectedApiKey) {
      console.warn('Invalid or missing API key');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Extract block data from the nested structure
    const block = body?.event?.data?.block;
    
    if (!block) {
      console.warn('No block data found in request body');
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }
    
    // Extract and print the required fields
    const blockNumber = block.number;
    const blockHash = block.hash;
    const timestamp = block.timestamp;
    const logs = block.logs || [];
    
    console.log('=== Alchemy Webhook Event ===');
    console.log('Block Number:', blockNumber);
    console.log('Block Hash:', blockHash);
    console.log('Timestamp:', timestamp);
    console.log('Logs Count:', logs.length);
    console.log('');
    
    // Print transaction hashes and logs
    logs.forEach((log: any, index: number) => {
      const txHash = log?.transaction?.hash;
      console.log(`Log ${index}:`);
      console.log('  Transaction Hash:', txHash);
      console.log('  Log Data:', log.data);
      console.log('  Topics:', log.topics);
      console.log('  Index:', log.index);
      console.log('  Account Address:', log?.account?.address);
      console.log('  From Address:', log?.transaction?.from?.address);
      console.log('  To Address:', log?.transaction?.to?.address);
      console.log('');
    });
    
    console.log('============================');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Event received and processed',
      blockNumber,
      blockHash,
      timestamp,
      logsCount: logs.length
    });
  } catch (error) {
    console.error('Error in handle-event/alchemy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process event' },
      { status: 500 }
    );
  }
}
