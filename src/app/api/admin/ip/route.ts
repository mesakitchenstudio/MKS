import { getAdminSession } from "@/lib/auth";
import { lookupIpDetails } from "@/lib/ip-lookup";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return Response.json({ error: "Missing address" }, { status: 400 });
  }

  const details = await lookupIpDetails(address);
  return Response.json(details);
}
