import { NextResponse } from "next/server";
import { registerEmailUser } from "@/lib/accounts";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    notify?: boolean;
  };
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!name || !email || password.length < 6) {
    return NextResponse.json({ error: "Name, email, and a password of 6+ characters are required." }, { status: 400 });
  }
  try {
    const user = await registerEmailUser({
      name,
      email,
      password,
      notify: body.notify !== false,
    });
    return NextResponse.json({ email: user.email, name: user.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create account.";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
