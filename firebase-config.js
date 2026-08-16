/**
 * Firebase 설정 파일
 *
 * 1) Firebase Console > 프로젝트 설정 > 내 앱 > 웹 앱의 firebaseConfig 값을 아래에 붙여 넣으세요.
 * 2) Authentication > Sign-in method에서 Anonymous(익명)를 활성화하세요.
 * 3) Firestore Database를 만든 뒤 README의 Security Rules를 적용하세요.
 *
 * 설정하지 않으면 앱은 자동으로 로컬 연습 모드로 동작합니다.
 */

export const firebaseConfig = {
  apiKey: "AIzaSyBGz3gxlBPAg-v0BSIhgtqX7buFOWxs528",
  authDomain: "exp-stock-dc5c4.firebaseapp.com",
  projectId: "exp-stock-dc5c4",
  storageBucket: "exp-stock-dc5c4.firebasestorage.app",
  messagingSenderId: "962409021191",
  appId: "1:962409021191:web:ffaaab309178dd8f8f8fa2"
};


/**
 * 교사 화면 진입용 간단한 수업용 암호키입니다.
 * GitHub Pages의 프론트엔드 코드에 포함되므로 강력한 보안 비밀번호가 아니라
 * 학생의 실수/임의 진입을 막는 교실용 접근 장치로 사용하세요.
 * 나중에 바꾸려면 아래 teacherAccessKey 값만 수정하면 됩니다.
 */
export const appConfig = Object.freeze({
  teacherAccessKey: "235math"
});

export function hasFirebaseConfig() {
  const required = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.projectId,
    firebaseConfig.appId
  ];
  return required.every((value) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("YOUR_")
  );
}

export async function initializeFirebaseServices() {
  if (!hasFirebaseConfig()) {
    return { enabled: false, reason: "Firebase 설정값이 비어 있습니다." };
  }

  // 빌드 도구가 없는 GitHub Pages용: Firebase 공식 CDN의 modular SDK를 동적 import합니다.
  const SDK_VERSION = "12.17.1";
  const appModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`);
  const authModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`);
  const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`);

  const firebaseApp = appModule.initializeApp(firebaseConfig);
  const auth = authModule.getAuth(firebaseApp);
  await authModule.setPersistence(auth, authModule.browserLocalPersistence);

  if (!auth.currentUser) {
    await authModule.signInAnonymously(auth);
  }

  const db = firestoreModule.getFirestore(firebaseApp);

  return {
    enabled: true,
    firebaseApp,
    auth,
    db,
    authApi: authModule,
    firestoreApi: firestoreModule,
    sdkVersion: SDK_VERSION
  };
}
