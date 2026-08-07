import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Generate a random token (URL-safe)
function generateToken(length = 32): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => chars[b % chars.length]).join('');
}

// SHA-256 hash of token
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - must be admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Verify admin role via user token
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false }
      }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleCheck } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { inventory_unit_ids, print_job_name, order_id, shipment_id } = body;

    if (!inventory_unit_ids || !Array.isArray(inventory_unit_ids) || inventory_unit_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'inventory_unit_ids required (array of UUIDs)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!print_job_name) {
      return new Response(JSON.stringify({ error: 'print_job_name required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = Deno.env.get('SITE_URL') || Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || 'https://podrozowka.lovable.app';

    // Verify all units exist and are in reserved status
    const { data: units, error: fetchError } = await supabase
      .from('inventory_units')
      .select('id, fulfillment_status, public_claim_code')
      .in('id', inventory_unit_ids);

    if (fetchError || !units) {
      return new Response(JSON.stringify({ error: 'Failed to fetch inventory units' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check units are in valid state for QR generation
    const invalidUnits = units.filter(u => u.fulfillment_status !== 'reserved' && u.fulfillment_status !== 'in_stock' && u.fulfillment_status !== 'shipped' && u.fulfillment_status !== 'purchased');
    if (invalidUnits.length > 0) {
      return new Response(JSON.stringify({ 
        error: `${invalidUnits.length} units are not in valid state (must be reserved or in_stock)`,
        invalid_ids: invalidUnits.map(u => u.id),
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create print job
    const { data: printJob, error: jobError } = await supabase
      .from('qr_print_jobs')
      .insert({
        name: print_job_name,
        order_id: order_id || null,
        shipment_id: shipment_id || null,
        total_items: inventory_unit_ids.length,
        generated_items: 0,
        status: 'generating',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (jobError || !printJob) {
      console.error('Failed to create print job:', jobError);
      return new Response(JSON.stringify({ error: 'Nie udało się utworzyć zadania drukowania' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    interface PrintJobItem {
      print_job_id: string;
      inventory_unit_id: string;
      public_claim_code: string;
      qr_url: string;
    }
    const printJobItems: PrintJobItem[] = [];
    const unitUpdates: { id: string; claim_code: string; token_hash: string }[] = [];

    for (const unitId of inventory_unit_ids) {
      const existingUnit = units.find(u => u.id === unitId);
      
      // Generate claim code
      const { data: claimCode } = await supabase.rpc('generate_claim_code');
      
      // Generate random public token for URL
      const publicToken = generateToken(32);
      const tokenHash = await hashToken(publicToken);
      
      // QR URL points to registration page with token
      const qrUrl = `${baseUrl}/r/${publicToken}`;

      printJobItems.push({
        print_job_id: printJob.id,
        inventory_unit_id: unitId,
        public_claim_code: claimCode,
        qr_url: qrUrl,
      });

      unitUpdates.push({
        id: unitId,
        claim_code: claimCode,
        token_hash: tokenHash,
      });
    }

    // Insert print job items
    const { error: itemsError } = await supabase
      .from('qr_print_job_items')
      .insert(printJobItems);

    if (itemsError) {
      console.error('Failed to insert print job items:', itemsError);
      await supabase.from('qr_print_jobs').delete().eq('id', printJob.id);
      return new Response(JSON.stringify({ error: 'Nie udało się zapisać pozycji zadania' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update each inventory unit with claim code, token hash, and status
    let updatedCount = 0;
    for (const update of unitUpdates) {
      const { error: updateError } = await supabase
        .from('inventory_units')
        .update({
          public_claim_code: update.claim_code,
          public_claim_token_hash: update.token_hash,
          fulfillment_status: 'qr_generated',
          qr_generated_at: new Date().toISOString(),
        })
        .eq('id', update.id);

      if (!updateError) updatedCount++;
    }

    // Update print job status
    await supabase
      .from('qr_print_jobs')
      .update({
        status: 'ready',
        generated_items: updatedCount,
      })
      .eq('id', printJob.id);

    return new Response(JSON.stringify({
      success: true,
      print_job_id: printJob.id,
      generated: updatedCount,
      total: inventory_unit_ids.length,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
