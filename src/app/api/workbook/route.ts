import { loadWorkbook } from "@/lib/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const result = await loadWorkbook();
    if (!result.ok) {
      return Response.json(
        {
          error: "Workbook validation failed.",
          issues: result.issues,
        },
        { status: 422, headers: noStoreHeaders },
      );
    }

    return Response.json(result.value, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      {
        error: "Unable to read the configured workbook. Check the server workbook path and try again.",
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
