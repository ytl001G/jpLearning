// types.ts (또는 파일 상단에 정의)
interface FirebaseConfig {
  firebaseConfig: Record<string, string>;
}

interface WordbookNode {
  hash: string;
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

interface FirebaseModuleWrapper {
  db: any; 
  doc: (...args: any[]) => any;
  getDoc: (docRef: any) => Promise<any>;
  setDoc: (docRef: any, data: any) => Promise<void>;
}

// -------------------------------------------------------------------------

const SESSION_KEY = 'jp_wordbook_session';
const CONFIG_URL = new URL('./jp/src/firebaseConfig.js', import.meta.url).href;

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
        if (session.userId && session.passwordHash) {
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
      const passwordHash = await createPasswordHash(password);
      await verifyOrCreateWordbook(userId, passwordHash);
      
      // 기존 sessionStorage 대신 localStorage를 사용하여 로그인이 반영구적으로 유지되도록 합니다.
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, passwordHash }));
      
      window.location.href = entryLink.href;
    } catch (error) {
      setStatus(error instanceof Error && error.message === 'wrong_password'
        ? '비밀번호가 맞지 않습니다.'
        : 'Firebase 연결에 실패했습니다. 설정값과 Firestore 규칙을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  });

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

  const appModule = await import(/* @vite-ignore */ APP_URL) as any;
  const firestoreModule = await import(/* @vite-ignore */ FIRESTORE_URL) as any;
  
  const apps = appModule.getApps();
  const app = apps.length > 0 ? apps[0] : appModule.initializeApp(configModule.firebaseConfig);

  return {
    db: firestoreModule.getFirestore(app),
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    setDoc: firestoreModule.setDoc
  };
}

async function createPasswordHash(password: string): Promise<string> {
  const input = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createNode(hashSource: string): WordbookNode {
  return {
    hash: hashToken(hashSource),
    children: {}
  };
}

function hashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}