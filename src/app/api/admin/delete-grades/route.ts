import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// La service key debe estar en una variable de entorno segura del backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Crear cliente solo si las variables existen (lazy initialization)
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase no configurado: faltan variables de entorno SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabase) {
    supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

export async function POST(request: NextRequest) {
  // Verificar si Supabase está configurado
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ 
      error: 'Supabase no configurado', 
      details: 'Este endpoint requiere configuración de Supabase que no está disponible en modo SQL local' 
    }, { status: 503 });
  }
  
  const body = await request.json();
  const { year } = body;
  
  if (!year || typeof year !== 'number') {
    return NextResponse.json({ error: 'Año inválido' }, { status: 400 });
  }
  
  try {
    const client = getSupabaseClient();
    
    // Contar antes
    const { count: beforeCount, error: countError } = await client
      .from('grades')
      .select('*', { count: 'exact', head: true })
      .eq('year', year);
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    // Borrar
    const { error, count } = await client
      .from('grades')
      .delete({ count: 'exact' })
      .eq('year', year);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Contar después
    const { count: afterCount } = await client
      .from('grades')
      .select('*', { count: 'exact', head: true })
      .eq('year', year);
    return NextResponse.json({
      deleted: count,
      beforeCount,
      afterCount,
      success: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error desconocido' }, { status: 500 });
  }
}
