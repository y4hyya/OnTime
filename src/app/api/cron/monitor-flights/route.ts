import { monitorActivePolicies } from "@/server/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not set", { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await monitorActivePolicies();
    return Response.json(result);
  } catch (e) {
    console.error("Monitor cron failed:", e);
    return new Response(
      `Monitor failed: ${e instanceof Error ? e.message : String(e)}`,
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
