# 지수 주식 실험실

중학생이 **백분율, 비율 변화, 반복 곱셈, 누적 수익률, 거듭제곱, 지수적 변화**를 직접 체험하는 교육용 웹앱입니다.

> 이 프로그램은 실제 투자 방법을 추천하거나 미래 주가를 예측하지 않습니다. 비율과 지수적 변화를 이해하기 위한 수학 시뮬레이션입니다.

## 1. 무엇이 GitHub Pages만으로 되고, 무엇이 Firebase가 필요한가요?

### GitHub Pages만으로 가능한 기능

- 혼자 연습
- seed 기반 동일 시장 생성
- 20라운드 게임
- 자산/누적 수익률 계산
- 시장 그래프
- 지수법칙 실험실
- 진행 상태 localStorage 저장 및 새로고침 복구

### Firebase가 있어야 가능한 기능

- 여러 기기가 같은 방 코드로 참여
- 방에 저장된 동일한 marketChanges 사용
- 학생 진행 상황 저장
- 교사 대시보드 실시간 갱신
- 학생별 판단 이유 저장
- 학생 결과 및 판단 과정 비교

Firebase 설정이 없거나 연결에 실패하면 앱은 자동으로 **로컬 연습 모드**로 동작합니다.

---

## 2. 파일 구조

```text
/
├── index.html
├── style.css
├── app.js
├── firebase-config.js
├── firestore.rules
└── README.md
```

빌드 도구가 필요하지 않습니다. GitHub Pages에서 저장소 루트를 그대로 배포할 수 있습니다.

---

## 3. GitHub Pages 배포 방법

1. GitHub에 로그인합니다.
2. 새 Repository를 만듭니다. 예: `exponent-stock-lab`
3. 이 폴더의 파일 6개를 저장소 루트에 업로드합니다.
4. `Settings` → `Pages`로 이동합니다.
5. `Build and deployment`의 Source에서 **Deploy from a branch**를 선택합니다.
6. Branch를 `main`, Folder를 `/(root)`로 선택하고 저장합니다.
7. 잠시 뒤 표시되는 Pages 주소에 접속합니다.
8. 주소 예시는 다음과 같습니다.

```text
https://사용자명.github.io/exponent-stock-lab/
```

모든 CSS/JS 경로는 `./style.css`, `./app.js`, `./firebase-config.js` 같은 상대경로이므로 Project Pages에서도 동작합니다.

---

## 4. Firebase 처음 연결하기

### 4-1. Firebase 프로젝트 만들기

1. Firebase Console에 로그인합니다.
2. `프로젝트 추가`를 눌러 새 프로젝트를 만듭니다.
3. 이 수업용 앱은 Google Analytics가 없어도 동작합니다.

### 4-2. 웹 앱 등록하기

1. 프로젝트 개요에서 `</>` 웹 아이콘을 선택합니다.
2. 앱 이름을 입력합니다. 예: `exponent-stock-lab-web`
3. Firebase Hosting은 체크하지 않아도 됩니다. 우리는 GitHub Pages를 사용합니다.
4. 등록 후 표시되는 `firebaseConfig` 객체의 값을 복사합니다.

### 4-3. firebase-config.js 수정하기

`firebase-config.js`의 아래 부분을 본인의 설정으로 교체합니다.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Firebase 웹 설정값이 브라우저 코드에 보이는 것은 정상입니다. 이 값을 비밀 서버 키처럼 숨기는 방식이 아니라 **Authentication과 Firestore Security Rules로 실제 접근 권한을 제한**해야 합니다.

### 4-4. Anonymous Authentication 켜기

1. Firebase Console → `Authentication`
2. 시작하기를 누릅니다.
3. `Sign-in method`에서 `Anonymous(익명)`을 활성화합니다.
4. 저장합니다.

학생은 회원가입 화면을 보지 않지만, 브라우저마다 익명 Firebase UID가 생깁니다. 앱은 이 UID를 학생 문서 ID로 사용하여 다른 학생의 기록을 덮어쓰지 못하게 합니다.

