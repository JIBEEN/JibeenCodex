import test from "node:test";
import assert from "node:assert/strict";
import { count, validateLetter, slotNumber } from "../lib/validation";
test("counts Korean, decomposed characters and compound emoji consistently", () => {
  assert.equal(count("가"), 1);
  assert.equal(count("👨‍👩‍👧‍👦"), 1);
  assert.equal(count("감사해요"), 4);
});
test("trims input and accepts leading zero password", () => {
  assert.deepEqual(
    validateLetter({
      nickname: " 지민 ",
      content: " 고맙습니다. ",
      password: "0123",
    }),
    { nickname: "지민", content: "고맙습니다." },
  );
});
test("rejects blank, overlong and invalid password inputs", () => {
  for (const value of [
    { nickname: " ", content: "감사", password: "1234" },
    { nickname: "가".repeat(21), content: "감사", password: "1234" },
    { nickname: "가", content: "감사".repeat(1001), password: "1234" },
    { nickname: "가", content: "감사", password: "１２３４" },
    { nickname: "가", content: "감사", password: "12a4" },
  ])
    assert.throws(() => validateLetter(value));
});
test("accepts maximum grapheme length and validates edit without password", () => {
  validateLetter({
    nickname: "👨‍👩‍👧‍👦".repeat(20),
    content: "가".repeat(2000),
    password: "0000",
  });
  validateLetter({ nickname: "가", content: "감사" }, false);
});
test("slots are restricted to exactly 1 through 5", () => {
  for (const n of [0, 6, -1, 1.5, "no", null])
    assert.throws(() => slotNumber(n));
  for (let n = 1; n <= 5; n++) assert.equal(slotNumber(n), n);
});
