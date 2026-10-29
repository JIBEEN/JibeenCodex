export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
export const count = (s: string) => Array.from(segmenter.segment(s)).length;
export function validateLetter(
  data: { nickname?: unknown; content?: unknown; password?: unknown },
  passwordRequired = true,
) {
  const nickname =
    typeof data.nickname === "string" ? data.nickname.trim() : "";
  const content = typeof data.content === "string" ? data.content.trim() : "";
  if (!nickname || count(nickname) > 20)
    throw new AppError("닉네임을 1~20자로 입력해 주세요.");
  if (!content || count(content) > 2000)
    throw new AppError("편지 내용을 1~2,000자로 입력해 주세요.");
  if (
    passwordRequired &&
    (typeof data.password !== "string" || !/^\d{4}$/.test(data.password))
  )
    throw new AppError("비밀번호는 숫자 4자리로 입력해 주세요.");
  return { nickname, content };
}
export function slotNumber(value: unknown) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot > 5)
    throw new AppError("올바른 봉투를 선택해 주세요.");
  return slot;
}
export type Letter = {
  id: string;
  slot_number: number;
  nickname: string;
  content: string;
  updated_at: string;
};
export type AppState = {
  background: string | null;
  letters: Letter[];
  demo: boolean;
};
