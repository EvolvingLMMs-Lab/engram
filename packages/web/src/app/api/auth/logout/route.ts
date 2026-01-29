import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase';

export async function POST() {
  try {
    const supabase = await createRouteHandlerClient();
    await supabase.auth.signOut();

    return NextResponse.json({ message: 'Logged out successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
