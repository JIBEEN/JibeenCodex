import { AppError, AppState, Letter, validateLetter } from "./validation";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const connected = !!(url && anon);
const key = "warm-letter-demo-v1";
type LocalState = AppState & {
  secrets: Record<string, { salt: string; hash: string }>;
};
const empty = (): LocalState => ({
  background: null,
  letters: [],
  demo: true,
  secrets: {},
});
function local(): LocalState {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || empty();
  } catch {
    return empty();
  }
}
function persist(data: LocalState) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    throw new AppError(
      "기기 저장 공간이 부족해요. 더 작은 사진으로 다시 시도해 주세요.",
    );
  }
}
async function digest(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new TextEncoder().encode(salt),
          iterations: 100000,
        },
        material,
        256,
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
) {
  const response = await fetch(`${url}/functions/v1/warm-letter?path=${path}`, {
    method,
    headers: {
      apikey: anon!,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { "x-letter-token": token } : {}),
    },
    body:
      method === "GET"
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new AppError(
      result.error || "요청을 완료하지 못했어요.",
      response.status,
    );
  return result;
}
export async function getState(): Promise<AppState> {
  return connected ? api("state") : local();
}
export async function uploadPhoto(file: File, dataUrl: string) {
  if (connected) {
    const form = new FormData();
    form.append("photo", file);
    await api("background", "POST", form);
  } else {
    const state = local();
    if (state.background) throw new AppError("사진이 이미 등록되었어요.", 409);
    persist({ ...state, background: dataUrl });
  }
}
export async function saveLetter(
  slot: number,
  nickname: string,
  content: string,
  password: string,
  existing?: Letter,
  token?: string,
) {
  const fields = validateLetter({ nickname, content, password }, !existing);
  if (connected)
    return api(
      "letters",
      existing ? "PATCH" : "POST",
      { ...fields, password, slot_number: slot, id: existing?.id },
      token,
    );
  const state = local();
  const found = state.letters.find((x) => x.slot_number === slot);
  if (!existing && found) throw new AppError("다른 분이 먼저 작성했어요.", 409);
  if (existing && (!found || found.updated_at !== existing.updated_at))
    throw new AppError("편지가 변경됐어요. 다시 열어 주세요.", 409);
  if (existing && token !== `edit:${existing.id}:${existing.updated_at}`)
    throw new AppError("비밀번호를 다시 확인해 주세요.", 401);
  const letter = {
    ...fields,
    slot_number: slot,
    id: existing?.id || crypto.randomUUID(),
    updated_at: new Date().toISOString(),
  };
  if (!existing) {
    const salt = crypto.randomUUID();
    state.secrets[letter.id] = { salt, hash: await digest(password, salt) };
  }
  state.letters = state.letters
    .filter((x) => x.slot_number !== slot)
    .concat(letter);
  persist(state);
  return letter;
}
const attempts: number[] = [];
export async function authenticate(
  letter: Letter,
  password: string,
  action: "edit" | "delete",
) {
  if (!/^\d{4}$/.test(password))
    throw new AppError("숫자 4자리 비밀번호를 입력해 주세요.");
  if (connected)
    return (await api("auth", "POST", { id: letter.id, password, action }))
      .token as string;
  const now = Date.now();
  while (attempts[0] < now - 60000) attempts.shift();
  if (attempts.length >= 5)
    throw new AppError("잠시 후 다시 시도해 주세요.", 429);
  attempts.push(now);
  const secret = local().secrets[letter.id];
  if (!secret || (await digest(password, secret.salt)) !== secret.hash)
    throw new AppError("비밀번호가 일치하지 않습니다.", 401);
  return `${action}:${letter.id}:${letter.updated_at}`;
}
export async function deleteLetter(letter: Letter, token: string) {
  if (connected) return api("letters", "DELETE", { id: letter.id }, token);
  if (token !== `delete:${letter.id}:${letter.updated_at}`)
    throw new AppError("비밀번호를 다시 확인해 주세요.", 401);
  const state = local();
  if (
    state.letters.find((x) => x.id === letter.id)?.updated_at !==
    letter.updated_at
  )
    throw new AppError("편지가 변경됐어요. 다시 열어 주세요.", 409);
  state.letters = state.letters.filter((x) => x.id !== letter.id);
  delete state.secrets[letter.id];
  persist(state);
}
