import { corsHeaders } from '../_shared/cors.ts';

interface TestRequest {
  integrationId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: TestRequest = await req.json();

    if (!body.integrationId) {
      return new Response(
        JSON.stringify({ error: 'Missing integrationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/integrations?id=eq.${body.integrationId}&select=*`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
      },
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch integration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rows = await res.json();
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Integration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const integration = rows[0];

    // Update status based on config presence
    const hasConfig = integration.config && Object.keys(integration.config).length > 0;
    const newStatus = hasConfig ? 'connected' : 'configuration_required';

    await fetch(
      `${supabaseUrl}/rest/v1/integrations?id=eq.${body.integrationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ status: newStatus }),
      },
    );

    return new Response(
      JSON.stringify({ ok: hasConfig, status: newStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
