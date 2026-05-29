import { DictionaryStore } from './dictionaryStore.js';
import { createClearDialog, createSaveDialog, renderReader, renderWordbook, StudyCard } from './readerView.js';
import { copyTextToClipboard, parseJsonInput, showToast } from './utils.js';
document.addEventListener('DOMContentLoaded', () => {
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
    const wordbookContainer = document.getElementById('wordbook-list-container');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const sortSelect = document.getElementById('wordbook-sort');
    const addJp = document.getElementById('add-jp');
    const addKana = document.getElementById('add-kana');
    const addMean = document.getElementById('add-mean');
    const addWordSubmit = document.getElementById('add-word-submit');
    const syncUserId = document.getElementById('sync-user-id');
    const syncPassword = document.getElementById('sync-password');
    const syncUploadBtn = document.getElementById('sync-upload-btn');
    const syncDownloadBtn = document.getElementById('sync-download-btn');
    const syncStatus = document.getElementById('sync-status');
    const studyCard = new StudyCard(document.getElementById('card-jp'), document.getElementById('card-hint'), document.getElementById('card-counter'), document.getElementById('card-ctrls'), document.getElementById('card-prev'), document.getElementById('card-next'));
    const storageKey = document.body.dataset.storageKey || 'forgotten_japanese_words_ko';
    const syncUserKey = `${storageKey}_sync_user`;
    const firebaseConfigSrc = new URL('./firebaseConfig.js', import.meta.url).href;
    const dictionary = new DictionaryStore(localStorage, storageKey, ['forgotten_words_ko']);
    let promptContentText = '';
    let exampleJsonText = '';
    const saveDialog = createSaveDialog((word) => {
        if (dictionary.add(word)) {
            refreshWordbook();
            showToast('단어장에 보관되었습니다.');
        }
    });
    const clearDialog = createClearDialog(() => {
        dictionary.clear();
        refreshWordbook();
        showToast('단어장이 초기화되었습니다.');
    });
    sortSelect.value = dictionary.getSortMode();
    syncUserId.value = localStorage.getItem(syncUserKey) || '';
    setupSortDropdown(sortSelect);
    refreshWordbook();
    loadPromptText();
    loadExampleJson();
    updateSyncAvailability();
    window.switchTab = (tabId) => {
        document.querySelectorAll('.page-content').forEach((p) => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        const btnIdx = tabId === 'tab-reader' ? 0 : 1;
        document.querySelectorAll('.tab-btn')[btnIdx]?.classList.add('active');
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
            renderReader(data.words, viewerArea, askAndSave);
            inputPage.style.display = 'none';
            viewerPage.style.display = 'block';
            setReaderSupportVisible(false);
        }
        catch (e) {
            showToast('JSON 형식을 다시 확인해 주세요.', true);
        }
    });
    backButton.addEventListener('click', () => {
        viewerPage.style.display = 'none';
        inputPage.style.display = 'flex';
        setReaderSupportVisible(true);
    });
    addWordSubmit.addEventListener('click', () => {
        const word = {
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
        showToast('단어장에 추가되었습니다.');
    });
    clearAllBtn.addEventListener('click', () => {
        clearDialog.open();
    });
    sortSelect.addEventListener('change', () => {
        dictionary.setSortMode(sortSelect.value);
        refreshWordbook();
    });
    copyPromptBtn.addEventListener('click', () => {
        copyLoadedText(promptContentText || promptTextEl.textContent || promptTextEl.innerText, copyPromptBtn, '지침 복사하기');
    });
    copyExampleBtn.addEventListener('click', () => {
        copyLoadedText(exampleJsonText || exampleJsonEl.textContent || exampleJsonEl.innerText, copyExampleBtn, '예시 복사하기');
    });
    syncUserId.addEventListener('input', () => {
        localStorage.setItem(syncUserKey, syncUserId.value.trim());
    });
    syncUploadBtn.addEventListener('click', () => {
        syncDictionary('upload');
    });
    syncDownloadBtn.addEventListener('click', () => {
        syncDictionary('download');
    });
    function refreshWordbook() {
        const words = dictionary.getAll();
        renderWordbook(wordbookContainer, words, removeWord);
        studyCard.setWords(words);
    }
    function removeWord(text) {
        if (!dictionary.remove(text))
            return;
        refreshWordbook();
        showToast('단어가 삭제되었습니다.');
    }
    function askAndSave(word) {
        if (dictionary.has(word.text))
            return;
        setTimeout(() => saveDialog.open(word), 100);
    }
    function setReaderSupportVisible(isVisible) {
        readerSupportBoxes.forEach((box) => {
            box.style.display = isVisible ? 'block' : 'none';
        });
    }
    async function syncDictionary(mode) {
        const userId = syncUserId.value.trim();
        const password = syncPassword.value;
        if (!/^[a-zA-Z0-9_-]{3,40}$/.test(userId)) {
            showToast('사용자 ID는 영문, 숫자, -, _로 3자 이상 입력해 주세요.', true);
            return;
        }
        if (password.length < 4) {
            showToast('비밀번호는 4자 이상 입력해 주세요.', true);
            return;
        }
        localStorage.setItem(syncUserKey, userId);
        setSyncBusy(true, mode === 'upload' ? '업로드 중...' : '불러오는 중...');
        try {
            await syncDictionaryWithFirebase(mode, userId, password);
        }
        catch (error) {
            const message = getSyncErrorMessage(error);
            setSyncStatus(message);
            showToast(message, true);
        }
        finally {
            setSyncBusy(false);
        }
    }
    async function syncDictionaryWithFirebase(mode, userId, password) {
        const firebase = await loadFirebaseSync();
        const passwordHash = await createPasswordHash(password);
        const documentRef = firebase.doc(firebase.db, 'wordbooks', userId);
        const snapshot = await firebase.getDoc(documentRef);
        if (snapshot.exists()) {
            const savedData = snapshot.data();
            if (savedData.passwordHash !== passwordHash) {
                throw new Error('wrong_password');
            }
        }
        if (mode === 'upload') {
            await firebase.setDoc(documentRef, {
                dictionary: dictionary.exportData(),
                ownerId: userId,
                passwordHash,
                updatedAt: new Date().toISOString()
            });
            setSyncStatus('Firebase에 단어장을 저장했습니다.');
            showToast('동기화 업로드 완료');
            return;
        }
        if (!snapshot.exists())
            throw new Error('not_found');
        const data = snapshot.data();
        if (!dictionary.importData(data.dictionary))
            throw new Error('invalid_data');
        sortSelect.value = dictionary.getSortMode();
        sortSelect.dispatchEvent(new Event('change', { bubbles: true }));
        refreshWordbook();
        setSyncStatus('Firebase에서 단어장을 불러왔습니다.');
        showToast('동기화 불러오기 완료');
    }
    async function createPasswordHash(password) {
        const input = new TextEncoder().encode(password);
        const hash = await crypto.subtle.digest('SHA-256', input);
        return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    async function loadFirebaseSync() {
        const configModule = await import(firebaseConfigSrc);
        const firebaseConfig = configModule.firebaseConfig;
        if (!isFirebaseConfigReady(firebaseConfig)) {
            throw new Error('firebase_not_configured');
        }
        const firebaseAppUrl = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
        const firestoreUrl = 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
        const appModule = await import(firebaseAppUrl);
        const firestoreModule = await import(firestoreUrl);
        const apps = appModule.getApps();
        const app = apps.length > 0 ? apps[0] : appModule.initializeApp(firebaseConfig);
        const db = firestoreModule.getFirestore(app);
        return {
            db,
            doc: firestoreModule.doc,
            getDoc: firestoreModule.getDoc,
            setDoc: firestoreModule.setDoc
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
        if (error.message === 'not_found') {
            return '이 ID로 저장된 단어장이 아직 없습니다.';
        }
        if (error.message === 'firebase_not_configured') {
            return 'Firebase 설정값을 jp/src/firebaseConfig.js에 먼저 입력해 주세요.';
        }
        if (error.message === 'wrong_password') {
            return '비밀번호가 맞지 않습니다.';
        }
        return 'Firebase 연결에 실패했습니다. 설정값과 Firestore 규칙을 확인해 주세요.';
    }
    function updateSyncAvailability() {
        setSyncStatus('같은 ID와 비밀번호를 입력하면 GitHub Pages에서도 PC와 모바일 단어장이 동기화됩니다.');
    }
    function setSyncBusy(isBusy, message) {
        syncUploadBtn.disabled = isBusy;
        syncDownloadBtn.disabled = isBusy;
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
    const wrapper = document.createElement('div');
    const trigger = document.createElement('button');
    const menu = document.createElement('div');
    const selectedText = document.createElement('span');
    let closeTimer;
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
    const sync = () => {
        const selected = select.selectedOptions[0];
        selectedText.textContent = selected?.textContent || '정렬';
        menu.querySelectorAll('.sort-dropdown-option').forEach((item) => {
            const isSelected = item.dataset.value === select.value;
            item.classList.toggle('selected', isSelected);
            item.setAttribute('aria-selected', String(isSelected));
        });
    };
    const open = () => {
        if (closeTimer)
            window.clearTimeout(closeTimer);
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    };
    wrapper.addEventListener('mouseenter', open);
    wrapper.addEventListener('mouseleave', () => {
        closeTimer = window.setTimeout(close, 180);
    });
    menu.addEventListener('mouseenter', open);
    trigger.addEventListener('click', () => {
        if (closeTimer)
            window.clearTimeout(closeTimer);
        const isOpen = wrapper.classList.toggle('open');
        trigger.setAttribute('aria-expanded', String(isOpen));
    });
    select.addEventListener('change', sync);
    select.classList.add('native-sort-select');
    select.after(wrapper);
    wrapper.append(trigger, menu);
    sync();
}
