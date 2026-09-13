import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { financeExportRows } from "@/lib/analytics";
import { handleError } from "@/lib/api";

function csvCell(value: unknown) { const text = value == null ? "" : String(value); return `"${text.replace(/"/g,'""')}"`; }

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(["SUPER_ADMIN","ADMIN","FINANCE"]);
    const to = req.nextUrl.searchParams.get("to") ? new Date(req.nextUrl.searchParams.get("to") as string) : new Date();
    const from = req.nextUrl.searchParams.get("from") ? new Date(req.nextUrl.searchParams.get("from") as string) : new Date(to.getTime()-30*86400000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime()-from.getTime()>366*86400000) return Response.json({error:"Invalid export range."},{status:422});
    const rows = await financeExportRows(from,to);
    const header = ["created_at","event_type","provider","gross_cents","provider_fee_cents","net_cents","currency","order_id","payment_id","refund_id","provider_reference"];
    const lines = [header.join(","),...rows.map(row=>[
      row.created_at.toISOString(),row.event_type,row.provider,row.gross_cents,row.provider_fee_cents,row.net_cents,row.currency,row.order_id,row.payment_id,row.refund_id,row.provider_reference
    ].map(csvCell).join(","))];
    const filename = `getsawa-finance-${from.toISOString().slice(0,10)}-${to.toISOString().slice(0,10)}.csv`;
    return new Response(lines.join("\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${filename}"`,"cache-control":"no-store"}});
  } catch (error) { return handleError(error); }
}
