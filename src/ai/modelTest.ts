import type { ProviderProfile } from "../settings/providers";
import { runPrompt, type PromptRun } from "./aiClient";
import { AiError } from "./errors";
import { evaluateTranslationPrompt } from "./prompts/evaluateTranslation";
import { translateSentencePrompt } from "./prompts/translateSentence";
import { wordMeaningPrompt } from "./prompts/wordMeaning";

export type TaskId = "word" | "translate" | "evaluate";

export interface TestTask {
  id: TaskId;
  title: string;
  description: string;
  run(profile: ProviderProfile, model: string): Promise<PromptRun<unknown>>;
}

export const TEST_TASKS: TestTask[] = [
  {
    id: "word",
    title: "Kelime anlamı",
    description: '"addresses" — This patch addresses a race condition in the scheduler.',
    run: (profile, model) =>
      runPrompt(
        profile,
        wordMeaningPrompt,
        { word: "addresses", sentence: "This patch addresses a race condition in the scheduler." },
        { model, retries: 0 },
      ),
  },
  {
    id: "translate",
    title: "Cümle çevirisi",
    description:
      "Although the garbage collector frees unused memory automatically, developers should still avoid holding references to large objects longer than necessary.",
    run: (profile, model) =>
      runPrompt(
        profile,
        translateSentencePrompt,
        {
          sentence:
            "Although the garbage collector frees unused memory automatically, developers should still avoid holding references to large objects longer than necessary.",
        },
        { model, retries: 0 },
      ),
  },
  {
    id: "evaluate",
    title: "Çeviri değerlendirme",
    description:
      'The server rejects requests that exceed the rate limit. → (bilerek hatalı) "Sunucu, hız sınırını aşan istekleri kabul eder."',
    run: (profile, model) =>
      runPrompt(
        profile,
        evaluateTranslationPrompt,
        {
          sentence: "The server rejects requests that exceed the rate limit.",
          userTranslation: "Sunucu, hız sınırını aşan istekleri kabul eder.",
          targetLemmas: ["reject", "exceed"],
        },
        { model, retries: 0 },
      ),
  },
];

export interface TaskResult {
  model: string;
  taskId: TaskId;
  state: "running" | "done";
  status?: number;
  ms?: number;
  jsonValid?: boolean;
  hadThinking?: boolean;
  output?: string;
  error?: string;
}

export async function runTask(profile: ProviderProfile, model: string, task: TestTask): Promise<TaskResult> {
  try {
    const run = await task.run(profile, model);
    return {
      model,
      taskId: task.id,
      state: "done",
      status: run.status,
      ms: run.ms,
      jsonValid: run.data !== undefined,
      hadThinking: run.hadThinking,
      output: run.data !== undefined ? JSON.stringify(run.data, null, 2) : run.text,
      error: run.validationError,
    };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("network", String(e));
    return {
      model,
      taskId: task.id,
      state: "done",
      status: err.status,
      jsonValid: false,
      error: err.detail ? `${err.message}\n${err.detail}` : err.message,
    };
  }
}

/** Sonuçları Claude Code'a yapıştırılacak düz metne çevirir. */
export function formatResults(models: string[], results: TaskResult[]): string {
  const lines: string[] = ["# Duopdf model testi", ""];
  for (const model of models) {
    lines.push(`## ${model}`, "");
    for (const task of TEST_TASKS) {
      const r = results.find((x) => x.model === model && x.taskId === task.id);
      lines.push(`### ${task.title}`);
      if (!r || r.state !== "done") {
        lines.push("(çalıştırılmadı)", "");
        continue;
      }
      lines.push(
        `- HTTP: ${r.status ?? "yok"} | Süre: ${r.ms != null ? `${r.ms} ms` : "-"} | JSON: ${r.jsonValid ? "geçerli" : "geçersiz"} | Düşünme çıktısı: ${r.hadThinking ? "var" : "yok"}`,
      );
      if (r.error) lines.push(`- Hata: ${r.error.replace(/\n/g, " ")}`);
      if (r.output) lines.push("```", r.output, "```");
      lines.push("");
    }
  }
  return lines.join("\n");
}
