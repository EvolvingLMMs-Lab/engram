import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const limit = Math.min(
      parseInt(searchParams.get('limit') ?? '50', 10),
      200
    );
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const source = searchParams.get('source');
    const since = searchParams.get('since');

    let query = supabase
      .from('memories')
      .select(
        'id, content, tags, source, confidence, is_verified, created_at, updated_at',
        {
          count: 'exact',
        }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq('source', source);
    }

    if (since) {
      const sinceDate = new Date(parseInt(since, 10)).toISOString();
      query = query.gte('created_at', sinceDate);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const memories = (data ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      tags: m.tags ?? [],
      source: m.source,
      confidence: m.confidence ?? 0.5,
      isVerified: m.is_verified ?? false,
      createdAt: new Date(m.created_at).getTime(),
      updatedAt: new Date(m.updated_at).getTime(),
    }));

    return NextResponse.json({
      memories,
      total: count ?? 0,
      hasMore: memories.length === limit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content, tags, source, confidence } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('memories')
      .insert({
        content,
        tags: tags ?? [],
        source: source ?? null,
        confidence: confidence ?? 0.5,
        is_verified: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: data.id,
      content: data.content,
      tags: data.tags ?? [],
      source: data.source,
      confidence: data.confidence,
      isVerified: data.is_verified,
      createdAt: new Date(data.created_at).getTime(),
      updatedAt: new Date(data.updated_at).getTime(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const olderThan = searchParams.get('olderThan');

    if (olderThan) {
      const timestampDate = new Date(parseInt(olderThan, 10)).toISOString();
      const { error, count } = await supabase
        .from('memories')
        .delete()
        .lt('created_at', timestampDate);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ deleted: count ?? 0 });
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('memories').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
