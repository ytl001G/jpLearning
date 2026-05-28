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

    const studyCard = new StudyCard(
        document.getElementById('card-jp') as HTMLDivElement,
        document.getElementById('card-hint') as HTMLDivElement,
        document.getElementById('card-counter') as HTMLDivElement,
        document.getElementById('card-ctrls') as HTMLDivElement,
        document.getElementById('card-prev') as HTMLButtonElement,
        document.getElementById('card-next') as HTMLButtonElement
    );

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
    setupSortDropdown(sortSelect);
    refreshWordbook();
    loadPromptText();
    loadExampleJson();

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

            renderReader(data.words, viewerArea, askAndSave);
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
        showToast('단어장에 추가되었습니다.');
    });

    clearAllBtn.addEventListener('click', (): void => {
        clearDialog.open();
    });

    sortSelect.addEventListener('change', (): void => {
        dictionary.setSortMode(sortSelect.value as DictionarySortMode);
        refreshWordbook();
    });

    copyPromptBtn.addEventListener('click', (): void => {
        copyLoadedText(promptContentText || promptTextEl.textContent || promptTextEl.innerText, copyPromptBtn, '지침 복사하기');
    });

    copyExampleBtn.addEventListener('click', (): void => {
        copyLoadedText(exampleJsonText || exampleJsonEl.textContent || exampleJsonEl.innerText, copyExampleBtn, '예시 복사하기');
    });

    function refreshWordbook(): void {
        const words = dictionary.getAll();
        renderWordbook(wordbookContainer, words, removeWord);
        studyCard.setWords(words);
    }

    function removeWord(text: string): void {
        if (!dictionary.remove(text)) return;
        refreshWordbook();
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
