import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString().split('T')[0]

  const { error, count } = await supabase
    .from('price_database')
    .delete({ count: 'exact' })
    .lt('scanned_at', thirtyDaysAgo)

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      deleted: count || 0,
      message: `${count || 0} registros deletados`
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
