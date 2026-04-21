import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// NOTE: This function is kept for reference but the app now fetches SEFAZ HTML
// directly from the device (user IP) to avoid datacenter IP blocking.
// See lib/ocr.ts fetchNFCeFromDevice() for the active implementation.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'Use device-side fetch instead — SEFAZ blocks datacenter IPs.',
      info: 'See fetchNFCeFromDevice() in lib/ocr.ts',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
