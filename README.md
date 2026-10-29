# 팀장님께 전하는 마음

모바일 롤링페이퍼. Next.js + TypeScript 정적 내보내기, GitHub Pages, Supabase Database / Storage / Edge Functions.

## 실행

```bash
npm ci
npm run dev
```

`/edit/`: 사진 등록과 편지 작성. `/view/`: 완성본 읽기 전용. 루트 주소도 편집 화면입니다.

Supabase 빌드 변수가 없으면 **체험 모드**로 동작합니다. 사진과 편지는 해당 브라우저 localStorage에만 남고 다른 기기와 공유되지 않습니다. 실제 서비스 데이터와 분리됩니다. 브라우저 저장소를 비우면 체험 데이터가 삭제됩니다. 체험 모드의 비밀번호 검증은 보안 경계가 아니며 실제 서비스는 서버에서 검증합니다.

## 1. Supabase 연결

1. Supabase 프로젝트를 만들고 SQL Editor에서 `supabase/schema.sql`을 실행합니다. 한 프로젝트당 롤링페이퍼 한 개입니다.
2. CLI를 설치하고 로그인한 다음 프로젝트를 연결합니다.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

3. Supabase Dashboard → Edge Functions → Secrets에 아래 항목을 설정합니다. 비밀값은 충분히 긴 무작위 값(32바이트 이상)으로 생성하고 서로 다르게 사용하세요. 채팅이나 Git에 기록하지 마세요.

| 서버 비밀값 | 값 |
| --- | --- |
| `LETTER_PASSWORD_PEPPER` | 비밀번호 해시에 추가할 무작위 비밀값 |
| `LETTER_AUTH_SECRET` | 편지별 5분 권한 서명과 요청 제한에 사용하는 별도 비밀값 |
| `ALLOWED_ORIGIN` | `https://계정명.github.io` (경로와 마지막 `/` 제외) |

`SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 함수 런타임의 기본 제공 환경변수를 사용합니다. 서비스 역할 키는 프론트엔드에 넣지 않습니다.

4. 함수를 배포합니다.

```bash
npx supabase functions deploy warm-letter --no-verify-jwt
```

익명 이용 서비스이므로 플랫폼 JWT 게이트는 끄고, 서버의 편지별 비밀번호 인증·권한 검증·요청 제한을 적용합니다. CORS는 `ALLOWED_ORIGIN` 한 개만 허용합니다. CORS 자체는 사용자 인증이 아닙니다.

5. 로컬 연결 시 `.env.example`을 `.env.local`로 복사해 공개 URL과 anon/publishable key를 입력합니다. 이 키는 DB 직접 접근 권한이 없습니다. 로컬 시험에서는 서버 `ALLOWED_ORIGIN`을 로컬 URL에 맞춰야 하므로 운영 프로젝트와 시험 프로젝트를 분리하는 것을 권장합니다.

## 2. GitHub Pages 배포

1. GitHub 저장소 **Settings → Pages → Build and deployment → Source → GitHub Actions**를 선택합니다.
2. **Settings → Secrets and variables → Actions → Variables**에 아래 공개 빌드 변수를 등록합니다.

| 변수 | 예시 |
| --- | --- |
| `NEXT_PUBLIC_BASE_PATH` | 프로젝트 저장소면 `/JibeenCodex`, `계정명.github.io` 저장소나 전용 도메인이면 `/` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://프로젝트.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 또는 publishable key |

경로 변수는 생략 시 GitHub Actions에서 저장소명을 기준으로 자동 설정됩니다. 전용 도메인 사용 시 `/`로 지정하세요.

Supabase 두 변수를 생략하면 **기기 내 체험 모드**로 배포됩니다. 실제 공동 작성·공유를 하려면 두 변수가 모두 필요합니다.

3. 코드를 `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 빌드하여 `out/`을 GitHub Pages에 배포합니다. 워크플로를 수동 실행할 수도 있습니다.
4. 프로젝트 저장소 주소는 `https://계정명.github.io/저장소명/edit/`와 `https://계정명.github.io/저장소명/view/`입니다. 실제 배포 성공은 Actions 결과에서 확인하세요.

로컬에서 같은 경로를 검증할 때:

```bash
NEXT_PUBLIC_BASE_PATH=/JibeenCodex npm run build
```

## 기능 및 보호

- 고정된 자연스러운 위치의 봉투 정확히 5개, 봉투 opacity 0.6, 별도 불투명 하트
- 최초 사진 1회: JPG/PNG/WebP, 10MB, 서버 실제 디코딩 후 JPEG 최적화
- 사진 등록은 DB 원자적 예약, 5분 만료 및 실패 복구로 동시 등록 방지
- 닉네임 1~20자 / 내용 1~2000자, 앞뒤 공백 제거, 한글·조합 이모지 grapheme 단위 검사
- UNIQUE 슬롯으로 선착순 저장, 충돌 시 입력값 보존
- 숫자 4자리 비밀번호, PBKDF2-HMAC-SHA256 600,000회 + 개별 salt + 서버 pepper
- 검증 성공 시 편지 ID·작업·버전이 제한된 5분 JWT 발급
- 수정·삭제 시 서버 JWT 확인과 낙관적 동시성 검사
- DB 공유 요청 제한: 인증 분당 5회, 쓰기 분당 20회, 업로드 분당 5회(IP 기반)
- DB 전 테이블 RLS, 공개 역할 직접 접근 금지, Storage 비공개 + 1시간 서명 URL
- 본문은 React 텍스트로 렌더링하여 HTML 실행 차단
- 모바일 전체화면 편지, 독립 본문 스크롤, 안전 영역, 포커스 순환, 동작 감소 설정

4자리 비밀번호는 내용 비공개용이 아니라 편집 제어용입니다. 편지는 링크를 아는 누구나 읽을 수 있습니다. 사진을 먼저 등록한 후 작성 링크를 팀원들에게 공유하세요.

## 검증

```bash
npm test
npm run typecheck
npm run build
```

Edge Function 타입 검사:

```bash
npx deno check --config supabase/deno.json --no-lock supabase/functions/warm-letter/index.ts
```

실제 Supabase 계정에서 SQL 적용·함수 배포 후에는 별도 브라우저 두 개에서 같은 슬롯 저장 시 한 요청만 성공하는지, 등록된 사진의 재등록 거부, 인증 제한, 서버 토큰 없는 수정·삭제 거부를 확인하세요. 계정 연결 전에는 실제 DB·Storage·동시 요청 동작을 검증할 수 없습니다.
