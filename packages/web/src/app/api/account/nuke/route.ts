import { NextResponse } from 'next/server';

import { createRouteHandlerClient } from '@/lib/supabase';

export async function DELETE() {
  try {
    const supabase = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: blobs } = await supabase
      .from('blobs')
      .select('storage_path')
      .eq('user_id', user.id);

    if (blobs && blobs.length > 0) {
      const paths = blobs.map((b) => b.storage_path);
      await supabase.storage.from('encrypted-blobs').remove(paths);
    }

    await supabase.from('sync_events').delete().eq('user_id', user.id);
    await supabase.from('blobs').delete().eq('user_id', user.id);
    await supabase.from('vault_members').delete().eq('user_id', user.id);
    await supabase.from('vaults').delete().eq('owner_id', user.id);
    await supabase.from('devices').delete().eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      message: 'All data has been permanently deleted',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