### 4-5. GitHub Pages 도메인 확인하기

Firebase Console → `Authentication` → `Settings` → `Authorized domains`에서 실제 배포 도메인을 확인합니다. GitHub Pages 기본 주소를 사용한다면 보통 다음과 같은 호스트 이름입니다.

```text
사용자명.github.io
```

필요한 경우 `Add domain`으로 추가합니다. 나중에 커스텀 도메인을 붙이면 그 도메인도 추가해 두는 것이 좋습니다.

### 4-6. Firestore 만들기

1. Firebase Console → `Firestore Database`
2. `데이터베이스 만들기`
3. 수업 장소와 가까운 리전을 선택합니다.
4. Rules는 곧 `firestore.rules` 내용으로 교체할 것이므로 임시 모드 선택보다 최종 Rules 적용이 중요합니다.

### 4-7. Security Rules 적용하기

1. Firestore → `Rules`
2. 기존 내용을 지웁니다.
3. 이 저장소의 `firestore.rules` 전체를 붙여 넣습니다.
4. `게시(Publish)`합니다.

이 Rules의 핵심은 다음과 같습니다.

- 로그인된 익명 사용자만 수업 데이터를 읽음
- 방 생성 시 만든 사람의 Auth UID가 `teacherUid`가 됨
- 방 문서는 생성 후 클라이언트에서 수정/삭제 불가
- 학생은 자기 UID와 같은 player 문서만 생성/수정 가능
- 다른 학생 문서를 수정하거나 삭제할 수 없음
- 판단 이유는 최대 200자
- 라운드 수와 숫자 필드에 기본 범위 검사 적용
- decision은 라운드별 하위 문서로 분리하여 규칙 검증을 단순화

> 교육용 클라이언트 앱이므로 악의적인 사용자가 개발자 도구로 자신의 점수 값을 조작하는 것까지 완벽히 막는 구조는 아닙니다. 중요한 평가 자료로 사용하려면 Cloud Functions 등 서버 검증이 추가로 필요합니다. 이 프로젝트는 수업 중 비교·탐구용 MVP에 초점을 둡니다.

### 4-8. GitHub에 수정한 firebase-config.js 올리기

설정 파일을 Commit/Push한 뒤 GitHub Pages가 새 버전을 배포하면 상단 배지가 `Firebase 연결됨`으로 바뀝니다.

---

## 5. 수업 운영 방법

### 교사

1. Pages 주소에 접속합니다.
2. `교사 모드`를 누릅니다.
3. `새 수업방 만들기`를 누릅니다.
4. 화면에 표시된 정보를 확인합니다.
   - 방 코드
   - 시장 시드
   - 참여 링크
   - 현재 참여 인원
5. 학생에게 방 코드 또는 참여 링크를 공유합니다.
6. 학생들이 참여하면 대시보드가 Firestore `onSnapshot`으로 갱신됩니다.
7. 학생 한 명의 `보기`를 누르면 판단 이유를 라운드별로 확인할 수 있습니다.
8. 비교 체크박스로 2명을 고른 뒤 `선택한 2명 비교`를 누르면 나란히 비교할 수 있습니다.

### 학생

1. 교사가 준 링크 또는 Pages 주소에 접속합니다.
2. `학생으로 참여`를 누릅니다.
3. 별명과 방 코드를 입력합니다.
4. 매 라운드 아래 중 하나를 고릅니다.
   - 100,000원 투자 추가
   - 100,000원 투자 회수
   - 유지
5. `왜 이렇게 선택했나요?`에 판단 이유를 적습니다.
6. `선택하고 다음 시장 보기`를 누르면 그 다음 시장 변화가 공개됩니다.
7. 20라운드 후 자신의 결과와 단순 전략 A/B/C를 비교합니다.

참여 링크는 다음 형태입니다.

```text
https://사용자명.github.io/저장소명/?room=MATH-4821
```

이 링크로 접속하면 방 코드가 자동 입력됩니다.

---

## 6. 같은 방 학생들이 왜 같은 시장을 보나요?

