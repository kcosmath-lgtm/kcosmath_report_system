# 시험지 타이핑

`/typing`에서 PDF/JPG/PNG/WebP를 올리고 페이지를 선택해 인식합니다.
OCR은 `gemini-3.1-flash-lite`에 고정되어 있으며 다른 모델로 대체하지 않습니다.
로그인과 학원 가입을 확인한 서버 API만 호출할 수 있습니다.

## 설정

- API 키는 서버 환경변수 `GEMINI_API_KEY`에서만 읽습니다. 로컬은 `.env.local`에 설정한 뒤 개발 서버를 재시작하고, Vercel은 프로젝트 Settings → Environment Variables에 같은 이름으로 등록한 뒤 재배포합니다. Production/Preview 환경을 필요한 범위에 지정합니다. `NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 화면에는 키 입력란이 없고, 클라이언트가 보낸 키는 무시합니다. 키는 브라우저로 전달하거나 브라우저 저장소에 저장하지 않습니다.
- 학원 저장을 사용하려면 `supabase/migrations/202610080001_typing_documents.sql`을 기존 마이그레이션 이후 적용합니다.
- 사용 권한 제한에는 이어서 `202610080002_typing_access.sql`을 적용합니다. `kcosmath@gmail.com`으로 이미 로그인한 계정만 권한 관리자로 등록합니다. 해당 계정은 **설정 → 시험지 타이핑 사용 권한**에서 학원 가입 사용자를 허용·차단할 수 있습니다. 새 학원의 소유자나 신규 강사에게 자동으로 허용하지 않습니다.
- 관리자 이메일 계정이 아직 `auth.users`에 없다면 먼저 로그인한 뒤 다음 초기화 구문만 SQL Editor에서 실행합니다: `INSERT INTO public.cosmath_typing_access(user_id,can_manage) SELECT id,true FROM auth.users WHERE lower(email)='kcosmath@gmail.com' ON CONFLICT (user_id) DO UPDATE SET can_manage=true;`
- 권한 확인 실패·마이그레이션 미적용 시 화면과 OCR은 차단됩니다. 서버는 매 OCR 요청마다 DB 권한을 확인하며 개인 API 키를 넣어도 우회할 수 없습니다. 시험지 DB의 RLS에도 동일한 권한을 적용합니다. 권한 회수는 다음 요청부터 적용하며 진행 중인 Gemini 요청과 이미 다운로드한 파일은 취소하지 않습니다.
- `npm install` 시 PDF.js와 같은 버전의 워커를 `public/typing/`으로 복사합니다.
- OCR에 올린 페이지 이미지가 Google Gemini로 전달됩니다. 미리보기용 원본은 학원 DB에 저장하지 않습니다.

## 편집과 출력

- 본문/보기/선지를 수정하고 `$...$`, `$$...$$`로 수식을 작성합니다. 문항 이동, 번호 정리, 그림 첨부를 지원합니다.
- A4 2단, 중앙 구분선, 왼쪽 위→아래/오른쪽 위→아래 배치입니다. 기본 4문항이며 2/6문항도 선택할 수 있습니다.
- Word `.docx`: LaTeX → KaTeX MathML → OMML 수식 객체. 본문과 수식 편집 가능.
- 한글 `.hwpx`: LaTeX → MathML 트리 → 한컴 수식 스크립트의 `hp:equation`. 본문과 수식 편집 가능. 구형 바이너리 `.hwp`가 필요하면 한글에서 열고 다른 이름으로 저장합니다.
- PDF: 브라우저 인쇄 대화상자에서 PDF로 저장합니다. 배경을 이미지로 굳히지 않아 본문 검색/선택이 가능합니다. Word/한글과 같은 수식 객체 편집은 PDF에서 제공하지 않습니다. 인쇄 배율 100%, 용지 A4, 머리글/바닥글 끄기를 권장합니다.
- 지원하지 않는 한컴 수식 트리나 잘못된 LaTeX는 내보내기를 중단하고 오류를 표시합니다. 그림은 자동 재작성하지 않고 첨부가 필요하다고 표시합니다.
- 학원 저장은 버전 비교로 동시 수정 충돌을 감지합니다. 작성 중인 내용은 계정·학원별 브라우저 임시 저장 및 편집본 JSON 다운로드/열기도 지원합니다.
- 원본 미리보기는 새로고침 후 다시 올려야 합니다. 인식한 문항과 직접 첨부한 그림은 편집본에 포함됩니다.

## 검증 범위

문서 ZIP/XML 구조, 수식 객체 및 주요 수식 변환을 자동 검증합니다. Chrome에서 편집·DOCX/HWPX 다운로드·PDF 한 페이지 출력·텍스트 추출·PDF 업로드·모바일 화면을 검증했습니다. 실제 Word에서 예시 파일 열기, 수식 9개 및 한 페이지 인식도 확인했습니다. Word의 재저장과 한컴오피스 검증은 이 환경의 숨김 자동화가 응답하지 않아 완료하지 못했습니다. 한글은 별도 HWPX 파서로 문서 읽기까지 확인했습니다. 편집 앱의 글꼴과 수식 조판에 따라 화면 미리보기와 줄바꿈이 달라질 수 있습니다.

`node scripts/typing-review-fixtures.cjs`로 실제 앱 확인용 예시 파일을 `.local-backups/typing-review/`에 만들 수 있습니다. 빈 HWPX 템플릿은 `node scripts/create-typing-template.mjs`로 다시 생성할 수 있습니다.

HWPX 빈 문서 템플릿은 Apache-2.0 `ownhwpx`의 BlankFileMaker로 생성했습니다. Word 수식 변환은 LGPL-3.0-or-later `mathml2omml`을 의존성으로 사용합니다.
