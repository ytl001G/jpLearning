// types.ts (또는 파일 상단에 정의)
interface FirebaseConfig {
  firebaseConfig: Record<string, string>;
}

interface WordbookNode {
  key: string;
  children: Record<string, any>; 
}

interface WordbookData {
  dictionary: {
    version: number;
    sortMode: string;
    root: WordbookNode;
  };
  ownerId: string;
  passwordHash: string;
  updatedAt: string;
}

// 🔒 [안전 패치] Auth 관련 메서드 및 객체 타입 추가
interface FirebaseModuleWrapper {
  db: any; 
  auth: any;
  doc: (...args: any[]) => any;
  getDoc: (docRef: any) => Promise<any>;
  setDoc: (docRef: any, data: any) => Promise<void>;
  signInAnonymously: (auth: any) => Promise<any>;
}

// -------------------------------------------------------------------------

const SESSION_KEY = 'jp_wordbook_session';
const CONFIG_URL = new URL('./firebaseConfig.js', import.meta.url).href;

const entryLink = document.getElementById('jp-entry-link') as HTMLAnchorElement | null;
const dialog = document.getElementById('jp-login-dialog') as HTMLElement | null;
const form = document.getElementById('jp-login-form') as HTMLFormElement | null;
const cancelBtn = document.getElementById('home-login-cancel') as HTMLButtonElement | null;
const userIdInput = document.getElementById('home-sync-user-id') as HTMLInputElement | null;
const passwordInput = document.getElementById('home-sync-password') as HTMLInputElement | null;
const statusEl = document.getElementById('home-login-status') as HTMLElement | null;

// DOM 요소가 정상적으로 존재할 때만 이벤트 리스너를 바인딩합니다.
if (entryLink && dialog && form && cancelBtn && userIdInput && passwordInput && statusEl) {
  
  // 단어장 들어가기 링크를 눌렀을 때의 동작
  entryLink.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();

    // 1. localStorage에서 기존 로그인 세션이 있는지 확인합니다.
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (
          typeof session.userId === 'string'
          && typeof session.passwordHash === 'string'
          && /^[a-f0-9]{64}$/.test(session.passwordHash)
        ) {
          // 2. 이미 로그인 기록이 있다면 팝업을 띄우지 않고 바로 단어장으로 이동합니다.
          window.location.href = entryLink.href;
          return; 
        }
      } catch (e) {
        localStorage.removeItem(SESSION_KEY);
      }
    }

    // 3. 만약 로그인 기록이 없다면 기존처럼 로그인 팝업창을 열어줍니다.
    openLogin();
  });

  cancelBtn.addEventListener('click', closeLogin);
  
  dialog.addEventListener('click', (event: MouseEvent) => {
    if (event.target === dialog) closeLogin();
  });

  form.addEventListener('submit', async (event: SubmitEvent) => {
    event.preventDefault();
    const userId = userIdInput.value.trim();
    const password = passwordInput.value;

    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(userId)) {
      setStatus('사용자 ID는 영문, 숫자, -, _로 3자 이상 입력해 주세요.');
      return;
    }

    if (password.length < 4) {
      setStatus('비밀번호는 4자 이상 입력해 주세요.');
      return;
    }

    setStatus('로그인 중...');
    setBusy(true);

    try {
      const passwordHash = await createPasswordHash(userId, password);
      await verifyOrCreateWordbook(userId, passwordHash);
      
      // 로그인 유지에는 해시된 계정 정보만 저장합니다. 원문 비밀번호는 저장하지 않습니다.
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, passwordHash }));
      
      window.location.href = entryLink.href;
    } catch (error) {
      console.error('Firebase wordbook login failed:', error);
      setStatus(getHomeFirebaseErrorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  // 💡 상위 if문 스코프 덕분에 내부에서는 안전하게 null이 아님이 보장됩니다.
  function openLogin(): void {
    dialog!.classList.add('show');
    dialog!.setAttribute('aria-hidden', 'false');
    userIdInput!.focus();
  }

  function closeLogin(): void {
    dialog!.classList.remove('show');
    dialog!.setAttribute('aria-hidden', 'true');
  }

  function setStatus(message: string): void {
    statusEl!.textContent = message;
  }

  function setBusy(isBusy: boolean): void {
    form!.querySelectorAll('button, input').forEach((element) => {
      (element as HTMLButtonElement | HTMLInputElement).disabled = isBusy;
    });
  }

}

async function verifyOrCreateWordbook(userId: string, passwordHash: string): Promise<void> {
  const firebase = await loadFirebase();
  
  // 🔒 [안전 패치] 데이터 조회/생성 전에 임시 익명 토큰 발행하여 규칙 통과 준비
  await firebase.signInAnonymously(firebase.auth);

  const documentRef = firebase.doc(firebase.db, 'wordbooks', userId);
  const snapshot = await firebase.getDoc(documentRef);

  if (snapshot.exists()) {
    const data = snapshot.data() as WordbookData;
    if (data.passwordHash !== passwordHash) throw new Error('wrong_password');
    return;
  }

  const newWordbook: WordbookData = {
    dictionary: {
      version: 2,
      sortMode: 'text',
      root: createNode('root')
    },
    ownerId: userId,
    passwordHash,
    updatedAt: new Date().toISOString()
  };

  await firebase.setDoc(documentRef, newWordbook);
}

// URL 변수 분리 방식을 적용하여 TypeScript 컴파일 에러(Cannot find module)를 방지합니다.
async function loadFirebase(): Promise<FirebaseModuleWrapper> {
  const configModule = await import(CONFIG_URL) as FirebaseConfig;
  
  const APP_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
  const FIRESTORE_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
  const AUTH_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'; // 🔒 [안전 패치] Auth 모듈 주소 정의

  const appModule = await import(/* @vite-ignore */ APP_URL) as any;
  const firestoreModule = await import(/* @vite-ignore */ FIRESTORE_URL) as any;
  const authModule = await import(/* @vite-ignore */ AUTH_URL) as any; // 🔒 [안전 패치] Auth 모듈 동적 Import
  
  const apps = appModule.getApps();
  const app = apps.length > 0 ? apps[0] : appModule.initializeApp(configModule.firebaseConfig);

  return {
    db: firestoreModule.getFirestore(app),
    auth: authModule.getAuth(app), // 🔒 [안전 패치] Auth 인스턴스 할당
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc,
    signInAnonymously: authModule.signInAnonymously // 🔒 [안전 패치] 익명로그인 함수 바인딩
  };
}

function getHomeFirebaseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Firebase 연결 중 알 수 없는 문제가 발생했습니다.';
  }

  const code = (error as { code?: string }).code;
  if (error.message === 'wrong_password') {
    return '비밀번호가 맞지 않습니다.';
  }

  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Firebase Authentication에서 익명 로그인을 켜 주세요.';
  }

  if (code === 'permission-denied') {
    return 'Firestore 규칙이 아직 사이트 방식과 맞지 않습니다. 수정한 firebase/firestore.rules를 배포해 주세요.';
  }

  if (code === 'auth/network-request-failed' || code === 'unavailable') {
    return 'Firebase 서버에 연결하지 못했습니다. 인터넷 연결 또는 차단 설정을 확인해 주세요.';
  }

  return `Firebase 연결에 실패했습니다. (${code || error.message})`;
}

async function createPasswordHash(userId: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`jp-wordbook-password:${userId.trim()}`),
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createNode(key: string): WordbookNode {
  return {
    key,
    children: {}
  };
}