교사가 방을 만들 때 앱은 다음을 한 번 생성합니다.

```text
seed → seeded PRNG → 20개의 marketChanges
```

그리고 Firestore의 방 문서에 `seed`와 **생성 완료된 marketChanges 전체 배열**을 함께 저장합니다.

```text
rooms/{roomCode}
├── roomCode
├── seed
├── rounds
├── marketChanges[]
├── teacherUid
└── createdAt
```

학생은 방에 참여할 때 자기 기기에서 새로운 `Math.random()` 시장을 만드는 것이 아니라 **그 방 문서에 저장된 marketChanges를 읽습니다.** 따라서 스마트폰, 태블릿, 노트북이 달라도 같은 방이면 완전히 동일한 20개 변화를 사용합니다.

`seed`도 저장하므로 시장을 재현하거나 알고리즘을 확인할 수 있고, 실제 수업에서는 이미 저장된 배열을 기준으로 하므로 브라우저 구현 차이까지 최소화합니다.

---

## 7. Firestore 데이터 구조

```text
rooms
└── {roomCode}
    ├── roomCode
    ├── seed
    ├── rounds
    ├── marketChanges[]
    ├── teacherUid
    ├── createdAt
    └── players
        └── {firebaseAuthUid}
            ├── ownerUid
            ├── nickname
            ├── nicknameNormalized
            ├── currentRound
            ├── cash
            ├── investedValue
            ├── totalAssets
            ├── returnRate
            ├── buyCount
            ├── sellCount
            ├── holdCount
            ├── decisionCount
            ├── finished
            ├── updatedAt
            └── decisions
                └── r01, r02, ...
                    ├── round
                    ├── marketIndex
                    ├── previousChange
                    ├── action
                    ├── reason
                    ├── nextChange
                    ├── cashAfter
                    ├── investedBeforeChange
                    ├── investedAfter
                    ├── totalAssetsAfter
                    └── returnRateAfter
```

판단 기록을 큰 배열 하나가 아니라 라운드별 하위 문서로 둔 이유는 Security Rules에서 **200자 제한, 본인 문서만 쓰기, 문서 크기 관리**를 더 명확하게 하기 위해서입니다.

---

## 8. 시장 생성 알고리즘

`app.js`의 `generateMarketChanges(seed, rounds)`가 담당합니다.

- `xmur3`로 문자열 seed를 32비트 숫자로 바꿈
- `mulberry32` seeded PRNG 사용
- 같은 seed이면 같은 난수 순서
- 약 12%는 ±7~10% 수준 큰 변동
- 대부분은 -5~+5% 범위
- 아주 작은 양(+)의 drift 포함
- 20라운드에서는 충분히 전체 하락 가능

방 생성 시 결과 배열을 Firestore에 저장하므로 모든 학생에게 동일한 시장이 보장됩니다.

---

## 9. 한 라운드의 계산 순서

학생이 행동을 선택할 때는 **다음 시장 변화를 아직 모릅니다.**

예를 들어 투자 평가금액이 500,000원이고 이번에 100,000원을 추가한 뒤 다음 시장이 -3%라면:

```text
행동 직후 투자금 = 600,000원
시장 변화 = -3%
600,000 × 0.97 = 582,000원
```

현금이 400,000원이라면:

```text
총자산 = 400,000 + 582,000 = 982,000원
```

이 순서 덕분에 학생이 미래 변동을 보고 투자하는 상황을 막습니다.

---

## 10. 수정하기 쉬운 설정값

`app.js` 맨 위의 `SETTINGS`에서 바꿀 수 있습니다.

```js
const SETTINGS = Object.freeze({
  STARTING_CASH: 1_000_000,       // 시작 자산
  INVESTMENT_STEP: 100_000,       // 한 번 투자/회수 금액
  TOTAL_ROUNDS: 20,               // 기본 라운드 수
  START_INDEX: 100,               // 시작 시장 지수
  REASON_MAX_LENGTH: 200,         // 판단 이유 최대 글자 수
  STRATEGY_A_INITIAL: 500_000,    // 전략 A의 최초 투자 금액
  ROOM_PREFIX: "MATH",
  LOCAL_ROOM_PREFIX: "LOCAL"
});
```

