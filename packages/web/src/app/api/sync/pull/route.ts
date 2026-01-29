import { NextResponse } from 'next/server';

import { createRouteHandlerClient } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = parseInt(searchParams.get('cursor') ?? '0', 10);
    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? '100', 10),
      1000
    );

    const { data: events, error: eventsError } = await supabase
      .from('sync_events')
      .select('id, event_type, blob_id, sequence_num, created_at')
      .eq('user_id', user.id)
      .gt('sequence_num', cursor)
      .order('sequence_num', { ascending: true })
      .limit(limit);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    const blobIds =
      events
        ?.filter((e) => e.event_type !== 'DELETE' && e.blob_id)
        .map((e) => e.blob_id) ?? [];

    const blobs: Record<string, string> = {};
    const blobUrls: Record<string, string> = {};
    const inlineMaxBytes = Number(
      process.env.SYNC_INLINE_BLOB_MAX_BYTES ?? 262144
    );
    const signedUrlTtlSeconds = Number(
      process.env.SYNC_BLOB_URL_TTL_SECONDS ?? 300
    );

    if (blobIds.length > 0) {
      const { data: blobMetaRows, error: blobMetaError } = await supabase
        .from('blobs')
        .select('id, storage_path, size_bytes')
        .in('id', blobIds);

      if (blobMetaError) {
        return NextResponse.json(
          { error: blobMetaError.message },
          { status: 500 }
        );
      }

      await Promise.all(
        (blobMetaRows ?? []).map(async (blobMeta) => {
          if (!blobMeta?.storage_path) return;

          const sizeBytes = blobMeta.size_bytes ?? 0;

          if (sizeBytes > inlineMaxBytes) {
            const { data: signedData } = await supabase.storage
              .from('encrypted-blobs')
              .createSignedUrl(blobMeta.storage_path, signedUrlTtlSeconds);

            if (signedData?.signedUrl) {
              blobUrls[blobMeta.id] = signedData.signedUrl;
            }

            return;
          }

          const { data: fileData } = await supabase.storage
            .from('encrypted-blobs')
            .download(blobMeta.storage_path);

          if (fileData) {
            const buffer = await fileData.arrayBuffer();
            blobs[blobMeta.id] = Buffer.from(buffer).toString('base64');
          }
        })
      );
    }

    const latestSeq = events?.length
      ? Math.max(...events.map((e) => e.sequence_num))
      : cursor;

    return NextResponse.json({
      events,
      blobs,
      blobUrls,
      cursor: latestSeq,
      hasMore: events?.length === limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
