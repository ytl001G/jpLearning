// -------------------------------------------------------------------------
const SESSION_KEY = 'jp_wordbook_session';
const CONFIG_URL = new URL('./firebaseConfig.js', import.meta.url).href;
const entryLink = document.getElementById('jp-entry-link');
const dialog = document.getElementById('jp-login-dialog');
const form = document.getElementById('jp-login-form');
const cancelBtn = document.getElementById('home-login-cancel');
const userIdInput = document.getElementById('home-sync-user-id');
const passwordInput = document.getElementById('home-sync-password');
const statusEl = document.getElementById('home-login-status');
if (entryLink && dialog && form && cancelBtn && userIdInput && passwordInput && statusEl) {
    entryLink.addEventListener('click', (event) => {
        event.preventDefault();
        const savedSession = sessionStorage.getItem(SESSION_KEY);
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session && typeof session.userId === 'string' && typeof session.passwordHash === 'string') {
                    console.log(`%c[Auto Login Bypass] 이미 보관 중인 세션을 감지하여 즉시 로그인 처리를 수행합니다.`, 'background: #222; color: #bada55; font-size: 12px; padding: 3px;');
                    console.log(` -> 🔑 세션 복원 ID: %c${session.userId}`, 'color: #ffc107; font-weight: bold; font-size: 13px;');
                    console.log(` -> 📦 전송 패킷 스냅샷:`, session);
                    // 🌟 [대기 제거] 1초 대기 없이 즉시 페이지 이동
                    window.location.href = entryLink.href;
                    return;
                }
            }
            catch (e) {
                console.error('[Auto Login Error] 세션 파싱에 실패하여 더미 데이터를 만료 처리합니다.');
                sessionStorage.removeItem(SESSION_KEY);
            }
        }
        console.log('[Auth Required] 유효한 브라우저 세션 데이터가 없습니다. 로그인 다이얼로그 창을 활성화합니다.');
        openLogin();
    });
    cancelBtn.addEventListener('click', closeLogin);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            closeLogin();
    });
    form.addEventListener('submit', async (event) => {
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
        const savedSessionRaw = sessionStorage.getItem(SESSION_KEY);
        if (savedSessionRaw) {
            try {
                const savedSession = JSON.parse(savedSessionRaw);
                const inputPasswordHash = await createPasswordHash(userId, password);
                if (savedSession.userId === userId && savedSession.passwordHash === inputPasswordHash) {
                    console.log(`[Auth Check] 폼 입력값이 현재 sessionStorage에 저장된 정보와 일치합니다. (ID: ${userId})`);
                }
                else {
                    console.warn(`[Auth Check] 입력 정보가 현재 세션 정보와 다릅니다. (입력 ID: ${userId} / 세션 ID: ${savedSession.userId})`);
                }
            }
            catch (e) {
                console.error('[Auth Check] 세션 데이터 파싱 실패:', e);
            }
        }
        else {
            console.log('[Auth Check] 현재 브라우저 세션스토리지에 저장된 로그인 데이터가 없습니다. (최초 로그인/가입 시도)');
        }
        setStatus('로그인 중...');
        setBusy(true);
        try {
            const passwordHash = await createPasswordHash(userId, password);
            await verifyOrCreateWordbook(userId, passwordHash);
            console.log(`[Server Sync] Firebase 서버 검증 완료. 단어장 세션을 세션스토리지에 저장합니다. (ID: ${userId})`);
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId, passwordHash }));
            console.log('[Session Verified]', JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'));
            console.log(`[Login Redirect] 🚀 인증 완료! 어떤 로그인 정보로 이동하는지 로그를 남깁니다.`);
            console.log(` -> 🔑 로그인 시도 성공 계정 ID: %c${userId}`, 'color: #007bff; font-weight: bold; font-size: 14px;');
            console.log(` -> 📦 전송될 세션 패킷:`, JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'));
            // 🌟 [대기 제거] 0.8초 대기 없이 인증 확인 즉시 페이지 진입시킵니다.
            window.location.href = entryLink.href;
        }
        catch (error) {
            console.error('[Server Error] Firebase wordbook 인증 또는 네트워크 연결에 실패했습니다.', error);
            setStatus(getHomeFirebaseErrorMessage(error));
            sessionStorage.removeItem(SESSION_KEY);
        }
        finally {
            setBusy(false);
        }
    });
    function openLogin() {
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        userIdInput.focus();
    }
    function closeLogin() {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
        setStatus('');
    }
    function setStatus(message) {
        statusEl.textContent = message;
    }
    function setBusy(isBusy) {
        form.querySelectorAll('button, input').forEach((element) => {
            element.disabled = isBusy;
        });
    }
}
async function verifyOrCreateWordbook(userId, passwordHash) {
    const firebase = await loadFirebase();
    await firebase.signInAnonymously(firebase.auth);
    const documentRef = firebase.doc(firebase.db, 'wordbooks', userId);
    const snapshot = await firebase.getDoc(documentRef);
    if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.passwordHash !== passwordHash)
            throw new Error('wrong_password');
        return;
    }
    const newWordbook = {
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
async function loadFirebase() {
    const configModule = await import(CONFIG_URL);
    const APP_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
    const FIRESTORE_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
    const AUTH_URL = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
    try {
        const appModule = await import(/* @vite-ignore */ APP_URL);
        const firestoreModule = await import(/* @vite-ignore */ FIRESTORE_URL);
        const authModule = await import(/* @vite-ignore */ AUTH_URL);
        const apps = appModule.getApps();
        const app = apps.length > 0 ? apps[0] : appModule.initializeApp(configModule.firebaseConfig);
        return {
            db: firestoreModule.getFirestore(app),
            auth: authModule.getAuth(app),
            doc: firestoreModule.doc,
            getDoc: firestoreModule.getDoc,
            setDoc: firestoreModule.setDoc,
            signInAnonymously: authModule.signInAnonymously
        };
    }
    catch (importError) {
        const customError = new Error('unavailable');
        customError.code = 'unavailable';
        throw customError;
    }
}
function getHomeFirebaseErrorMessage(error) {
    if (!(error instanceof Error)) {
        return 'Firebase 연결 중 알 수 없는 문제가 발생했습니다.';
    }
    const code = error.code;
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
async function createPasswordHash(userId, password) {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: encoder.encode(`jp-wordbook-password:${userId.trim()}`),
        iterations: 100000,
        hash: 'SHA-256'
    }, baseKey, 256);
    return bytesToHex(new Uint8Array(bits));
}
function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function createNode(key) {
    return {
        key,
        children: {}
    };
}
export {};
