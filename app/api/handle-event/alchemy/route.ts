import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';

function isValidSignatureForStringBody(
  body: string,
  signature: string,
  signingKey: string
): boolean {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const digest = hmac.digest('hex');
  return signature === digest;
}

export async function POST(request: NextRequest) {
  try {
    // Get signing key from environment
    const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;

    if (!signingKey) {
      console.error('ALCHEMY_WEBHOOK_SIGNING_KEY environment variable is not set');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get the raw body as text for signature validation
    const rawBody = await request.text();

    // Validate signature
    const signature = request.headers.get('X-Alchemy-Signature');

    if (!signature) {
      console.warn('Missing X-Alchemy-Signature header');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - missing signature' },
        { status: 401 }
      );
    }

    // const isValidSignature = isValidSignatureForStringBody(
    //   rawBody,
    //   signature,
    //   signingKey
    // );

    // if (!isValidSignature) {
    //   console.warn('Invalid signature - request not from Alchemy');
    //   return NextResponse.json(
    //     { success: false, error: 'Unauthorized - invalid signature' },
    //     { status: 401 }
    //   );
    // }

    // Parse request body as JSON
    const body = JSON.parse(rawBody);

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
