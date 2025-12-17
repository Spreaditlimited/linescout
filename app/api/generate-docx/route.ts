// app/api/generate-docx/route.ts
import { NextResponse } from "next/server";
import DocxTemplater from "docxtemplater";
import PizZip from "pizzip";

export const runtime = "nodejs"; // ensure Node runtime

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const planText: string = body.planText;
    const rawFileName: string | undefined = body.fileName;

    if (!planText || typeof planText !== "string") {
      return NextResponse.json(
        { error: "planText is required" },
        { status: 400 }
      );
    }

    // Build a safe filename
    const fileName =
      (rawFileName &&
        rawFileName
          .toString()
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9-_]/g, "")
          .slice(0, 50)) ||
      "linescout-business-plan";

    const safeName = fileName.toLowerCase();

    // Very simple DOCX content: one paragraph with the whole planText.
    // Later we can swap this to a proper .docx template.
    const docxContent = `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r>
              <w:t xml:space="preserve">${planText}</w:t>
            </w:r>
          </w:p>
        </w:body>
      </w:document>
    `.trim();

    // Create a new zip and add the document.xml
    const zip = new PizZip();
    zip.file("word/document.xml", docxContent);

    const doc = new DocxTemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Generate as Uint8Array so TS is happy with Response body type
    const uint8 = doc.getZip().generate({
      type: "uint8array",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}.docx"`,
      },
    });
  } catch (error) {
    console.error("DOCX generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate DOCX" },
      { status: 500 }
    );
  }
}