import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "https://esm.sh/qrcode@1.5.4";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Verify admin
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
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { print_job_id } = body;

    if (!print_job_id) {
      return new Response(JSON.stringify({ error: 'print_job_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch print job
    const { data: job, error: jobError } = await supabase
      .from('qr_print_jobs')
      .select('*')
      .eq('id', print_job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: 'Print job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch print job items with inventory and design info
    const { data: items, error: itemsError } = await supabase
      .from('qr_print_job_items')
      .select(`
        id, public_claim_code, qr_url, generated_at,
        inventory_units!inner(
          internal_inventory_code,
          card_designs!inner(
            title, view_no,
            countries!inner(name_pl)
          )
        )
      `)
      .eq('print_job_id', print_job_id)
      .order('generated_at', { ascending: true });

    if (itemsError || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items found for this print job' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // QR records contain a relative registration path so the same order can be
    // printed after moving from local development to the production domain.
    const publicBaseUrl = Deno.env.get('SITE_URL') || Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || 'https://podrozowka.lovable.app';

    // Generate PDF - Square 35x35mm stickers layout for postcard back
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const stickerSize = 35; // 35mm x 35mm square sticker
    const colGap = 3.5;
    const rowGap = 3.5;
    const colsPerPage = 5;
    const rowsPerPage = 7;
    const itemsPerPage = colsPerPage * rowsPerPage; // 35 stickers per page

    const leftMargin = 10.5;
    const topMargin = 15.5;

interface PrintJobItem {
  id: string;
  public_claim_code: string;
  qr_url: string;
  generated_at: string;
  inventory_units: {
    internal_inventory_code: string;
    card_designs: {
      title: string | null;
      view_no: number;
      countries: {
        name_pl: string | null;
      } | null;
    } | null;
  } | null;
}

    const castItems = items as unknown as PrintJobItem[];

    for (let i = 0; i < castItems.length; i++) {
      const item = castItems[i];
      const posOnPage = i % itemsPerPage;
      const col = posOnPage % colsPerPage;
      const row = Math.floor(posOnPage / colsPerPage);

      if (i > 0 && posOnPage === 0) {
        doc.addPage();
      }

      // Add page header on new page
      if (posOnPage === 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(120, 120, 120);
        doc.text(`Naklejki QR Podróżówka (35x35mm) — Zadanie: ${job.name} | Data: ${new Date().toLocaleDateString('pl-PL')}`, leftMargin, 8);
      }

      const x = leftMargin + col * (stickerSize + colGap);
      const y = topMargin + row * (stickerSize + rowGap);

      // Generate QR code as data URL
      const registrationUrl = new URL(item.qr_url, publicBaseUrl).toString();
      const qrDataUrl = await QRCode.toDataURL(registrationUrl, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      // Outer dashed border (cutting line for 35x35mm square)
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, stickerSize, stickerSize);

      // QR Code Image (centered 25mm x 25mm)
      const qrSize = 25;
      const qrX = x + (stickerSize - qrSize) / 2;
      const qrY = y + 2.5;
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      // Bottom claim code (e.g. PDZ-XXXX-XXXX)
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(item.public_claim_code, x + stickerSize / 2, y + 31.5, { align: "center" });
    }

    // Page numbers
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(6);
      doc.setTextColor(160, 160, 160);
      doc.text(`Strona ${p} / ${totalPages}`, pageWidth - leftMargin, pageHeight - 5, { align: "right" });
    }

    // Output PDF as base64
    const pdfBase64 = doc.output('datauristring');

    return new Response(JSON.stringify({
      success: true,
      pdf: pdfBase64,
      items_count: items.length,
      job_name: job.name,
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
