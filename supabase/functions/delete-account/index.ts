/**
 * Criador: Diego Manhães
 * Data: 08/05/2026
 *
 * Edge Function: delete-account
 * Deleta todos os dados do usuário autenticado e remove o registro de auth.users.
 * Requer JWT válido no header Authorization.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const { data: { user }, error: authError } =
      await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''))

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[delete-account] Deletando:', user.id)

    const tables = [
      'goal_transactions',
      'goals',
      'emergency_reserve_transactions',
      'emergency_reserve',
      'scheduled_transaction_months',
      'scheduled_transactions',
      'cycle_rollovers',
      'transactions',
      'pot_history',
      'pots',
      'income_source_history',
      'income_sources',
      'users',
    ]

    for (const table of tables) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('user_id', user.id)

      if (error) {
        console.error(`[delete-account] Erro em ${table}:`, error.message)
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('[delete-account] Erro auth:', deleteError.message)
      return new Response(
        JSON.stringify({ error: 'Erro ao deletar usuário' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[delete-account] Sucesso:', user.id)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[delete-account] Erro:', String(err))
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
