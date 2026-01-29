import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase';
import { randomBytes } from 'crypto';

function generateSecureLinkCode(): string {
  const bytes = randomBytes(16);
  return bytes.toString('hex').substring(0, 12).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deviceName, publicKey, linkCode } = await request.json();

    if (!deviceName || !publicKey) {
      return NextResponse.json(
        { error: 'Missing deviceName or publicKey' },
        { status: 400 }
      );
    }

    if (linkCode) {
      const { data: linkRequest, error: linkError } = await supabase
        .from('device_link_requests')
        .select('*')
        .eq('link_code', linkCode)
        .eq('status', 'pending')
        .single();

      if (linkError || !linkRequest) {
        return NextResponse.json(
          { error: 'Invalid or expired link code' },
          { status: 400 }
        );
      }

      const expiresAt = new Date(linkRequest.expires_at);
      if (expiresAt < new Date()) {
        await supabase
          .from('device_link_requests')
          .update({ status: 'expired' })
          .eq('id', linkRequest.id);
        return NextResponse.json(
          { error: 'Link code has expired' },
          { status: 400 }
        );
      }

      const { data: device, error: deviceError } = await supabase
        .from('devices')
        .insert({
          user_id: user.id,
          device_name: deviceName,
          public_key: publicKey,
        })
        .select()
        .single();

      if (deviceError) {
        return NextResponse.json(
          { error: deviceError.message },
          { status: 500 }
        );
      }

      await supabase
        .from('device_link_requests')
        .update({ status: 'completed', linked_device_id: device.id })
        .eq('id', linkRequest.id);

      return NextResponse.json({
        device,
        encryptedMasterKey: linkRequest.encrypted_master_key,
      });
    }

    const code = generateSecureLinkCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const { error: insertError } = await supabase
      .from('device_link_requests')
      .insert({
        user_id: user.id,
        link_code: code,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      linkCode: code,
      expiresAt: expiresAt.toISOString(),
      qrData: JSON.stringify({
        type: 'engram-link',
        code,
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
