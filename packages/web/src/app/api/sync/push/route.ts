import { NextResponse } from 'next/server';

import { createRouteHandlerClient } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { encryptedBlob, checksum, blindId } = await request.json();

    if (!encryptedBlob || !checksum) {
      return NextResponse.json(
        { error: 'Missing encryptedBlob or checksum' },
        { status: 400 }
      );
    }

    const blobId = crypto.randomUUID();
    const storagePath = `${user.id}/${blobId}.enc`;
    const blobBuffer = Buffer.from(encryptedBlob, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('encrypted-blobs')
      .upload(storagePath, blobBuffer, {
        contentType: 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: blobError } = await supabase.from('blobs').insert({
      id: blobId,
      user_id: user.id,
      storage_path: storagePath,
      size_bytes: blobBuffer.length,
      checksum,
    });

    if (blobError) {
      return NextResponse.json({ error: blobError.message }, { status: 500 });
    }

    const syncEventData: Record<string, unknown> = {
      user_id: user.id,
      blob_id: blobId,
      event_type: 'ADD',
    };

    if (blindId) {
      syncEventData.blind_id = blindId;
    }

    const { error: eventError } = await supabase
      .from('sync_events')
      .insert(syncEventData);

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    return NextResponse.json({ blobId, storagePath, blindId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
