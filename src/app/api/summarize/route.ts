import { NextRequest, NextResponse } from "next/server";

type CandidatePart = { text?: string };
type CandidateContent = { parts?: CandidatePart[] };
type Candidate = { content?: CandidateContent; finishReason?: string };
type ModelResponse = { candidates?: Candidate[] };

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { content, mode } = await req.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing 'content' string in body" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const isPunctuate = mode === "punctuate";
    const prompt = isPunctuate
      ? `Add appropriate punctuation, capitalization, and sentence boundaries to the following text.\n\nReturn ONLY the corrected plain text, with no explanations, no quotes, and no extra formatting.\n\nText:\n${content}`
      : `Summarize the following study notes succinctly. Give the response without any formatting as where I need to post does not support formatting.\n\n Return clear key points with "-" and a short overview paragraph, reducing the content size to about 30%.\n\nNotes:\n${content}`;
    // Prefer stable model name with fallbacks in case an alias is unavailable
    const preferredModels = [
      "gemini-2.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
    ];

    const body = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: isPunctuate ? 0.1 : 0.3,
        maxOutputTokens: 2048,
      },
    };

    let lastError: { status?: number; text?: string } | null = null;
    for (const model of preferredModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as ModelResponse;
        const parts: string[] = Array.isArray(data?.candidates?.[0]?.content?.parts)
          ? (data.candidates?.[0]?.content?.parts as CandidatePart[]).map((p) => p?.text ?? "").filter(Boolean)
          : [];
        let combined = parts.join("");
        const finishReason: string | undefined = data?.candidates?.[0]?.finishReason;

        // If truncated due to token limit, request a single continuation
        if (finishReason === "MAX_TOKENS") {
          const continuationPrompt = `Continue the summary without repeating prior text. Pick up exactly where it was cut off.\n\nOriginal notes (for reference):\n${content}\n\nPartial so far:\n${combined}`;
          const continuationBody = {
            contents: [
              {
                parts: [{ text: continuationPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
            },
          };
          const res2 = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(continuationBody),
          });
          if (res2.ok) {
            const data2 = (await res2.json()) as ModelResponse;
            const parts2: string[] = Array.isArray(data2?.candidates?.[0]?.content?.parts)
              ? (data2.candidates?.[0]?.content?.parts as CandidatePart[]).map((p) => p?.text ?? "").filter(Boolean)
              : [];
            combined += parts2.join("");
          }
        }

        if (isPunctuate) {
          // For punctuation mode, return plain corrected text
          return NextResponse.json({ text: combined });
        }
        return NextResponse.json({ summary: combined });
      } else {
        const detailText = await res.text();
        lastError = { status: res.status, text: detailText };
        // Retry on 4xx like 404/400 indicating model name issues; otherwise break
        if (res.status >= 500) {
          break;
        }
      }
    }

    return NextResponse.json(
      {
        error: "Gemini API error",
        detail: lastError?.text ?? "Unknown error",
        statusCode: lastError?.status ?? 502,
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("/api/summarize error", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
