import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const mod = await import("heic-convert");
    const convert = ((mod as { default?: unknown }).default ?? mod) as (opts: {
      buffer: Buffer;
      format: "JPEG" | "PNG";
      quality: number;
    }) => Promise<ArrayBufferLike>;

    const output = Buffer.from(
      await convert({
        buffer: inputBuffer,
        format: "JPEG",
        quality: 0.82,
      })
    );

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "HEIC conversion failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
