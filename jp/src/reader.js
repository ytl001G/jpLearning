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
    const studyCard = new StudyCard(document.getElementById('card-jp'), document.getElementById('card-hint'), document.getElementById('card-counter'), document.getElementById('card-ctrls'), document.getElementById('card-prev'), document.getElementById('card-next'));
    const storageKey = document.body.dataset.storageKey || 'forgotten_japanese_words_ko';
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
    refreshWordbook();
    loadPromptText();
    loadExampleJson();
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
