import assert from "node:assert/strict";
import test from "node:test";
import { buildAnswers, buildResponse, canonical, preparePrompt } from "../src/index.js";

const payload = () => ({
  model: "test", state: { color: "red" },
  questions: {
    color: { type: "choice", instructions: "Color?", criteria: { red: null, blue: "Blue" } },
    support: { type: "score", instructions: "Support?", criteria: ["no", "yes"] },
    truth: { type: "noul", instructions: "Red?" }
  }
});
test("canonical JSON and v1 prompt are stable", () => {
  assert.equal(canonical({ b: 2, a: 1 }), '{"a":1,"b":2}');
  const plan = preparePrompt(payload());
  assert.equal(plan.questions.length, 3);
  assert.equal(plan.questions[0]!.output_labels[0], "A");
  assert.equal(plan.questions[1]!.answer_prefix, '{"answer": ');
});
test("scores choice, score and Noul branches", () => {
  const plan = preparePrompt(payload());
  const logits = Object.fromEntries(plan.questions.map(q => [q.branch_id, q.output_labels.map((_, i) => i)]));
  const answers = buildAnswers(plan, logits);
  assert.equal(answers.color!.choice, "blue");
  assert.ok((answers.support!.score as number) > 0.5);
  assert.ok((answers.truth!.noul as number) > 0.9);
  assert.deepEqual(buildResponse(plan, logits, 12).usage, { input_tokens: 12, output_tokens: 0 });
});
test("rejects invalid context and incomplete logits", () => {
  assert.throws(() => preparePrompt({ ...payload(), messages: [{ role: "user", content: "x" }] }));
  const plan = preparePrompt(payload());
  assert.throws(() => buildAnswers(plan, {}));
});
