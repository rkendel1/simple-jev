import { PromptPlan, ScoringQuestion } from "./prompt.js";

export type Logits = Record<string, Record<string, number> | readonly number[]>;
export interface Answer { readonly type: string; [key: string]: unknown }

function softmax(values: readonly number[]): number[] {
  if (values.length === 0 || values.some(value => !Number.isFinite(value))) throw new Error("Expected finite logits");
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map(value => value / total);
}

function row(question: ScoringQuestion, value: Record<string, number> | readonly number[]): number[] {
  if (Array.isArray(value)) {
    if (value.length !== question.output_labels.length) throw new Error("Expected one logit per output label");
    return [...value];
  }
  if (Object.keys(value).length !== question.output_labels.length ||
      question.output_labels.some(label => !(label in value))) throw new Error(`Unexpected or missing output labels for branch ${question.branch_id}`);
  return question.output_labels.map(label => value[label] as number);
}

export function buildAnswers(plan: PromptPlan, logits: Logits, advanced = false): Record<string, Answer> {
  const expected = plan.questions.map(q => q.branch_id);
  if (Object.keys(logits).length !== expected.length || expected.some(id => !(id in logits))) throw new Error("Logits must contain exactly the planned branch IDs");
  const answers: Record<string, Answer> = {};
  for (const question of plan.questions) {
    const values = row(question, logits[question.branch_id]!);
    const probabilities = softmax(values);
    const labels = question.answer_labels;
    const winner = values.reduce((best, value, index) => value > values[best]! ? index : best, 0);
    if (plan.request.questions[question.question_id]!.type === "noul") {
      const mean = probabilities.reduce((sum, p, i) => sum + p * (i + 1), 0);
      const answer: Answer = { type: "noul", noul: Math.min(.99, Math.max(.01, .01 + (mean / 10 - .1) * (.98 / .8))) };
      if (advanced) Object.assign(answer, { calibrated: false, rating: { bins: [1,2,3,4,5,6,7,8,9], probabilities, expected_score: mean } });
      answers[question.question_id] = answer;
    } else {
      const answer: Answer = {
        type: plan.request.questions[question.question_id]!.type,
        confidence: probabilities[winner],
        probabilities: Object.fromEntries(labels.map((label, i) => [label, probabilities[i]]))
      };
      if (question.answer_labels.length && plan.request.questions[question.question_id]!.type === "choice")
        answer.choice = labels[winner];
      else {
        const mean = probabilities.reduce((sum, p, i) => sum + p * i, 0);
        answer.score = mean;
        answer.legend = Object.fromEntries(labels.map((_, i) => [String(i), plan.request.questions[question.question_id]!.criteria[i]]));
      }
      if (advanced) Object.assign(answer, { calibrated: false, logits: Object.fromEntries(labels.map((label, i) => [label, values[i]])) });
      answers[question.question_id] = answer;
    }
  }
  return answers;
}

export function buildResponse(plan: PromptPlan, logits: Logits, inputTokens: number, outputTokens = 0, advanced = false): Record<string, unknown> {
  if (!Number.isInteger(inputTokens) || inputTokens < 0 || !Number.isInteger(outputTokens) || outputTokens < 0)
    throw new Error("Token counts must be nonnegative integers");
  const response: Record<string, unknown> = { model: plan.request.model, answers: buildAnswers(plan, logits, advanced), usage: { input_tokens: inputTokens, output_tokens: outputTokens } };
  if (advanced) response.metadata = { template_version: plan.template_version, calibration: "not_calibrated" };
  return response;
}
