// Client-side CV parser for PDF and DOCX files.
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
// Vite serves the worker as an asset URL.
// @ts-expect-error - Vite ?url import
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export async function parseCvFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return parsePdf(file);
  if (name.endsWith(".docx")) return parseDocx(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();
  throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT or MD file.");
}

async function parsePdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(text);
  }
  return cleanText(parts.join("\n\n"));
}

async function parseDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return cleanText(result.value);
}

function cleanText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Very lightweight structured extraction — enough to prefill form fields.
export interface ParsedCvMeta {
  name?: string;
  email?: string;
  phone?: string;
  skills: string[];
  summary?: string;
}

const COMMON_SKILLS = [
  "Unity", "Unreal", "C#", "C++", "ARKit", "ARCore", "ARFoundation", "Vuforia",
  "8th Wall", "WebXR", "AR.js", "Three.js", "Babylon.js", "Lens Studio",
  "Spark AR", "Meta Spark", "TikTok Effect House", "WebGL", "GLSL", "Shader",
  "React", "React Native", "Next.js", "Vue", "Node.js", "TypeScript", "JavaScript",
  "Python", "PHP", "WordPress", "Laravel", "Django", "FastAPI",
  "PostgreSQL", "MySQL", "MongoDB", "Supabase", "Firebase", "AWS", "GCP", "Docker",
  "Tailwind", "GraphQL", "REST", "OpenAI", "Gemini", "LangChain", "RAG",
];

export function extractCvMeta(text: string): ParsedCvMeta {
  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  const phone = text.match(/(\+?\d[\d\s().-]{8,}\d)/)?.[0]?.trim();
  const firstLine = text.split("\n").map(l => l.trim()).find(l => l.length > 2 && l.length < 60);
  const name = firstLine && /^[A-Z][a-zA-Z'’.-]+(\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(firstLine)
    ? firstLine
    : undefined;
  const lower = text.toLowerCase();
  const skills = Array.from(new Set(COMMON_SKILLS.filter(s => lower.includes(s.toLowerCase()))));
  const summaryMatch = text.match(/(?:summary|profile|about)\s*[:\n]+([\s\S]{60,600}?)(?:\n\n|\n[A-Z ]{3,}\n)/i);
  const summary = summaryMatch?.[1]?.trim().slice(0, 500);
  return { name, email, phone, skills, summary };
}
