import { DictionaryStore } from './dictionaryStore.js';
import {
    createClearDialog,
    createSaveDialog,
    renderReader,
    renderWordbook,
    StudyCard
} from './readerView.js';
import {
    copyTextToClipboard,
    parseJsonInput,
    showToast
} from './utils.js';
import type { DictionarySortMode, JsonData, WordItem } from './utils.js';

document.addEventListener('DOMContentLoaded', (): void => {
    const inputPage = document.getElementById('input-page') as HTMLDivElement;
    const viewerPage = document.getElementById('viewer-page') as HTMLDivElement;
    const viewerArea = document.getElementById('viewer-area') as HTMLDivElement;
    const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
    const processButton = document.getElementById('process-button') as HTMLButtonElement;
    const backButton = document.getElementById('back-button') as HTMLButtonElement;
    const copyPromptBtn = document.getElementById('copy-prompt-btn') as HTMLButtonElement;
    const promptTextEl = document.getElementById('prompt-text') as HTMLDivElement;
    const copyExampleBtn = document.getElementById('copy-example-btn') as HTMLButtonElement;
    const exampleJsonEl = document.getElementById('example-json-text') as HTMLDivElement;
    const readerSupportBoxes = document.querySelectorAll('.reader-support-box') as NodeListOf<HTMLDivElement>;

    const wordbookContainer = document.getElementById('wordbook-list-container') as HTMLDivElement;
    const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;
    const sortSelect = document.getElementById('wordbook-sort') as HTMLSelectElement;
    const addJp = document.getElementById('add-jp') as HTMLInputElement;
    const addKana = document.getElementById('add-kana') as HTMLInputElement;
    const addMean = document.getElementById('add-mean') as HTMLInputElement;
    const addWordSubmit = document.getElementById('add-word-submit') as HTMLButtonElement;
    const syncLogoutBtn = document.getElementById('sync-logout-btn') as HTMLButtonElement;
    const syncNowBtn = document.getElementById('sync-now-btn') as HTMLButtonElement;
    const syncAccountLabel = document.getElementById('sync-account-label') as HTMLDivElement;
    const syncStatus = document.getElementById('sync-status') as HTMLDivElement;

    const studyCard = new StudyCard(
        document.getElementById('card-jp') as HTMLDivElement,
        document.getElementById('card-hint') as HTMLDivElement,
        document.getElementById('card-counter') as HTMLDivElement,
        document.getElementById('card-ctrls') as HTMLDivElement,
        document.getElementById('card-prev') as HTMLButtonElement,
        document.getElementById('card-next') as HTMLButtonElement
    );

    const storageKey = document.body.dataset.storageKey || 'forgotten_japanese_words_ko';
    const sessionKey = 'jp_wordbook_session';
    const firebaseConfigSrc = new URL('./firebaseConfig.js', import.meta.url).href;
    const dictionary = new DictionaryStore(localStorage, storageKey, ['forgotten_words_ko']);
    let promptContentText = '';
    let exampleJsonText = '';
    let syncSession: { userId: string; passwordHash: string } | null = null;
    let autoSaveTimer: number | undefined;
    let isApplyingRemoteDictionary = false;
    
    let latestJsonWords: any[] = [];

    const saveDialog = createSaveDialog((word) => {
        if (dictionary.add(word)) {
            refreshWordbook();
            if (latestJsonWords.length > 0) {
                renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
            }
            scheduleAutoSave();
            showToast('단어장에 보관되었습니다.');
        }
    });

    const clearDialog = createClearDialog(() => {
        dictionary.clear();
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

    sortSelect.value = dictionary.getSortMode();
    setupSortDropdown(sortSelect);
    refreshWordbook();
    loadPromptText();
    loadExampleJson();
    updateSyncAvailability();
    restoreSessionFromHome();

    (window as any).switchTab = (tabId: string): void => {
        document.querySelectorAll('.page-content').forEach((p) => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));

        document.getElementById(tabId)?.classList.add('active');

        const btnIdx = tabId === 'tab-reader' ? 0 : 1;
        document.querySelectorAll('.tab-btn')[btnIdx]?.classList.add('active');

        if (tabId === 'tab-wordbook') refreshWordbook();
    };

    processButton.addEventListener('click', (): void => {
        const jsonText = textInput.value.trim();
        if (!jsonText) return;

        try {
            const data: JsonData = parseJsonInput(jsonText);
            if (!Array.isArray(data.words)) {
                showToast('올바른 데이터 구조가 아닙니다.', true);
                return;
            }

            latestJsonWords = data.words;
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
            
            inputPage.style.display = 'none';
            viewerPage.style.display = 'block';
            setReaderSupportVisible(false);
        } catch (e) {
            showToast('JSON 형식을 다시 확인해 주세요.', true);
        }
    });

    backButton.addEventListener('click', (): void => {
        viewerPage.style.display = 'none';
        inputPage.style.display = 'flex';
        setReaderSupportVisible(true);
    });

    addWordSubmit.addEventListener('click', (): void => {
        const word: WordItem = {
            text: addJp.value.trim(),
            kana: addKana.value.trim(),
            mean: addMean.value.trim()
        };

        if (!word.text || !word.mean) {
            showToast('원형과 뜻은 필수 입력 항목입니다.', true);
            return;
        }

        if (!dictionary.add(word)) {
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

    clearAllBtn.addEventListener('click', (): void => {
        clearDialog.open();
    });

    sortSelect.addEventListener('change', (): void => {
        dictionary.setSortMode(sortSelect.value as DictionarySortMode);
        refreshWordbook();
        scheduleAutoSave();
    });

    copyPromptBtn.addEventListener('click', (): void => {
        copyLoadedText(promptContentText || promptTextEl.textContent || promptTextEl.innerText, copyPromptBtn, '지침 복사하기');
    });

    copyExampleBtn.addEventListener('click', (): void => {
        copyLoadedText(exampleJsonText || exampleJsonEl.textContent || exampleJsonEl.innerText, copyExampleBtn, '예시 복사하기');
    });

    syncLogoutBtn.addEventListener('click', (): void => {
        logoutFromWordbook();
    });

    syncNowBtn.addEventListener('click', (): void => {
        syncNow();
    });

    function refreshWordbook(): void {
        const words = dictionary.getAll();
        renderWordbook(wordbookContainer, words, removeWord);
        studyCard.setWords(words);
    }

    function removeWord(text: string): void {
        if (!dictionary.remove(text)) return;
        refreshWordbook();
        
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
        }

        scheduleAutoSave();
        showToast('단어가 삭제되었습니다.');
    }

    function askAndSave(word: WordItem): void {
        if (dictionary.has(word.text)) return;
        setTimeout(() => saveDialog.open(word), 100);
    }

    function setReaderSupportVisible(isVisible: boolean): void {
        readerSupportBoxes.forEach((box) => {
            box.style.display = isVisible ? 'block' : 'none';
        });
    }

    async function restoreSessionFromHome(): Promise<void> {
        const session = readHomeSession();
        if (!session) {
            setSyncStatus('홈에서 일본어 단어장 로그인을 먼저 해 주세요.');
            window.setTimeout(() => {
                window.location.href = '../';
            }, 900);
            return;
        }

        syncSession = session;
        syncAccountLabel.textContent = `${session.userId}의 단어장`;
        setSyncBusy(true, '단어장 불러오는 중...');

        try {
            await loadLoggedInDictionary();
            setSyncStatus(`${session.userId}의 단어장에 로그인했습니다. 변경 사항은 자동 저장됩니다.`);
            showToast('단어장을 불러왔습니다.');
        } catch (error) {
            console.error('Firebase wordbook load failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
            localStorage.removeItem(sessionKey);
        } finally {
            setSyncBusy(false);
        }
    }

    function readHomeSession(): { userId: string; passwordHash: string } | null {
        try {
            const raw = localStorage.getItem(sessionKey); 
            if (!raw) return null;
            const session = JSON.parse(raw) as Partial<{ userId: string; passwordHash: string }>;
            if (
                typeof session.userId === 'string'
                && /^[a-zA-Z0-9_-]{3,40}$/.test(session.userId)
                && typeof session.passwordHash === 'string'
                && /^[a-f0-9]{64}$/.test(session.passwordHash)
            ) {
                return { userId: session.userId, passwordHash: session.passwordHash };
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    async function loadLoggedInDictionary(): Promise<void> {
        if (!syncSession) throw new Error('not_logged_in');
        const firebase = await loadFirebaseSync();
        
        // 🔒 [안전 패치] 데이터 조회 전 Firebase Auth 익명 로그인 세션 생성하여 규칙 통과 준비
        await firebase.signInAnonymously(firebase.auth);

        // 문서 ID(userId)와 요청 세션이 준비되어 규칙의 `request.auth != null && userId == ...` 조건을 우회/충족합니다.
        const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
        const snapshot = await firebase.getDoc(documentRef);
        if (!snapshot.exists()) throw new Error('not_found');

        const data = snapshot.data();
        if (data.passwordHash !== syncSession.passwordHash) throw new Error('wrong_password');
        if (!dictionary.importData(data.dictionary)) throw new Error('invalid_data');
        isApplyingRemoteDictionary = true;
        sortSelect.value = dictionary.getSortMode();
        sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        isApplyingRemoteDictionary = false;
        refreshWordbook();
        
        if (latestJsonWords.length > 0) {
            renderReader(latestJsonWords, viewerArea, askAndSave, dictionary.getAll());
        }
    }

    async function saveCurrentDictionaryToFirebase(): Promise<void> {
        if (!syncSession) return;

        const firebase = await loadFirebaseSync();
        // 🔒 [안전 패치] 저장 시에도 세션이 없을 경우 대비하여 토큰 확보 및 동기화
        await firebase.signInAnonymously(firebase.auth);

        const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
        await firebase.setDoc(documentRef, {
            dictionary: dictionary.exportData(),
            ownerId: syncSession.userId,
            passwordHash: syncSession.passwordHash,
            updatedAt: new Date().toISOString()
        });
    }

    async function syncNow(): Promise<void> {
        if (!requireSyncSession()) return;
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
        } catch (error) {
            console.error('Firebase sync check failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
        } finally {
            setSyncBusy(false);
        }
    }

    async function uploadCurrentDictionaryFromSyncDialog(): Promise<void> {
        if (!requireSyncSession()) return;

        setSyncBusy(true, '서버에 업로드 중...');
        try {
            await saveCurrentDictionaryToFirebase();
            setSyncStatus(`${syncSession?.userId || '단어장'} 서버에 현재 상태를 업로드했습니다.`);
            showToast('현재 단어장을 서버에 저장했습니다.');
        } catch (error) {
            console.error('Firebase wordbook upload failed:', error);
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
        } finally {
            setSyncBusy(false);
        }
    }

    async function loadRemoteDictionary(): Promise<unknown> {
        if (!syncSession) throw new Error('not_logged_in');

        const firebase = await loadFirebaseSync();
        await firebase.signInAnonymously(firebase.auth);

        const documentRef = firebase.doc(firebase.db, 'wordbooks', syncSession.userId);
        const snapshot = await firebase.getDoc(documentRef);
        if (!snapshot.exists()) throw new Error('not_found');

        const data = snapshot.data();
        if (data.passwordHash !== syncSession.passwordHash) throw new Error('wrong_password');
        return data.dictionary;
    }

    function requireSyncSession(): boolean {
        if (syncSession) return true;
        const message = '먼저 단어장에 로그인해 주세요.';
        setSyncStatus(message);
        showToast(message, true);
        return false;
    }

    function areDictionariesEquivalent(localData: unknown, remoteData: unknown): boolean {
        const localSnapshot = createComparableDictionarySnapshot(localData);
        const remoteSnapshot = createComparableDictionarySnapshot(remoteData);
        return Boolean(localSnapshot && remoteSnapshot)
            && JSON.stringify(localSnapshot) === JSON.stringify(remoteSnapshot);
    }

    function createComparableDictionarySnapshot(data: unknown): { sortMode: string; words: WordItem[] } | null {
        if (!data || typeof data !== 'object') return null;
        
        let record = data as Record<string, any>;
        if ('dictionary' in record && record.dictionary && typeof record.dictionary === 'object') {
            record = record.dictionary;
        }
        
        const words: WordItem[] = [];
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

    function collectWordsFromTrie(node: unknown, words: WordItem[]): void {
        if (!node || typeof node !== 'object') return;
        const trieNode = node as { item?: unknown; children?: unknown };
        if (isWordItemLike(trieNode.item)) {
            words.push({
                text: trieNode.item.text,
                kana: trieNode.item.kana,
                mean: trieNode.item.mean
            });
        }

        if (!trieNode.children || typeof trieNode.children !== 'object') return;
        Object.values(trieNode.children).forEach((child) => collectWordsFromTrie(child, words));
    }

    function isWordItemLike(value: unknown): value is WordItem {
        if (!value || typeof value !== 'object') return false;
        const item = value as Partial<WordItem>;
        return typeof item.text === 'string'
            && typeof item.kana === 'string'
            && typeof item.mean === 'string';
    }

    function scheduleAutoSave(): void {
        if (!syncSession || isApplyingRemoteDictionary) return;
        if (autoSaveTimer) window.clearTimeout(autoSaveTimer);

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

    function logoutFromWordbook(): void {
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer);
            autoSaveTimer = undefined;
        }

        syncSession = null;
        localStorage.removeItem(sessionKey);
        setSyncStatus('로그아웃했습니다. 홈으로 이동합니다.');
        showToast('단어장에서 로그아웃했습니다.');
        window.location.href = '../';
    }

    // 🔒 [핵심 변경 및 안전 패치] 동적 CDN 모듈 로드 시 Firebase Auth 시스템도 함께 초기화되도록 바인딩을 확장했습니다.
    async function loadFirebaseSync(): Promise<{
        db: unknown;
        auth: unknown;
        doc: (...args: unknown[]) => unknown;
        getDoc: (ref: unknown) => Promise<{ exists: () => boolean; data: () => any }>;
        setDoc: (ref: unknown, data: unknown) => Promise<void>;
        signInAnonymously: (auth: any) => Promise<any>;
    }> {
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
            signInAnonymously: authModule.signInAnonymously
        };
    }

    function isFirebaseConfigReady(config: unknown): boolean {
        if (!config || typeof config !== 'object') return false;
        const candidate = config as Record<string, unknown>;
        return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => {
            return typeof candidate[key] === 'string' && candidate[key].trim().length > 0;
        });
    }

    function getSyncErrorMessage(error: unknown): string {
        if (!(error instanceof Error)) {
            return '동기화 중 알 수 없는 문제가 발생했습니다.';
        }

        const code = (error as { code?: string }).code;

        if (error.message === 'not_found') {
            return '이 ID로 저장된 단어장이 아직 없습니다.';
        }

        if (error.message === 'firebase_not_configured') {
            return 'Firebase 설정값을 jp/src/firebaseConfig.js에 먼저 입력해 주세요.';
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
            return 'Firestore 규칙이 아직 사이트 방식과 맞지 않습니다. 수정한 firestore.rules를 배포해 주세요.';
        }

        if (code === 'auth/network-request-failed' || code === 'unavailable') {
            return 'Firebase 서버에 연결하지 못했습니다. 인터넷 연결 또는 차단 설정을 확인해 주세요.';
        }

        return `Firebase 연결에 실패했습니다. (${code || error.message})`;
    }

    function updateSyncAvailability(): void {
        setSyncStatus('로그인하면 단어장을 불러오고 이후 변경 사항이 자동 저장됩니다.');
    }

    function setSyncBusy(isBusy: boolean, message?: string): void {
        syncLogoutBtn.disabled = isBusy;
        syncNowBtn.disabled = isBusy;
        if (message) setSyncStatus(message);
    }

    function setSyncStatus(message: string): void {
        syncStatus.textContent = message;
    }

    async function loadPromptText(): Promise<void> {
        promptContentText = await loadTextInto(promptTextEl, './prompt.txt', 'prompt.txt를 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.');
    }

    async function loadExampleJson(): Promise<void> {
        exampleJsonText = await loadTextInto(exampleJsonEl, './example.json', 'example.json을 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.');
    }
});

async function loadTextInto(element: HTMLDivElement, fallbackSrc: string, errorMessage: string): Promise<string> {
    const src = element.dataset.src || fallbackSrc;

    try {
        const response = await fetch(src);
        if (!response.ok) throw new Error();

        const text = await response.text();
        element.textContent = text;
        return text;
    } catch (error) {
        element.textContent = errorMessage;
        return '';
    }
}

function copyLoadedText(text: string, button: HTMLButtonElement, defaultLabel: string): void {
    if (!text || text.includes('불러오지 못했습니다')) return;

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

function setupSortDropdown(select: HTMLSelectElement): void {
    const wrapper = document.createElement('div');
    const trigger = document.createElement('button');
    const menu = document.createElement('div');
    const selectedText = document.createElement('span');
    let closeTimer: number | undefined;

    wrapper.className = 'sort-dropdown';
    trigger.className = 'sort-dropdown-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    menu.className = 'sort-dropdown-menu';
    menu.setAttribute('role', 'listbox');
    selectedText.className = 'sort-dropdown-label';

    trigger.appendChild(selectedText);
    Array.from(select.options).forEach((option) => {
        const item = document.createElement('button');
        item.className = 'sort-dropdown-option';
        item.type = 'button';
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.setAttribute('role', 'option');
        item.addEventListener('click', () => {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            wrapper.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        });
        menu.appendChild(item);
    });

    const sync = (): void => {
        const selected = select.selectedOptions[0];
        selectedText.textContent = selected?.textContent || '정렬';
        menu.querySelectorAll<HTMLButtonElement>('.sort-dropdown-option').forEach((item) => {
            const isSelected = item.dataset.value === select.value;
            item.classList.toggle('selected', isSelected);
            item.setAttribute('aria-selected', String(isSelected));
        });
    };

    const open = (): void => {
        if (closeTimer) window.clearTimeout(closeTimer);
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
    };

    const close = (): void => {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    };

    wrapper.addEventListener('mouseenter', open);
    wrapper.addEventListener('mouseleave', () => {
        closeTimer = window.setTimeout(close, 180);
    });
    menu.addEventListener('mouseenter', open);
    trigger.addEventListener('click', () => {
        if (closeTimer) window.clearTimeout(closeTimer);
        const isOpen = wrapper.classList.toggle('open');
        trigger.setAttribute('aria-expanded', String(isOpen));
    });
    select.addEventListener('change', sync);

    select.classList.add('native-sort-select');
    select.after(wrapper);
    wrapper.append(trigger, menu);
    sync();
}

function createSyncConfirmDialog(onConfirm: () => void): {
    open: () => void;
    close: () => void;
} {
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

    const cancelBtn = dialog.querySelector('.word-save-cancel') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('.word-save-confirm') as HTMLButtonElement;

    const close = (): void => {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
    };

    const open = (): void => {
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
        if (event.target === dialog) close();
    });

    return { open, close };
}
