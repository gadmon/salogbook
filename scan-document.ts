// Supabase Edge Function: scan-document
//
// Purpose: securely proxy the "Scan Document (AI)" feature in SALOGBOOK.
// The browser (index.html) sends { model, max_tokens, messages } here instead
// of calling api.anthropic.com directly. This function attaches the real
// Anthropic API key (kept as a server-side secret, never sent to the browser)
// and forwards the request.
//
// Deploy with the Supabase CLI:
//   supabase functions deploy scan-document --project-ref vxjkegfpwpuiolgzchkm
//
// Set the secret once (also via CLI or the Dashboard -> Edge Functions -> Secrets):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx --project-ref vxjkegfpwpuiolgzchkm
//
// Or deploy by pasting this file's contents into:
//   Supabase Dashboard -> Edge Functions -> Create a new function -> name it "scan-document"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: { message: "Method not allowed" } }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              "ANTHROPIC_API_KEY secret is not configured on the Supabase project. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref vxjkegfpwpuiolgzchkm",
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { model, max_tokens, messages } = await req.json();

    if (!messages) {
      return new Response(
        JSON.stringify({ error: { message: "Missing 'messages' in request body" } }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-4-6",
        max_tokens: max_tokens || 1000,
        messages,
      }),
    });

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: { message: `scan-document proxy error: ${String((err as Error)?.message || err)}` },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
