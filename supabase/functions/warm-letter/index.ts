import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, jwtVerify } from "npm:jose@6";
import { Image } from "npm:imagescript@3.7.0";
import { AppError, validateLetter, slotNumber } from "../_shared/validation.ts";
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new AppError("저장소 설정이 필요합니다.", 503);
  return value;
};
const encoder = new TextEncoder();
const client = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
const fields = "id,slot_number,nickname,content,updated_at";
const tokenKey = () => encoder.encode(env("LETTER_AUTH_SECRET"));
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
async function hash(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password + env("LETTER_PASSWORD_PEPPER")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(salt),
        iterations: 600000,
      },
      material,
      256,
    ),
  );
}
function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++)
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function rate(req: Request, action: string, max = 20) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret = await crypto.subtle.importKey(
    "raw",
    tokenKey(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const p_key = hex(
    await crypto.subtle.sign("HMAC", secret, encoder.encode(`${ip}:${action}`)),
  );
  const { data, error } = await client().rpc("take_rate_limit", {
    p_key,
    p_max: max,
  });
  if (error) throw new AppError("잠시 후 다시 시도해 주세요.", 503);
  if (!data) throw new AppError("잠시 후 다시 시도해 주세요.", 429);
}
async function permission(req: Request, id: string, action: string) {
  try {
    const { payload } = await jwtVerify(
      req.headers.get("x-letter-token") || "",
      tokenKey(),
      { algorithms: ["HS256"] },
    );
    if (
      payload.sub !== id ||
      payload.action !== action ||
      typeof payload.version !== "string"
    )
      throw Error();
    return payload.version;
  } catch {
    throw new AppError(
      "인증이 만료됐어요. 비밀번호를 다시 입력해 주세요.",
      401,
    );
  }
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  let allowed: string;
  try {
    allowed = env("ALLOWED_ORIGIN");
  } catch {
    return new Response(
      JSON.stringify({ error: "서버 설정을 확인해 주세요." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const cors = {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey,content-type,x-letter-token",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const response = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: cors });
  if (origin !== allowed)
    return response({ error: "허용되지 않은 요청입니다." }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  try {
    const db = client();
    const route = new URL(req.url).searchParams.get("path");
    if (route === "state" && req.method === "GET") {
      const [settings, letters] = await Promise.all([
        db
          .from("project_settings")
          .select("background_path")
          .eq("id", 1)
          .single(),
        db.from("letters").select(fields).order("slot_number"),
      ]);
      if (settings.error || letters.error) throw Error();
      let background = null;
      if (settings.data.background_path) {
        const signed = await db.storage
          .from("memories")
          .createSignedUrl(settings.data.background_path, 3600);
        if (signed.error) throw Error();
        background = signed.data.signedUrl;
      }
      return response({ background, letters: letters.data, demo: false });
    }
    if (route === "background" && req.method === "POST") {
      await rate(req, "upload", 5);
      if (Number(req.headers.get("content-length")) > 11 * 1024 * 1024)
        throw new AppError("10MB 이하의 사진을 선택해 주세요.");
      const form = await req.formData();
      const file = form.get("photo");
      if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024)
        throw new AppError("10MB 이하의 사진을 선택해 주세요.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71;
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (!jpeg && !png && !webp)
        throw new AppError("JPG, PNG, WebP 사진만 등록할 수 있어요.");
      let image;
      try {
        image = await Image.decode(bytes);
      } catch {
        throw new AppError("사진을 읽을 수 없어요. 다른 사진을 선택해 주세요.");
      }
      if (image.width * image.height > 24000000)
        throw new AppError(
          "사진 해상도가 너무 커요. 작은 사진으로 다시 시도해 주세요.",
        );
      if (image.width > 1600 || image.height > 2200) {
        const ratio = Math.min(1600 / image.width, 2200 / image.height);
        image.resize(
          Math.round(image.width * ratio),
          Math.round(image.height * ratio),
        );
      }
      const optimized = await image.encodeJPEG(85);
      const reservation = crypto.randomUUID();
      const path = `background/${reservation}.jpg`;
      const reserved = await db.rpc("reserve_background", {
        p_token: reservation,
      });
      if (reserved.error) throw Error();
      if (!reserved.data)
        throw new AppError("사진이 이미 등록되었거나 등록 중이에요.", 409);
      let uploaded = false;
      try {
        const upload = await db.storage
          .from("memories")
          .upload(path, optimized, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (upload.error) throw Error();
        uploaded = true;
        const final = await db.rpc("finish_background", {
          p_token: reservation,
          p_path: path,
        });
        if (final.error || !final.data) throw Error();
        return response({ ok: true });
      } catch (error) {
        const current = await db
          .from("project_settings")
          .select("background_path")
          .eq("id", 1)
          .single();
        if (current.data?.background_path === path)
          return response({ ok: true });
        if (uploaded && current.data)
          await db.storage.from("memories").remove([path]);
        await db.rpc("release_background", { p_token: reservation });
        throw error;
      }
    }
    if (route === "auth" && req.method === "POST") {
      await rate(req, "auth", 5);
      const { id, password, action } = await req.json();
      if (
        typeof id !== "string" ||
        typeof password !== "string" ||
        !/^\d{4}$/.test(password) ||
        !["edit", "delete"].includes(action)
      )
        throw new AppError("숫자 4자리 비밀번호를 입력해 주세요.");
      const { data, error } = await db
        .from("letters")
        .select("password_hash,updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw Error();
      if (!data) throw new AppError("비밀번호가 일치하지 않습니다.", 401);
      const [algorithm, salt, expected] = data.password_hash.split("$");
      if (
        algorithm !== "pbkdf2-sha256-600000" ||
        !equal(await hash(password, salt), expected)
      )
        throw new AppError("비밀번호가 일치하지 않습니다.", 401);
      const token = await new SignJWT({ action, version: data.updated_at })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(id)
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(tokenKey());
      return response({ token });
    }
    if (
      route === "letters" &&
      ["POST", "PATCH", "DELETE"].includes(req.method)
    ) {
      await rate(req, "write");
      const body = await req.json();
      if (req.method === "POST") {
        const value = validateLetter(body);
        const slot = slotNumber(body.slot_number);
        const settings = await db
          .from("project_settings")
          .select("background_path")
          .eq("id", 1)
          .single();
        if (settings.error) throw Error();
        if (!settings.data.background_path)
          throw new AppError("먼저 추억 사진을 등록해 주세요.");
        const salt = crypto.randomUUID();
        const password_hash = `pbkdf2-sha256-600000$${salt}$${await hash(body.password, salt)}`;
        const { data, error } = await db
          .from("letters")
          .insert({ ...value, slot_number: slot, password_hash })
          .select(fields)
          .single();
        if (error?.code === "23505")
          throw new AppError("다른 분이 먼저 작성했어요.", 409);
        if (error) throw Error();
        return response(data, 201);
      }
      if (typeof body.id !== "string")
        throw new AppError("편지를 찾을 수 없어요.");
      const version = await permission(
        req,
        body.id,
        req.method === "PATCH" ? "edit" : "delete",
      );
      if (req.method === "PATCH") {
        const value = validateLetter(body, false);
        const { data, error } = await db
          .from("letters")
          .update({ ...value, updated_at: new Date().toISOString() })
          .eq("id", body.id)
          .eq("updated_at", version)
          .select(fields)
          .maybeSingle();
        if (error) throw Error();
        if (!data)
          throw new AppError(
            "다른 요청으로 편지가 변경됐어요. 다시 열어 주세요.",
            409,
          );
        return response(data);
      }
      const { data, error } = await db
        .from("letters")
        .delete()
        .eq("id", body.id)
        .eq("updated_at", version)
        .select("id")
        .maybeSingle();
      if (error) throw Error();
      if (!data)
        throw new AppError("편지가 변경됐어요. 다시 열어 주세요.", 409);
      return response({ ok: true });
    }
    return response({ error: "요청을 찾을 수 없어요." }, 404);
  } catch (error) {
    return response(
      {
        error:
          error instanceof AppError
            ? error.message
            : "요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      error instanceof AppError ? error.status : 500,
    );
  }
});
