"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Heart,
  ImagePlus,
  LockKeyhole,
  Mail,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AppState, Letter, count } from "@/lib/validation";
import {
  authenticate,
  connected,
  deleteLetter,
  getState,
  saveLetter,
  uploadPhoto,
} from "@/lib/client";
type Panel = "write" | "read" | "auth" | "delete" | null;
const places = [
  { left: "13%", top: "17%", rotate: "-12deg" },
  { left: "58%", top: "25%", rotate: "10deg" },
  { left: "34%", top: "47%", rotate: "-5deg" },
  { left: "9%", top: "70%", rotate: "8deg" },
  { left: "62%", top: "75%", rotate: "-9deg" },
];
export default function LetterApp({ mode }: { mode: "edit" | "view" }) {
  const [state, setState] = useState<AppState>({
    background: null,
    letters: [],
    demo: !connected,
  });
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [slot, setSlot] = useState(1);
  const [nickname, setNickname] = useState("");
  const [content, setContent] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [action, setAction] = useState<"edit" | "delete">("edit");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [tour, setTour] = useState(false);
  const [fromEditor, setFromEditor] = useState(false);
  const [share, setShare] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const escapeHandler = useRef<() => void>(() => {});
  const modalOpen = !!(panel || photo || share);
  const edit = mode === "edit";
  const letter = state.letters.find((x) => x.slot_number === slot);
  const isUpdate = panel === "write" && !!letter;
  async function refresh() {
    const data = await getState();
    setState(data);
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    setFromEditor(sessionStorage.getItem("warm-preview") === "yes");
    const listener = () => refresh().catch(() => {});
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!modalOpen) return;
    lastFocus.current = document.activeElement as HTMLElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") escapeHandler.current();
      if (e.key === "Tab") {
        const items = modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", keys);
      lastFocus.current?.focus();
    };
  }, [modalOpen]);
  function close() {
    if (busy) return;
    if (
      panel === "write" &&
      (nickname.trim() !== (letter?.nickname || "") ||
        content.trim() !== (letter?.content || "")) &&
      !window.confirm(
        "작성 중인 편지를 닫을까요? 저장하지 않은 내용은 사라져요.",
      )
    )
      return;
    setPanel(null);
    setPassword("");
    setToken("");
    setError("");
  }
  escapeHandler.current = () => {
    if (busy) return;
    if (photo) {
      setPhoto(null);
      setError("");
    } else if (share) setShare(false);
    else close();
  };
  function open(index: number) {
    setSlot(index);
    setError("");
    setToken("");
    setPassword("");
    const found = state.letters.find((x) => x.slot_number === index);
    if (found) setPanel("read");
    else if (edit) {
      setNickname("");
      setContent("");
      setPanel("write");
    } else setToast("아직 편지가 도착하지 않았어요.");
  }
  async function pickPhoto(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw Error("10MB 이하의 사진을 선택해 주세요.");
      const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const valid =
        (signature[0] === 255 &&
          signature[1] === 216 &&
          signature[2] === 255) ||
        (signature[0] === 137 &&
          signature[1] === 80 &&
          signature[2] === 78 &&
          signature[3] === 71) ||
        (String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...signature.slice(8, 12)) === "WEBP");
      if (!valid) throw Error("JPG, PNG, WebP 사진만 등록할 수 있어요.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setPhoto({ file, url: canvas.toDataURL("image/webp", 0.83) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 읽을 수 없어요.");
    }
  }
  async function register() {
    if (!photo) return;
    setBusy(true);
    setError("");
    try {
      await uploadPhoto(photo.file, photo.url);
      await refresh();
      setPhoto(null);
      setTour(false);
      setToast("우리의 추억이 담겼어요. 이제 편지를 남겨 주세요.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveLetter(
        slot,
        nickname,
        content,
        password,
        isUpdate ? letter : undefined,
        token,
      );
      await refresh();
      setPanel(null);
      setToken("");
      setPassword("");
      setToast(
        isUpdate ? "편지를 수정했어요." : "소중한 마음을 봉투에 담았어요.",
      );
    } catch (e) {
      setError((e as Error).message);
      refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function auth(e: React.FormEvent) {
    e.preventDefault();
    if (!letter) return;
    setBusy(true);
    setError("");
    try {
      const value = await authenticate(letter, password, action);
      setToken(value);
      setPassword("");
      setNickname(letter.nickname);
      setContent(letter.content);
      setPanel(action === "edit" ? "write" : "delete");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!letter) return;
    setBusy(true);
    try {
      await deleteLetter(letter, token);
      await refresh();
      setPanel(null);
      setToken("");
      setToast("편지가 삭제되었어요.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function beginAuth(value: "edit" | "delete") {
    setAction(value);
    setError("");
    setPassword("");
    setPanel("auth");
  }
  const needsPhoto = !state.background && !tour;
  const written = state.letters.length;
  const shareUrl = () =>
    `${location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/view/`;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href={edit ? "/edit/" : "/view/"} className="brand">
          <span className="brand-icon">
            <Mail size={18} />
            <Heart size={8} fill="currentColor" />
          </span>
          <span>
            마음을 담아<span className="brand-sub">WARM LETTER</span>
          </span>
        </Link>
        <div className="top-actions">
          {edit ? (
            <Link
              className="preview-link"
              href="/view/"
              onClick={() => sessionStorage.setItem("warm-preview", "yes")}
            >
              <span>완성본 미리보기</span>
              <ArrowRight size={15} />
            </Link>
          ) : fromEditor ? (
            <Link
              className="preview-link"
              href="/edit/"
              onClick={() => sessionStorage.removeItem("warm-preview")}
            >
              <ArrowLeft size={15} />
              편집으로 돌아가기
            </Link>
          ) : (
            <span className="gift-label">FOR YOU, WITH LOVE</span>
          )}
        </div>
      </header>
      <main>
        <section className="intro">
          <div className="eyebrow">
            <span /> OUR LITTLE POST OFFICE <span />
          </div>
          <h1>
            팀장님께 전하는{" "}
            <span>
              마음
              <svg viewBox="0 0 130 13" aria-hidden="true">
                <path d="M3 9 Q65 -2 127 7 M9 12 Q67 3 119 10" />
              </svg>
            </span>
            <Heart className="title-heart" size={20} />
          </h1>
          <p>
            {edit ? (
              <>
                함께한 시간은 추억이 되고,
                <br className="mobile-break" /> 전하지 못한 마음은 편지가
                됩니다.
              </>
            ) : (
              <>
                함께 웃었던 날들, 그리고 고마웠던 순간들.
                <br />
                다섯 사람의 마음을 여기에 담았어요.
              </>
            )}
          </p>
        </section>
        {loading ? (
          <div className="loading">
            <Mail className="pulse" />
            <p>마음을 담을 우편함을 열고 있어요…</p>
          </div>
        ) : (
          <>
            <section
              className={`memory-frame ${needsPhoto ? "setup-frame" : ""}`}
              aria-label="추억 사진과 다섯 개의 편지봉투"
            >
              <span className="tape tape-top" />
              <span className="tape tape-bottom" />
              <div
                className="photo-board"
                style={
                  state.background
                    ? { backgroundImage: `url("${state.background}")` }
                    : undefined
                }
              >
                {!state.background && (
                  <div className="scenery" aria-hidden="true">
                    <div className="sun" />
                    <div className="mountain back" />
                    <div className="mountain front" />
                    <div className="ground" />
                    <div className="tree tree-one" />
                    <div className="tree tree-two" />
                    <span className="scene-note">a place for our memories</span>
                  </div>
                )}
                <div className="photo-wash" />
                <span className="photo-date">OUR DAYS, FOREVER</span>
                {needsPhoto ? (
                  <div className="upload-card">
                    <span className="upload-emblem">
                      <ImagePlus size={27} strokeWidth={1.3} />
                      <span>+</span>
                    </span>
                    <span className="tiny-label">처음, 우리의 추억 한 장</span>
                    <h2>
                      어떤 순간을
                      <br />
                      기억하고 싶으세요?
                    </h2>
                    <p>
                      함께한 사진 위에
                      <br />
                      다섯 통의 편지를 놓아둘게요.
                    </p>
                    {edit ? (
                      <>
                        <label className="button primary photo-picker">
                          <Plus size={17} />
                          추억 사진 고르기
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              pickPhoto(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <span className="file-hint">
                          JPG · PNG · WebP / 최대 10MB
                        </span>
                        <div className="upload-note">
                          <LockKeyhole size={12} />한 번 등록한 사진은 바꿀 수
                          없어요.
                        </div>
                      </>
                    ) : (
                      <p className="waiting-note">
                        아직 추억을 준비하고 있어요.
                        <br />
                        편지가 도착할 때 다시 만나요.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="envelope-field">
                    {places.map((place, index) => {
                      const item = state.letters.find(
                        (x) => x.slot_number === index + 1,
                      );
                      return (
                        <button
                          key={index}
                          className={`envelope-wrap ${item ? "filled" : ""}`}
                          style={
                            {
                              left: place.left,
                              top: place.top,
                              "--rotation": place.rotate,
                            } as React.CSSProperties
                          }
                          onClick={() => open(index + 1)}
                          aria-label={`${index + 1}번 봉투, ${item ? `${item.nickname}님의 편지 읽기` : edit ? "새 편지 쓰기" : "아직 도착하지 않은 편지"}`}
                        >
                          <span className="envelope">
                            <span className="envelope-back" />
                            <span className="envelope-flap" />
                            <span className="envelope-front" />
                            <span className="envelope-side" />
                          </span>
                          {item ? (
                            <span className="heart-seal">
                              <Heart
                                size={23}
                                fill="currentColor"
                                strokeWidth={1.4}
                              />
                            </span>
                          ) : (
                            <span className="envelope-plus">
                              <Plus size={19} strokeWidth={1.2} />
                            </span>
                          )}
                          <span className="envelope-caption">
                            {item
                              ? `from. ${item.nickname}`
                              : `마음 ${String(index + 1).padStart(2, "0")}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="photo-caption">
                <span>함께여서 참 좋은 날들</span>
                <Heart size={14} strokeWidth={1.3} />
              </div>
            </section>
            {error && !panel && !photo && (
              <p role="alert" className="page-error">
                {error}
                <button
                  onClick={() => {
                    setLoading(true);
                    refresh()
                      .then(() => setError(""))
                      .catch((e) => setError(e.message))
                      .finally(() => setLoading(false));
                  }}
                >
                  다시 시도
                </button>
              </p>
            )}
            <section className="board-footer">
              {needsPhoto ? (
                <>
                  <p className="footer-lead">
                    <Heart size={15} />
                    작은 사진 한 장에서, 우리의 이야기가 시작돼요.
                  </p>
                  {edit && (
                    <button
                      className="text-button"
                      onClick={() => setTour(true)}
                    >
                      사진 없이 먼저 둘러보기
                      <ChevronRight size={14} />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="progress-heading">
                    <span>
                      {edit
                        ? "봉투를 눌러 마음을 남겨 주세요."
                        : "봉투를 열어 우리의 마음을 읽어 주세요."}
                    </span>
                    <span className="progress-count">
                      <b>{written}</b> / 5
                    </span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${written * 20}%` }} />
                  </div>
                  <p className="progress-description">
                    {written === 5
                      ? "다섯 통의 마음이 모두 모였어요."
                      : `${written}통의 마음이 도착했어요.`}
                  </p>
                  {edit && !state.background && (
                    <label className="button primary inline-upload">
                      <ImagePlus size={16} />
                      사진 등록하고 편지 쓰기
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => pickPhoto(e.target.files?.[0])}
                      />
                    </label>
                  )}
                  {edit && state.background && (
                    <button
                      className="text-button"
                      onClick={() => setShare(true)}
                    >
                      <Copy size={14} />
                      완성본 링크 복사하기
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        )}
        <div className="gentle-divider">
          <span />
          <Heart size={11} />
          <span />
        </div>
        <footer className="footer">
          <p>고마웠던 마음이, 오래도록 닿기를.</p>
          <span>MADE OF MEMORIES & A LITTLE LOVE</span>
        </footer>
        {!connected && (
          <aside className="demo-notice">
            <span className="demo-dot" />
            <p>
              <strong>체험 모드</strong> · 이 브라우저에만 저장돼요.
              <br />
              함께 쓰려면 Supabase 연결이 필요해요.
            </p>
          </aside>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {(panel || photo || share) && (
        <div className="modal-backdrop">
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className={`letter-modal ${panel === "read" || panel === "write" ? "full-paper" : "compact-paper"}`}
          >
            <div className="paper-top">
              <span>
                {photo
                  ? "OUR FIRST MEMORY"
                  : share
                    ? "A GIFT FOR YOU"
                    : `LETTER NO. ${String(slot).padStart(2, "0")}`}
              </span>
              <button
                className="icon-button"
                ref={closeRef}
                onClick={() => {
                  if (photo) {
                    if (!busy) {
                      setPhoto(null);
                      setError("");
                    }
                  } else if (share) setShare(false);
                  else close();
                }}
                disabled={busy}
                aria-label="닫기"
              >
                <X size={22} />
              </button>
            </div>
            {photo ? (
              <>
                <h2 id="dialog-title">이 순간을 간직할까요?</h2>
                <p className="dialog-sub">
                  등록 후에는 사진을 바꿀 수 없어요.
                  <br />
                  팀원들과 함께한 사진인지 한 번 더 확인해 주세요.
                </p>
                <img
                  className="photo-preview"
                  src={photo.url}
                  alt="등록할 추억 사진 미리보기"
                />
                <p className="privacy-note">
                  <LockKeyhole size={13} />
                  사진은 최초 한 번만 등록할 수 있어요.
                </p>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={register}
                >
                  {busy ? "추억을 담고 있어요…" : "이 사진으로 시작하기"}
                  <ArrowRight size={17} />
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setPhoto(null)}
                >
                  다른 사진 고르기
                </button>
              </>
            ) : share ? (
              <>
                <div className="dialog-mark">
                  <Mail size={30} />
                </div>
                <h2 id="dialog-title">마음을 전할 준비가 됐어요</h2>
                <p className="dialog-sub">
                  이 링크에서는 편지를 읽기만 할 수 있어요.
                </p>
                {!connected ? (
                  <p className="error">
                    체험 모드의 편지는 다른 기기에서 볼 수 없어요. Supabase 연결
                    후 링크를 전달해 주세요.
                  </p>
                ) : (
                  <>
                    <input
                      className="share-input"
                      readOnly
                      value={typeof window !== "undefined" ? shareUrl() : ""}
                      aria-label="완성본 링크"
                    />
                    <button
                      className="button primary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareUrl());
                          setToast("완성본 링크를 복사했어요.");
                          setShare(false);
                        } catch {
                          setError("링크를 길게 눌러 직접 복사해 주세요.");
                        }
                      }}
                    >
                      <Copy size={17} />
                      링크 복사하기
                    </button>
                    {error && <p className="error">{error}</p>}
                  </>
                )}
              </>
            ) : panel === "read" && letter ? (
              <>
                <div className="letter-heading">
                  <span className="tiny-label">DEAR OUR TEAM LEADER</span>
                  <h2 id="dialog-title">팀장님께,</h2>
                  <Heart size={20} className="paper-heart" />
                </div>
                <div className="letter-body">{letter.content}</div>
                <div className="letter-signature">
                  <span>고마운 마음을 담아,</span>
                  <strong>{letter.nickname} 드림</strong>
                </div>
                <div className="letter-bottom">
                  {edit ? (
                    <>
                      <button
                        className="text-button"
                        onClick={() => beginAuth("edit")}
                      >
                        <PenLine size={15} />
                        수정하기
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() => beginAuth("delete")}
                      >
                        <Trash2 size={14} />
                        삭제하기
                      </button>
                    </>
                  ) : (
                    <button className="button secondary" onClick={close}>
                      마음에 간직하고 닫기
                      <Heart size={15} />
                    </button>
                  )}
                </div>
              </>
            ) : panel === "write" ? (
              <form onSubmit={save} className="letter-form">
                <div className="letter-heading">
                  <span className="tiny-label">
                    A LITTLE LETTER, A LOT OF LOVE
                  </span>
                  <h2 id="dialog-title">팀장님께,</h2>
                </div>
                <label className="field-label" htmlFor="nickname">
                  보내는 사람<span>{count(nickname)} / 20</span>
                </label>
                <input
                  id="nickname"
                  autoComplete="nickname"
                  placeholder="팀장님이 알아볼 수 있는 이름"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  disabled={busy}
                  required
                />
                <label className="field-label" htmlFor="content">
                  전하고 싶은 마음
                  <span>{count(content).toLocaleString()} / 2,000</span>
                </label>
                <textarea
                  id="content"
                  className="writing-area"
                  placeholder={
                    "고마웠던 순간, 함께했던 추억,\n그리고 앞으로의 응원을 자유롭게 적어 주세요.\n\n서툰 문장이어도 괜찮아요.\n진심은 언제나 전해지니까요."
                  }
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={busy}
                  required
                />
                {!isUpdate && (
                  <div className="password-section">
                    <label className="field-label" htmlFor="new-password">
                      <span className="label-icon">
                        <LockKeyhole size={13} />
                        나만의 비밀번호
                      </span>
                    </label>
                    <input
                      id="new-password"
                      className="pin-input"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      autoComplete="new-password"
                      placeholder="숫자 4자리"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value.replace(/\D/g, ""))
                      }
                      disabled={busy}
                      required
                    />
                    <p className="input-hint">
                      편지를 수정하거나 삭제할 때 필요해요.
                    </p>
                  </div>
                )}
                {!state.background && (
                  <p className="error">
                    먼저 메인 화면에서 추억 사진을 등록해 주세요.
                  </p>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={busy || !state.background}
                  type="submit"
                >
                  {busy
                    ? "마음을 담고 있어요…"
                    : isUpdate
                      ? "수정한 마음 저장하기"
                      : "마음을 봉투에 담기"}
                  <Heart size={16} />
                </button>
                <p className="form-note">
                  편지는 링크를 아는 누구나 읽을 수 있어요.
                </p>
              </form>
            ) : panel === "auth" ? (
              <form onSubmit={auth}>
                <div className="dialog-mark">
                  <LockKeyhole size={28} strokeWidth={1.3} />
                </div>
                <h2 id="dialog-title">당신의 편지인가요?</h2>
                <p className="dialog-sub">
                  편지를 작성할 때 설정한
                  <br />
                  숫자 4자리 비밀번호를 입력해 주세요.
                </p>
                <label className="sr-only" htmlFor="auth-password">
                  비밀번호
                </label>
                <input
                  id="auth-password"
                  className="pin-input auth-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value.replace(/\D/g, ""))
                  }
                  required
                  disabled={busy}
                  placeholder="••••"
                />
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button className="button primary" disabled={busy}>
                  {busy ? "확인하고 있어요…" : "비밀번호 확인"}
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setPanel("read");
                    setError("");
                  }}
                >
                  편지로 돌아가기
                </button>
              </form>
            ) : panel === "delete" ? (
              <>
                <div className="dialog-mark">
                  <Trash2 size={28} strokeWidth={1.3} />
                </div>
                <h2 id="dialog-title">편지를 삭제하시겠어요?</h2>
                <p className="dialog-sub">
                  삭제한 편지는 복구할 수 없습니다.
                  <br />
                  봉투는 다시 빈 봉투로 돌아가요.
                </p>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={remove}
                >
                  {busy ? "삭제하고 있어요…" : "편지 삭제"}
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setPanel("read")}
                >
                  취소하고 편지 간직하기
                </button>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
