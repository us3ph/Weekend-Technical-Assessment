import { z } from "zod";
import { calculatePlan } from "@/lib/planner";
import { loadWorkbook } from "@/lib/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

const planRequestSchema = z
  .object({
    inputVersion: z
      .object({
        algorithm: z.literal("sha256"),
        value: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

function malformedRequest(): Response {
  return Response.json(
    {
      code: "MALFORMED_REQUEST",
      error: "A valid inputVersion is required to generate a plan.",
    },
    { status: 400, headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return malformedRequest();
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) return malformedRequest();

  try {
    const loaded = await loadWorkbook();
    if (!loaded.ok) {
      return Response.json(
        {
          code: "INVALID_DATA",
          error: "Workbook validation failed. Reload after correcting the source data.",
          issues: loaded.issues,
        },
        { status: 422, headers: noStoreHeaders },
      );
    }

    if (loaded.value.snapshot.version.value !== parsed.data.inputVersion.value) {
      return Response.json(
        {
          code: "STALE_INPUT_VERSION",
          error: "The workbook changed since it was loaded. Reload it before generating a plan.",
          requestedInputVersion: parsed.data.inputVersion,
          currentInputVersion: loaded.value.snapshot.version,
        },
        { status: 409, headers: noStoreHeaders },
      );
    }

    return Response.json(calculatePlan(loaded.value.snapshot), { headers: noStoreHeaders });
  } catch {
    return Response.json(
      {
        code: "SERVER_ERROR",
        error: "Unable to generate the plan from the configured workbook. Try again.",
      },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
