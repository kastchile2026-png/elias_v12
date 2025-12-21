import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const diagnostics: any = {
    env: {
      supabaseUrl: supabaseUrl ? '✅ Configurada' : '❌ Faltante',
      serviceKey: serviceKey ? `✅ Configurada (${serviceKey.length} caracteres)` : '❌ Faltante',
      anonKey: anonKey ? '✅ Configurada' : '❌ Faltante',
    },
    tests: {}
  };

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      ...diagnostics,
      error: 'Variables de entorno faltantes'
    }, { status: 500 });
  }

  // Test 1: Crear cliente con service role
  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    diagnostics.tests.clientCreation = '✅ Cliente creado correctamente';

    // Test 2: Verificar conexión básica
    try {
      const { data, error } = await supabase.from('grades').select('count', { count: 'exact', head: true });
      if (error) {
        diagnostics.tests.connection = `❌ Error: ${error.message}`;
        diagnostics.tests.connectionDetails = error;
      } else {
        diagnostics.tests.connection = '✅ Conexión exitosa';
        diagnostics.tests.gradesCount = data;
      }
    } catch (connErr: any) {
      diagnostics.tests.connection = `❌ Excepción: ${connErr.message}`;
    }

    // Test 3: Listar tablas disponibles
    try {
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (tablesError) {
        diagnostics.tests.tables = `❌ No se pudieron listar tablas: ${tablesError.message}`;
      } else {
        diagnostics.tests.tables = tables?.map((t: any) => t.table_name) || [];
      }
    } catch (tablesErr: any) {
      diagnostics.tests.tables = `❌ Excepción: ${tablesErr.message}`;
    }

    // Test 4: Verificar tabla grades específicamente
    try {
      const { count, error: gradesError } = await supabase
        .from('grades')
        .select('*', { count: 'exact', head: true });
      
      if (gradesError) {
        diagnostics.tests.gradesTable = `❌ Error: ${gradesError.message}`;
        diagnostics.tests.gradesError = {
          message: gradesError.message,
          details: gradesError.details,
          hint: gradesError.hint,
          code: gradesError.code
        };
      } else {
        diagnostics.tests.gradesTable = `✅ Tabla accesible (${count || 0} registros)`;
      }
    } catch (gradesErr: any) {
      diagnostics.tests.gradesTable = `❌ Excepción: ${gradesErr.message}`;
    }

  } catch (e: any) {
    diagnostics.tests.clientCreation = `❌ Error al crear cliente: ${e.message}`;
  }

  return NextResponse.json(diagnostics);
}