### 시장 변동성 바꾸기

`generateMarketChanges()` 안에서 조정합니다.

```js
if (shockRoll < 0.12) {
  // 큰 변동 확률 12%
  const magnitude = 7 + rng() * 3; // 7~10%
}
```

일반 변동 범위는 다음 부분입니다.

```js
const centered = ((rng() + rng() + rng()) / 3 - 0.5) * 10;
pct = clamp(centered + 0.16, -5, 5);
```

`0.16`은 약한 양의 drift입니다. 이 값을 크게 하면 장기적으로 상승 쪽으로 더 기울고, 0에 가깝게 하면 방향성이 약해집니다.

> `TOTAL_ROUNDS`를 20보다 크게 바꿀 경우 Firestore Rules의 `rounds <= 50` 범위 안에서 사용하세요. 50을 넘기려면 Rules도 함께 수정해야 합니다.

---

## 11. 전략 비교의 정의

현재 코드는 동일한 시장에서 다음을 비교합니다.

- 전략 A: 처음 500,000원 투자 후 끝까지 유지
- 전략 B: 현금이 있는 동안 매 라운드 100,000원 투자
- 전략 C: 현금 1,000,000원 유지
- 전략 D: 학생의 실제 선택

“최고의 전략”이라고 표현하지 않고, **이번 시장에서 어떤 전략의 결과가 가장 높았으며 그 이유를 시장 흐름과 투자 시점으로 설명하도록** 설계했습니다.

---

## 12. 새로고침 복구

게임 상태는 매 라운드 `localStorage`에도 저장됩니다.

- 같은 브라우저에서 새로고침 → 홈의 `저장된 진행 발견`에서 이어하기
- Firestore가 잠시 끊겨도 현재 브라우저의 개인 진행은 남음
- Firebase 익명 인증은 브라우저 local persistence를 사용하여 같은 브라우저에서 같은 UID를 유지하도록 설정

다른 기기에서 “그 학생의 중간 진행 상태 자체를 이어서 조작”하려면 별도 로그인/복구 코드가 필요합니다. 현재 버전은 개인정보를 최소화하기 위해 계정 로그인을 만들지 않았고, 대신 같은 방의 **시장 데이터**는 어느 기기에서나 동일하게 재현됩니다.

---

## 13. 수업 전에 점검할 것

- Pages 주소에서 CSS가 정상 적용되는가
- 상단 배지가 `Firebase 연결됨`인지
- Firebase Authentication의 Anonymous가 활성화되어 있는지
- Firestore Rules가 게시되어 있는지
- 교사 기기에서 방 생성이 되는지
- 학생 기기 2대로 같은 방에 들어가 시장 시드가 같은지
- 두 학생의 첫 시장 변동이 정확히 같은지
- 교사 화면에 학생 두 명이 각각 별도 행으로 나타나는지
- 같은 별명을 입력하면 안내가 나오는지
- 판단 이유가 교사 상세 화면에서 보이는지
- 20라운드 완료 후 전략 비교와 지수법칙 실험실이 보이는지

---

## 14. 수업용 권장 진행

1. 교사가 방 생성
2. 학생들이 별명으로 입장
3. 1~5라운드: 행동과 이유를 빠르게 기록
4. 중간에 “+와 -를 그냥 더해도 되는가?” 질문
5. 20라운드 완료
6. 같은 반 결과 비교
7. 판단 이유가 달랐던 두 학생 비교
8. 지수법칙 실험실 3개 확인
9. `+10%, -10%`와 `-50% 뒤 회복`을 식으로 정리

핵심 질문은 “누가 돈을 가장 많이 벌었나?”보다 **“왜 변화율은 덧셈이 아니라 곱셈으로 누적되는가?”**, **“같은 시장인데 왜 결과가 달라졌는가?”**에 두는 것이 좋습니다.
