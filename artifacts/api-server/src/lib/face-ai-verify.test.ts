import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideFaceAiGate, parseFaceAiInspect, parseFaceAiPayload, pickAiIdentityWinner } from "./face-ai-decision.ts";

describe("face AI fact verdict", () => {
  it("parses same/different/unknown as facts", () => {
    const same = parseFaceAiPayload({ verdict: "same", samePerson: true, uncertain: false });
    assert.equal(same?.samePerson, true);
    assert.equal(same?.uncertain, false);

    const other = parseFaceAiPayload({ verdict: "different", samePerson: false });
    assert.equal(other?.samePerson, false);
    assert.equal(other?.uncertain, false);

    const unknown = parseFaceAiPayload({ verdict: "unknown", uncertain: true });
    assert.equal(unknown?.samePerson, false);
    assert.equal(unknown?.uncertain, true);
  });

  it("rejects a different person even with a high number", () => {
    const gate = decideFaceAiGate({
      samePerson: false,
      uncertain: false,
      confidence: 0.99,
      similarity: 0.99,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.code, "face_ai_mismatch");
  });

  it("accepts same person as fact even at 0.86-style scores", () => {
    const gate = decideFaceAiGate({
      samePerson: true,
      uncertain: false,
      confidence: 0.86,
      similarity: 0.7,
    });
    assert.equal(gate.ok, true);
  });

  it("does not treat uncertainty as a mismatch", () => {
    const gate = decideFaceAiGate({
      samePerson: false,
      uncertain: true,
      confidence: 0.4,
      similarity: 0.4,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.code, "face_ai_uncertain");
  });

  it("inspect allows one face without a high quality cutoff", () => {
    const two = parseFaceAiInspect({ ok: true, faceCount: 2, quality: 0.9 });
    assert.equal(two?.faceCount, 2);
    const one = parseFaceAiInspect({ ok: true, faceCount: 1, quality: 0.45 });
    assert.equal(one?.ok, true);
  });

  it("picks unique fact identity and rejects two different people", () => {
    const unique = pickAiIdentityWinner([
      { faceProfileId: 1, userId: 10, samePerson: true, uncertain: false, confidence: 0.5, similarity: 0.5 },
      { faceProfileId: 2, userId: 11, samePerson: false, uncertain: false, confidence: 0.2, similarity: 0.2 },
    ]);
    assert.equal(unique.ok, true);
    if (unique.ok) assert.equal(unique.userId, 10);

    const clash = pickAiIdentityWinner([
      { faceProfileId: 1, userId: 10, samePerson: true, uncertain: false, confidence: 0.5, similarity: 0.5 },
      { faceProfileId: 2, userId: 11, samePerson: true, uncertain: false, confidence: 0.5, similarity: 0.5 },
    ]);
    assert.equal(clash.ok, false);
  });
});
