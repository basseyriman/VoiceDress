import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = process.env.ASSEMBLYAI_API_KEY;
  const form = await req.formData();
  const audio = form.get("audio");

  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio required" }, { status: 400 });
  }

  // Browser Web Speech is primary; AssemblyAI powers high-accuracy server STT when keyed.
  if (!key) {
    return NextResponse.json({
      text: null,
      provider: "browser",
      message: "ASSEMBLYAI_API_KEY not set — client speech recognition used.",
    });
  }

  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: key },
    body: Buffer.from(await audio.arrayBuffer()),
  });
  if (!uploadRes.ok) {
    return NextResponse.json({ error: "upload failed" }, { status: 502 });
  }
  const { upload_url } = await uploadRes.json();

  const transcriptRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: key,
      "content-type": "application/json",
    },
    body: JSON.stringify({ audio_url: upload_url, language_code: "en_uk" }),
  });
  const transcript = await transcriptRes.json();
  let status = transcript.status;
  let text = transcript.text;
  let id = transcript.id;

  while (status === "queued" || status === "processing") {
    await new Promise((r) => setTimeout(r, 1200));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: key },
    });
    const data = await poll.json();
    status = data.status;
    text = data.text;
    if (status === "error") {
      return NextResponse.json({ error: data.error }, { status: 502 });
    }
  }

  return NextResponse.json({ text, provider: "assemblyai" });
}
