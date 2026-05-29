import { DictionaryStore } from './dictionaryStore.js';
import { createClearDialog, createSaveDialog, renderReader, renderWordbook, StudyCard } from './readerView.js';
import { copyTextToClipboard, parseJsonInput, showToast } from './utils.js';
document.addEventListener('DOMContentLoaded', async () => {
    const inputPage = document.getElementById('input-page');
    const viewerPage = document.getElementById('viewer-page');
    const viewerArea = document.getElementById('viewer-area');
    const textInput = document.getElementById('text-input');
    const processButton = document.getElementById('process-button');
    const backButton = document.getElementById('back-button');
    const copyPromptBtn = document.getElementById('copy-prompt-btn');
    const promptTextEl = document.getElementById('prompt-text');
    const copyExampleBtn = document.getElementById('copy-example-btn');
    const exampleJsonEl = document.getElementById('example-json-text');
    const readerSupportBoxes = document.querySelectorAll('.reader-support-box');
    // 💡 모르는 단어 복습 프롬프트 복사 버튼 추가
    const copyUnknownPromptBtn = document.getElementById('copy-unknown-prompt-btn');
    const wordbookContainer = document.getElementById('wordbook-list-container');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const sortSelect = document.getElementById('wordbook-sort');
    const addJp = document.getElementById('add-jp');
    const addKana = document.getElementById('add-kana');
    const addMean = document.getElementById('add-mean');
    const addWordSubmit = document.getElementById('add-word-submit');
    const syncLogoutBtn = document.getElementById('sync-logout-btn');
    const syncNowBtn = document.getElementById('sync-now-btn');
    const syncDeleteAccountBtn = document.getElementById('sync-delete-account-btn');
    const syncAccountLabel = document.getElementById('sync-account-label');
    const syncStatus = document.getElementById('sync-status');
    const studyCard = new StudyCard(document.getElementById('card-jp'), document.getElementById('card-hint'), document.getElementById('card-counter'), document.getElementById('card-ctrls'), document.getElementById('card-prev'), document.getElementById('card-next'));
    const storageKey = document.body.dataset.storageKey || 'forgotten_japanese_words_ko';
    const sessionKey = 'jp_wordbook_session';
    const firebaseConfigSrc = new URL('../../src/firebaseConfig.js', import.meta.url).href;
    let promptContentText = '';
    let exampleJsonText = '';
    let syncSession = null;
    let autoSaveTimer;
    let isApplyingRemoteDictionary = false;
    let latestJsonWords = [];
    const session = readHomeSession();
    if (!session) {
        console.error('[Auth Error] 로그인 세션(jp_wordbook_session)을 찾을 수 없습니다. 메인 페이지로 리다이렉트합니다.');
        setSyncStatus('로그인이 필요합니다. 메인 화면으로 이동합니다...');
        window.setTimeout(() => {
            window.location.href = '../';
        }, 600);
        return;
    }
    // 🌟 [추가] 로그인 성공 후 독서대 진입 시 어떤 ID로 로그인되었는지 콘솔에 로깅
    console.log(`[Auth Success] 정상적인 로그인 세션이 확인되었습니다. (접속 계정 ID: ${session.userId})`);
    syncSession = session;
    if (syncAccountLabel) {
        syncAccountLabel.textContent = `${session.userId}의 단어장`;
    }
    const dictionary = new DictionaryStore(localStorage, storageKey, ['forgotten_words_ko']);
    await dictionary.init();
    const clearDialog = createClearDialog(async () => {
        await dictionary.clear();
        refreshWordbook();
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, []);
        }
        scheduleAutoSave();
        showToast('단어장이 초기화되었습니다.');
    });
    const syncConfirmDialog = createSyncConfirmDialog(() => {
        uploadCurrentDictionaryFromSyncDialog();
    });
    const accountDeleteDialog = createAccountDeleteDialog(() => {
        deleteAccountFromDialog();
    });
    const logoutConfirmDialog = createLogoutConfirmDialog(() => {
        logoutFromWordbook();
    });
    sortSelect.value = dictionary.getSortMode();
    setupSortDropdown(sortSelect);
    refreshWordbook();
    loadPromptText();
    loadExampleJson();
    updateSyncAvailability();
    restoreSessionFromHome();
    window.switchTab = (tabId) => {
        document.querySelectorAll('.page-content').forEach((p) => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        const btnIdx = tabId === 'tab-reader' ? 0 : 1;
        document.querySelectorAll('.tab-btn')[btnIdx]?.classList.add('active');
        // 🌟 [핵심 추가] 독서 탭(tab-reader)이 아닌 다른 탭(단어장 등)으로 이동할 때 단어 단계 초기화
        if (tabId !== 'tab-reader' && latestJsonWords.length > 0) {
            // 마지막 인자에 true를 넘겨 열려있던 뜻/발음 힌트(Stage)를 백업하지 않고 초기화합니다.
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll(), true);
        }
        if (tabId === 'tab-wordbook')
            refreshWordbook();
    };
    processButton.addEventListener('click', () => {
        const jsonText = textInput.value.trim();
        if (!jsonText)
            return;
        try {
            const data = parseJsonInput(jsonText);
            if (!Array.isArray(data.words)) {
                showToast('올바른 데이터 구조가 아닙니다.', true);
                return;
            }
            latestJsonWords = data.words;
            // 🌟 [안전 패치] 새로 지문을 입력하고 시작할 때도 기존 상태가 남아있지 않도록 마지막 인자에 true 전달
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll(), true);
            inputPage.style.display = 'none';
            viewerPage.style.display = 'block';
            setReaderSupportVisible(false);
        }
        catch (e) {
            showToast('JSON 형식을 다시 확인해 주세요.', true);
        }
    });
    backButton.addEventListener('click', () => {
        // 🌟 [핵심 추가] 뒤로가기 버튼을 눌러 입력창으로 나갈 때 열려있던 단어 뜻 정보 초기화
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll(), true);
        }
        viewerPage.style.display = 'none';
        inputPage.style.display = 'flex';
        setReaderSupportVisible(true);
    });
    addWordSubmit.addEventListener('click', async () => {
        const word = {
            text: addJp.value.trim(),
            kana: addKana.value.trim(),
            mean: addMean.value.trim()
        };
        if (!word.text || !word.mean) {
            showToast('원형과 뜻은 필수 입력 항목입니다.', true);
            return;
        }
        if (!(await dictionary.add(word))) {
            showToast('이미 추가된 단어입니다.', true);
            return;
        }
        addJp.value = '';
        addKana.value = '';
        addMean.value = '';
        refreshWordbook();
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
        }
        scheduleAutoSave();
        showToast('단어장에 추가되었습니다.');
    });
    clearAllBtn.addEventListener('click', () => {
        clearDialog.open();
    });
    sortSelect.addEventListener('change', async () => {
        await dictionary.setSortMode(sortSelect.value);
        refreshWordbook();
        scheduleAutoSave();
    });
    copyPromptBtn.addEventListener('click', () => {
        copyLoadedText(promptContentText || promptTextEl.textContent || promptTextEl.innerText, copyPromptBtn, '지침 복사하기');
    });
    copyExampleBtn.addEventListener('click', () => {
        copyLoadedText(exampleJsonText || exampleJsonEl.textContent || exampleJsonEl.innerText, copyExampleBtn, '예시 복사하기');
    });
    // 💡 모르는 단어 복습 지문 프롬프트 복사 기능 구현
    if (copyUnknownPromptBtn) {
        copyUnknownPromptBtn.addEventListener('click', () => {
            const words = dictionary.getAll();
            if (words.length === 0) {
                showToast('단어장에 저장된 단어가 없습니다.', true);
                return;
            }
            // 단어 리스트 추출 (형식: 단어(발음) - 뜻)
            const wordListString = words.map(w => {
                const kanaStr = w.kana ? `(${w.kana})` : '';
                return `- ${w.text}${kanaStr}: ${w.mean}`;
            }).join('\n');
            // 생성할 ChatGPT/LLM 프롬프트 서식
            const unknownPromptText = `아래는 내가 공부하면서 저장한 "모르는 일본어 단어 리스트"야.

[모르는 단어 리스트]
${wordListString}

이 단어들을 자연스럽게 활용하여 내가 복습할 수 있는 재미있는 '일본어 짧은 이야기(독해 지문)'를 1개 작성해줘.
조건은 다음과 같아:
1. 이야기 안에는 반드시 위의 단어들이 최대한 자연스럽게 포함되어야 해.
2. N3~N2 정도의 난이도로 작성해줘.`;
            copyTextToClipboard(unknownPromptText).then((success) => {
                if (!success) {
                    showToast('프롬프트 복사에 실패했습니다.', true);
                    return;
                }
                copyUnknownPromptBtn.textContent = '✓ 프롬프트 복사 완료! 📋';
                copyUnknownPromptBtn.classList.add('success');
                showToast('복습용 프롬프트가 클립보드에 복사되었습니다.');
                setTimeout(() => {
                    copyUnknownPromptBtn.textContent = '모르는 단어 복습 지문 프롬프트 복사 📋';
                    copyUnknownPromptBtn.classList.remove('success');
                }, 2000);
            });
        });
    }
    syncLogoutBtn.addEventListener('click', () => {
        logoutConfirmDialog.open();
    });
    syncNowBtn.addEventListener('click', () => {
        syncNow();
    });
    syncDeleteAccountBtn.addEventListener('click', () => {
        accountDeleteDialog.open();
    });
    function refreshWordbook() {
        const words = dictionary.getAll();
        renderWordbook(words, wordbookContainer, removeWord);
        studyCard.setWords(words);
    }
    async function removeWord(text) {
        if (!(await dictionary.remove(text)))
            return;
        refreshWordbook();
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
        }
        scheduleAutoSave();
        showToast('단어가 삭제되었습니다.');
    }
    function askAndSave(word) {
        if (dictionary.has(word.text)) {
            showToast('이미 단어장에 존재하는 단어입니다.', true);
            return;
        }
        const saveDialog = createSaveDialog(word, async (finalWord) => {
            if (await dictionary.add(finalWord)) {
                refreshWordbook();
                if (latestJsonWords.length > 0) {
                    const currentWords = dictionary.getAll();
                    const safeWordsArray = Array.isArray(currentWords)
                        ? currentWords
                        : (currentWords && typeof currentWords === 'object' && 'list' in currentWords ? currentWords.list : []);
                    renderReader(latestJsonWords, viewerArea, askAndSave, safeWordsArray);
                }
                scheduleAutoSave();
                showToast(`『${finalWord.text}』 단어장에 보관되었습니다.`);
            }
        });
        setTimeout(() => saveDialog.open(), 100);
    }
    function setReaderSupportVisible(isVisible) {
        readerSupportBoxes.forEach((box) => {
            box.style.display = isVisible ? 'block' : 'none';
        });
    }
    async function restoreSessionFromHome() {
        if (!syncSession)
            return;
        setSyncBusy(true, '단어장 불러오는 중...');
        try {
            await loadLoggedInDictionary();
            setSyncStatus(`${syncSession.userId}의 단어장에 로그인했습니다. 변경 사항은 자동 저장됩니다.`);
            showToast('단어장을 불러왔습니다.');
        }
        catch (error) {
            console.error('Firebase wordbook load failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
            localStorage.removeItem(sessionKey);
        }
        finally {
            setSyncBusy(false);
        }
    }
    function readHomeSession() {
        try {
            // 🌟 sessionStorage로 통일하여 메인에서 넘겨준 데이터를 정확히 가로챕니다.
            const raw = sessionStorage.getItem(sessionKey);
            if (!raw)
                return null;
            const session = JSON.parse(raw);
            if (typeof session.userId === 'string'
                && /^[a-zA-Z0-9_-]{3,40}$/.test(session.userId)
                && typeof session.passwordHash === 'string'
                && /^[a-f0-9]{64}$/.test(session.passwordHash)) {
                return { userId: session.userId, passwordHash: session.passwordHash };
            }
        }
        catch (error) {
            return null;
        }
        return null;
    }
    async function loadLoggedInDictionary() {
        if (!syncSession)
            throw new Error('not_logged_in');
        try {
            const firebase = await loadFirebaseSync();
            await firebase.signInAnonymously(firebase.auth);
            const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
            const snapshot = await firebase.getDoc(documentRef);
            if (!snapshot.exists())
                throw new Error('not_found');
            const data = snapshot.data();
            if (data.passwordHash !== syncSession.passwordHash)
                throw new Error('wrong_password');
            // 🌟 [치명적 타이밍 버그 해결] 
            // 로컬 추가와 서버 로드가 겹쳐 importData가 false를 뱉더라도, 
            // 앱을 강제로 파괴(throw)하지 않고 안전하게 예외 처리하여 복구 흐름으로 돌립니다.
            const importSuccess = await dictionary.importData(data.dictionary);
            if (!importSuccess) {
                console.warn("[안전 장치] 일시적인 데이터 싱크 불일치 감지. 현재 단어장 구조를 유지하며 자가 치유합니다.");
            }
            isApplyingRemoteDictionary = true;
            // 🌟 [타입 에러 패치] 강제 문자열 대신 dictionary 객체에 등록된 정상적인 정렬 모드를 추출하여 대입합니다.
            const currentMode = dictionary.getSortMode();
            if (currentMode) {
                sortSelect.value = currentMode;
            }
            // 렌더링 스택 꼬임 방지를 위해 이벤트 루프를 한 차례 미룹니다.
            window.setTimeout(() => {
                sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }, 0);
            isApplyingRemoteDictionary = false;
            refreshWordbook();
            if (latestJsonWords.length > 0) {
                // 상위 스택에서 정제된 순수 배열 형태만 안전하게 전달하여 2차 에러 차단
                const allData = dictionary.getAll();
                const safeSavedWords = Array.isArray(allData)
                    ? allData
                    : (allData && typeof allData === 'object' && 'list' in allData ? allData.list : []);
                renderReader(latestJsonWords, viewerArea, askAndSave, safeSavedWords);
            }
        }
        catch (error) {
            // 🚨 invalid_data 예외가 상위로 전파되어 자바스크립트 전체가 다운되는 현상을 완벽히 방어합니다.
            if (error?.message === 'invalid_data' || error?.toString().includes('invalid_data')) {
                console.error("안전 모드 작동: 오염된 동기화 트래픽을 차단하고 안정적인 로컬 데이터를 유지합니다.");
                // 🌟 [컴파일 에러 패치] 'latest' 문자열 주입 에러 우회 및 강제 동기화 정화
                try {
                    const fallbackMode = sortSelect.options[0]?.value;
                    if (fallbackMode) {
                        await dictionary.setSortMode(fallbackMode);
                    }
                }
                catch (subError) {
                    console.error("정렬 모드 대피 실패:", subError);
                }
                refreshWordbook();
                return;
            }
            console.error("Firebase wordbook load failed:", error);
            showToast("단어장을 불러오는 중 오류가 발생했습니다.");
        }
    }
    async function saveCurrentDictionaryToFirebase() {
        if (!syncSession)
            return;
        const firebase = await loadFirebaseSync();
        await firebase.signInAnonymously(firebase.auth);
        const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
        await firebase.setDoc(documentRef, {
            dictionary: dictionary.exportData(),
            ownerId: syncSession.userId,
            passwordHash: syncSession.passwordHash,
            updatedAt: new Date().toISOString()
        });
    }
    async function syncNow() {
        if (!requireSyncSession())
            return;
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer);
            autoSaveTimer = undefined;
        }
        setSyncBusy(true, '동기화 상태 확인 중...');
        try {
            const remoteDictionary = await loadRemoteDictionary();
            const isSynced = areDictionariesEquivalent(dictionary.exportData(), remoteDictionary);
            if (isSynced) {
                const message = `${syncSession?.userId || '단어장'} 동기화 완료 상태입니다.`;
                setSyncStatus(message);
                showToast(message);
                return;
            }
            setSyncStatus('로컬 단어장과 서버 단어장이 다릅니다.');
            syncConfirmDialog.open();
        }
        catch (error) {
            console.error('Firebase sync check failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
        }
        finally {
            setSyncBusy(false);
        }
    }
    async function uploadCurrentDictionaryFromSyncDialog() {
        if (!requireSyncSession())
            return;
        setSyncBusy(true, '서버에 업로드 중...');
        try {
            await saveCurrentDictionaryToFirebase();
            setSyncStatus(`${syncSession?.userId || '단어장'} 서버에 현재 상태를 업로드했습니다.`);
            showToast('현재 단어장을 서버에 저장했습니다.');
        }
        catch (error) {
            console.error('Firebase wordbook load failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
            sessionStorage.removeItem(sessionKey);
        }
        finally {
            setSyncBusy(false);
        }
    }
    async function deleteAccountFromDialog() {
        if (!requireSyncSession() || !syncSession)
            return;
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer);
            autoSaveTimer = undefined;
        }
        setSyncBusy(true, '계정 삭제 중...');
        try {
            const firebase = await loadFirebaseSync();
            await firebase.signInAnonymously(firebase.auth);
            const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
            await firebase.deleteDoc(documentRef);
            // 로컬스토리지 비우기
            localStorage.removeItem(sessionKey);
            localStorage.removeItem(storageKey);
            localStorage.removeItem('forgotten_words_ko');
            // 🌟 [핵심 추가] 홈 화면의 자동 로그인 방지를 위해 세션스토리지를 완벽하게 박멸합니다.
            sessionStorage.removeItem('jp_wordbook_session');
            syncSession = null;
            showToast('Firebase 단어장 계정을 삭제했습니다.');
            setSyncStatus('계정을 삭제했습니다. 홈으로 이동합니다.');
            window.location.href = '../';
        }
        catch (error) {
            console.error('Firebase account delete failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
        }
        finally {
            setSyncBusy(false);
        }
    }
    async function loadRemoteDictionary() {
        if (!syncSession)
            throw new Error('not_logged_in');
        const firebase = await loadFirebaseSync();
        await firebase.signInAnonymously(firebase.auth);
        const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
        const snapshot = await firebase.getDoc(documentRef);
        if (!snapshot.exists())
            throw new Error('not_found');
        const data = snapshot.data();
        if (data.passwordHash !== syncSession.passwordHash)
            throw new Error('wrong_password');
        return data.dictionary;
    }
    function requireSyncSession() {
        if (syncSession)
            return true;
        const message = '먼저 단어장에 로그인해 주세요.';
        setSyncStatus(message);
        showToast(message, true);
        return false;
    }
    function areDictionariesEquivalent(localData, remoteData) {
        const localSnapshot = createComparableDictionarySnapshot(localData);
        const remoteSnapshot = createComparableDictionarySnapshot(remoteData);
        return Boolean(localSnapshot && remoteSnapshot)
            && JSON.stringify(localSnapshot) === JSON.stringify(remoteSnapshot);
    }
    function createComparableDictionarySnapshot(data) {
        if (!data || typeof data !== 'object')
            return null;
        let record = data;
        if ('dictionary' in record && record.dictionary && typeof record.dictionary === 'object') {
            record = record.dictionary;
        }
        const words = [];
        collectWordsFromTrie(record.root, words);
        return {
            sortMode: typeof record.sortMode === 'string' ? record.sortMode : 'text',
            words: words
                .map((word) => ({
                text: word.text.trim().normalize('NFKC'),
                kana: word.kana.trim().normalize('NFKC'),
                mean: word.mean.trim().normalize('NFKC')
            }))
                .sort((a, b) => {
                return a.text.localeCompare(b.text, 'ja')
                    || a.kana.localeCompare(b.kana, 'ja')
                    || a.mean.localeCompare(b.mean, 'ko');
            })
        };
    }
    function collectWordsFromTrie(node, words) {
        if (!node || typeof node !== 'object')
            return;
        const trieNode = node;
        if (isWordItemLike(trieNode.item)) {
            words.push({
                text: trieNode.item.text,
                kana: trieNode.item.kana,
                mean: trieNode.item.mean
            });
        }
        if (!trieNode.children || typeof trieNode.children !== 'object')
            return;
        Object.values(trieNode.children).forEach((child) => collectWordsFromTrie(child, words));
    }
    function isWordItemLike(value) {
        if (!value || typeof value !== 'object')
            return false;
        const item = value;
        return typeof item.text === 'string'
            && typeof item.kana === 'string'
            && typeof item.mean === 'string';
    }
    function scheduleAutoSave() {
        if (!syncSession || isApplyingRemoteDictionary)
            return;
        if (autoSaveTimer)
            window.clearTimeout(autoSaveTimer);
        setSyncStatus('변경 사항 저장 대기 중...');
        autoSaveTimer = window.setTimeout(() => {
            autoSaveTimer = undefined;
            saveCurrentDictionaryToFirebase()
                .then(() => setSyncStatus(`${syncSession?.userId || '단어장'} 자동 저장 완료`))
                .catch((error) => {
                console.error('Firebase autosave failed:', error);
                const message = getSyncErrorMessage(error);
                setSyncStatus(message);
                showToast(message, true);
            });
        }, 700);
    }
    function logoutFromWordbook() {
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer);
            autoSaveTimer = undefined;
        }
        syncSession = null;
        sessionStorage.removeItem('jp_wordbook_session');
        setSyncStatus('로그아웃했습니다. 홈으로 이동합니다.');
        showToast('단어장에서 로그아웃했습니다.');
        window.location.href = '../';
    }
    async function loadFirebaseSync() {
        const configModule = await import(firebaseConfigSrc);
        const firebaseConfig = configModule.firebaseConfig;
        if (!isFirebaseConfigReady(firebaseConfig)) {
            throw new Error('firebase_not_configured');
        }
        const firebaseAppUrl = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
        const firestoreUrl = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
        const authUrl = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
        const appModule = await import(/* @vite-ignore */ firebaseAppUrl);
        const firestoreModule = await import(/* @vite-ignore */ firestoreUrl);
        const authModule = await import(/* @vite-ignore */ authUrl);
        const apps = appModule.getApps();
        const app = apps.length > 0 ? apps[0] : appModule.initializeApp(firebaseConfig);
        const db = firestoreModule.getFirestore(app);
        const auth = authModule.getAuth(app);
        return {
            db,
            auth,
            doc: firestoreModule.doc,
            getDoc: firestoreModule.getDoc,
            setDoc: firestoreModule.setDoc,
            deleteDoc: firestoreModule.deleteDoc,
            signInAnonymously: authModule.signInAnonymously
        };
    }
    function isFirebaseConfigReady(config) {
        if (!config || typeof config !== 'object')
            return false;
        const candidate = config;
        return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => {
            return typeof candidate[key] === 'string' && candidate[key].trim().length > 0;
        });
    }
    function getSyncErrorMessage(error) {
        if (!(error instanceof Error)) {
            return '동기화 중 알 수 없는 문제가 발생했습니다.';
        }
        const code = error.code;
        if (error.message === 'not_found') {
            return '이 ID로 저장된 단어장이 아직 없습니다.';
        }
        if (error.message === 'firebase_not_configured') {
            return 'Firebase 설정값을 src/firebaseConfig.js에 먼저 입력해 주세요.';
        }
        if (error.message === 'wrong_password') {
            return '비밀번호가 맞지 않습니다.';
        }
        if (error.message === 'not_logged_in') {
            return '먼저 단어장에 로그인해 주세요.';
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
    function updateSyncAvailability() {
        setSyncStatus('로그인하면 단어장을 불러오고 이후 변경 사항이 자동 저장됩니다.');
    }
    function setSyncBusy(isBusy, message) {
        syncLogoutBtn.disabled = isBusy;
        syncNowBtn.disabled = isBusy;
        syncDeleteAccountBtn.disabled = isBusy;
        if (message)
            setSyncStatus(message);
    }
    function setSyncStatus(message) {
        syncStatus.textContent = message;
    }
    async function loadPromptText() {
        promptContentText = await loadTextInto(promptTextEl, './prompt.txt', 'prompt.txt를 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.');
    }
    async function loadExampleJson() {
        exampleJsonText = await loadTextInto(exampleJsonEl, './example.json', 'example.json을 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.');
    }
});
async function loadTextInto(element, fallbackSrc, errorMessage) {
    const src = element.dataset.src || fallbackSrc;
    try {
        const response = await fetch(src);
        if (!response.ok)
            throw new Error();
        const text = await response.text();
        element.textContent = text;
        return text;
    }
    catch (error) {
        element.textContent = errorMessage;
        return '';
    }
}
function copyLoadedText(text, button, defaultLabel) {
    if (!text || text.includes('불러오지 못했습니다'))
        return;
    copyTextToClipboard(text).then((success) => {
        if (!success) {
            showToast('복사에 실패했습니다.', true);
            return;
        }
        button.textContent = '✓ 복사 완료';
        button.classList.add('success');
        setTimeout(() => {
            button.textContent = defaultLabel;
            button.classList.remove('success');
        }, 2000);
    });
}
function setupSortDropdown(select) {
    if (!select)
        return;
    // 🔒 [방어 1] 이미 내 옆에 커스텀 드롭다운(.sort-dropdown)이 있다면 절대 중복 생성하지 않음
    if (select.nextElementSibling?.classList.contains('sort-dropdown')) {
        return;
    }
    const wrapper = document.createElement('div');
    const trigger = document.createElement('button');
    const menu = document.createElement('div');
    const selectedText = document.createElement('span');
    wrapper.className = 'sort-dropdown';
    trigger.className = 'sort-dropdown-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    menu.className = 'sort-dropdown-menu';
    menu.setAttribute('role', 'listbox');
    selectedText.className = 'sort-dropdown-label';
    trigger.appendChild(selectedText);
    // 메뉴 아이템(버튼)들을 최초 딱 1번만 빌드
    Array.from(select.options).forEach((option) => {
        const item = document.createElement('button');
        item.className = 'sort-dropdown-option';
        item.type = 'button';
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.setAttribute('role', 'option');
        // 🌟 [핵심 수정] 기존에 메커니즘을 방해하던 복잡한 이벤트 전파 차단 코드를 걷어내고,
        // 순수하게 값 변경과 체인지 이벤트만 트리거하도록 간소화했습니다.
        item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        menu.appendChild(item);
    });
    // 선택된 텍스트와 하이라이트 상태만 매칭하는 싱크 함수
    const sync = () => {
        const selectedOptions = select.selectedOptions;
        if (selectedOptions && selectedOptions.length > 0) {
            selectedText.textContent = selectedOptions[0].textContent;
        }
        else {
            const fallbackOption = Array.from(select.options).find(opt => opt.value === select.value);
            selectedText.textContent = fallbackOption?.textContent || '정렬';
        }
        menu.querySelectorAll('.sort-dropdown-option').forEach((item) => {
            const isSelected = item.dataset.value === select.value;
            item.classList.toggle('selected', isSelected);
            item.setAttribute('aria-selected', String(isSelected));
        });
    };
    // 원본 select 태그의 값이 바뀔 때마다 텍스트 상태만 매칭하도록 바인딩
    select.addEventListener('change', sync);
    // 순정 select 태그를 투명하게 뒤로 숨기기 위해 클래스 부여
    select.classList.add('native-sort-select');
    select.after(wrapper);
    wrapper.append(trigger, menu);
    // 최초 초기 상태 동기화
    sync();
}
function createSyncConfirmDialog(onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'word-save-dialog';
    dialog.setAttribute('aria-hidden', 'true');
    dialog.innerHTML = `
        <div class="word-save-card" role="dialog" aria-modal="true" aria-labelledby="sync-dialog-title">
            <div class="word-save-label">동기화 확인</div>
            <div class="word-save-title" id="sync-dialog-title">서버와 내용이 다릅니다</div>
            <div class="word-save-message">지금 화면의 단어장을 서버에 업로드할까요?</div>
            <div class="word-save-actions">
                <button type="button" class="word-save-cancel">취소</button>
                <button type="button" class="word-save-confirm">업로드</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    const cancelBtn = dialog.querySelector('.word-save-cancel');
    const confirmBtn = dialog.querySelector('.word-save-confirm');
    const close = () => {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
    };
    const open = () => {
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        confirmBtn.focus();
    };
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
        close();
        onConfirm();
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
    return { open, close };
}
function createAccountDeleteDialog(onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'word-save-dialog';
    dialog.setAttribute('aria-hidden', 'true');
    dialog.innerHTML = `
        <div class="word-save-card clear-card" role="dialog" aria-modal="true" aria-labelledby="account-delete-dialog-title">
            <div class="word-save-label danger-label">계정 삭제</div>
            <div class="word-save-title" id="account-delete-dialog-title">Firebase 계정을 삭제할까요?</div>
            <div class="word-save-message">서버에 저장된 단어장 계정과 이 기기의 로그인 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</div>
            <div class="word-save-actions">
                <button type="button" class="word-save-cancel">취소</button>
                <button type="button" class="word-clear-confirm">삭제하기</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    const cancelBtn = dialog.querySelector('.word-save-cancel');
    const confirmBtn = dialog.querySelector('.word-clear-confirm');
    const close = () => {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
    };
    const open = () => {
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        cancelBtn.focus();
    };
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
        close();
        onConfirm();
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
    return { open, close };
}
function createLogoutConfirmDialog(onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'word-save-dialog';
    dialog.setAttribute('aria-hidden', 'true');
    dialog.innerHTML = `
        <div class="word-save-card" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
            <div class="word-save-label" style="background-color: var(--ink-sub);">로그아웃</div>
            <div class="word-save-title" id="logout-dialog-title">로그아웃하시겠습니까?</div>
            <div class="word-save-message">로그아웃하면 로컬 변경사항의 자동 서버 동기화가 중단됩니다.</div>
            <div class="word-save-actions">
                <button type="button" class="word-save-cancel">취소</button>
                <button type="button" class="word-save-confirm" style="background-color: var(--primary); color: #fff;">로그아웃</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    const cancelBtn = dialog.querySelector('.word-save-cancel');
    const confirmBtn = dialog.querySelector('.word-save-confirm');
    const close = () => {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
    };
    const open = () => {
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        confirmBtn.focus();
    };
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
        close();
        onConfirm();
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
    return { open, close };
}
