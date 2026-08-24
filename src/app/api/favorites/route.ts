import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { importSaves, listSaves, removeSave, toggleSave } from "@/lib/accounts";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ favorites: [] }, { status: 401 });
  }
  try {
    return NextResponse.json({ favorites: await listSaves(email) });
  } catch {
    return NextResponse.json({ favorites: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Sign in to save recipes." }, { status: 401 });
  }
  const body = (await request.json()) as {
    slug?: string;
    title?: string;
    action?: string;
    import?: { slug: string; title: string }[];
  };
  try {
    if (body.import) {
      const favorites = await importSaves(email, body.import, session.user?.name ?? "", request.headers);
      return NextResponse.json({ favorites });
    }
    if (!body.slug || !body.title) {
      return NextResponse.json({ error: "Recipe is required." }, { status: 400 });
    }
    if (body.action === "remove") {
      const favorites = await removeSave(email, body.slug);
      return NextResponse.json({ liked: false, favorites });
    }
    const result = await toggleSave(
      email,
      { slug: body.slug, title: body.title },
      session.user?.name ?? "",
      request.headers,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save recipe." },
      { status: 500 },
    );
  }
}
