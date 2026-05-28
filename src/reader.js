"use strict";
document.addEventListener("DOMContentLoaded", () => {
    // 💡 탭 스위칭 기능 구현
    window.switchTab = (tabId) => {
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const targetPage = document.getElementById(tabId);
        if (targetPage)
            targetPage.classList.add('active');
        const btnIdx = tabId === 'tab-reader' ? 0 : 1;
        const targetBtn = document.querySelectorAll('.tab-btn')[btnIdx];
        if (targetBtn)
            targetBtn.classList.add('active');
        if (tabId === 'tab-wordbook') {
            updateWordbookUI();
            initStudyCard();
        }
    };
    // DOM 요소 타입 단언(Type Assertion) 처리
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
    const addJp = document.getElementById('add-jp');
    const addKana = document.getElementById('add-kana');
    const addMean = document.getElementById('add-mean');
    const addWordSubmit = document.getElementById('add-word-submit');
    const cardJp = document.getElementById('card-jp');
    const cardHint = document.getElementById('card-hint');
    const cardCounter = document.getElementById('card-counter');
    const cardCtrls = document.getElementById('card-ctrls');
    const cardPrev = document.getElementById('card-prev');
    const cardNext = document.getElementById('card-next');
    const puncList = ["。", "、", "「", "」", "『", "』", ".", ",", "\"", "'", "“", "”", "‘", "’", "(", ")", "！", "？", "!", "?", "：", ":", ";", "—", "-"];
    const saveDialog = createSaveDialog();
    const clearDialog = createClearDialog();
    // 로컬스토리지 데이터 로드 파싱
    const storageKey = document.body.dataset.storageKey || 'forgotten_words_ko';
    const isEnglishReader = storageKey === 'forgotten_english_words_ko';
    let savedWords = JSON.parse(localStorage.getItem(storageKey) || '[]');
    let currentCardIdx = 0;
    let pendingWord = null;
    let promptContentText = '';
    let exampleJsonText = '';
    loadPromptText();
    loadExampleJson();
    // 지문 분석기 구동
    processButton.addEventListener('click', () => {
        const jsonText = textInput.value.trim();
        if (!jsonText)
            return;
        try {
            const data = parseJsonInput(jsonText);
            if (data && Array.isArray(data.words)) {
                renderJSON(data.words);
                inputPage.style.display = 'none';
                viewerPage.style.display = 'block';
                setReaderSupportVisible(false);
            }
            else {
                alert('올바른 데이터 구조가 아닙니다.');
            }
        }
        catch (e) {
            alert('JSON 형식을 다시 확인해 주세요.');
        }
    });
    backButton.addEventListener('click', () => {
        viewerPage.style.display = 'none';
        inputPage.style.display = 'flex';
        setReaderSupportVisible(true);
    });
    // 단어 직접 수동 추가
    addWordSubmit.addEventListener('click', () => {
        const jp = addJp.value.trim();
        const kana = addKana.value.trim();
        const mean = addMean.value.trim();
        if (!jp || !mean) {
            alert('원형과 뜻은 필수 입력 항목입니다.');
            return;
        }
        if (!savedWords.some((item) => item.text === jp)) {
            savedWords.push({ text: jp, kana: kana, mean: mean });
            localStorage.setItem(storageKey, JSON.stringify(savedWords));
            addJp.value = '';
            addKana.value = '';
            addMean.value = '';
            updateWordbookUI();
            initStudyCard();
        }
        else {
            alert('이미 추가된 단어입니다.');
        }
    });
    // 전체 삭제 기능
    clearAllBtn.addEventListener('click', () => {
        openClearDialog();
    });
    // 단어 개별 삭제 핸들러 전역 바인딩
    window.removeSingleWord = (text) => {
        savedWords = savedWords.filter((item) => item.text !== text);
        localStorage.setItem(storageKey, JSON.stringify(savedWords));
        updateWordbookUI();
        if (currentCardIdx >= savedWords.length) {
            currentCardIdx = Math.max(0, savedWords.length - 1);
        }
        initStudyCard();
    };
    // 저장된 단어 리스트 출력 UI 빌더
    function updateWordbookUI() {
        wordbookContainer.innerHTML = '';
        if (savedWords.length === 0) {
            wordbookContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px 0; font-size:14px;">저장된 단어가 없습니다.</div>';
            return;
        }
        savedWords.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'wordbook-item';
            const meta = formatWordMeta(item);
            div.innerHTML = `<div><span class="jp">${item.text}</span><span class="meta">${meta}</span></div>
                             <button class="remove-btn" onclick="removeSingleWord('${item.text}')">✕</button>`;
            wordbookContainer.appendChild(div);
        });
    }
    // 암기 카드 상태 컨트롤러
    function initStudyCard() {
        if (savedWords.length === 0) {
            cardJp.textContent = "단어장이 비어있습니다";
            cardHint.style.display = "none";
            cardCtrls.style.display = "none";
            cardCounter.textContent = "0 / 0";
            return;
        }
        cardHint.style.display = "inline-block";
        cardCtrls.style.display = "flex";
        showCard(currentCardIdx);
    }
    function showCard(idx) {
        const item = savedWords[idx];
        cardJp.textContent = item.text;
        cardHint.textContent = "클릭하여 뜻 확인";
        cardHint.classList.remove('revealed');
        cardCounter.textContent = `${idx + 1} / ${savedWords.length}`;
    }
    cardHint.addEventListener('click', function () {
        const item = savedWords[currentCardIdx];
        this.textContent = item.kana ? `${item.kana} ➔ ${item.mean}` : item.mean;
        this.classList.add('revealed');
    });
    cardPrev.addEventListener('click', () => {
        if (currentCardIdx > 0) {
            currentCardIdx--;
            showCard(currentCardIdx);
        }
    });
    cardNext.addEventListener('click', () => {
        if (currentCardIdx < savedWords.length - 1) {
            currentCardIdx++;
            showCard(currentCardIdx);
        }
    });
    // 독서대 지문 컴포넌트 렌더링 시스템
    function renderJSON(words) {
        viewerArea.innerHTML = '';
        words.forEach((wordData, index) => {
            const [type, text, kana, original, mean] = wordData;
            const pronunciation = kana || "";
            const baseText = original && original.trim() ? original : text;
            const wordToSave = { text: baseText, kana: pronunciation, mean };
            if (isLineBreakToken(text, mean)) {
                const br = document.createElement('br');
                const brBlock = document.createElement('span');
                brBlock.className = 'br-block';
                viewerArea.appendChild(br);
                viewerArea.appendChild(brBlock);
                return;
            }
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = text;
            if (type === 2 && puncList.includes(text)) {
                viewerArea.appendChild(span);
                appendEnglishSpaceIfNeeded(words, index, text);
                return;
            }
            span.classList.add('playable');
            span.dataset.stage = "0";
            const isPronunciationOmitted = (!pronunciation || !pronunciation.trim() || text === pronunciation);
            span.addEventListener('click', function () {
                let stage = parseInt(this.dataset.stage || "0");
                this.classList.remove("stage-1", "stage-2", "stage-3");
                if (isPronunciationOmitted || type === 2 || type === 4) {
                    stage = (stage + 1) % 2;
                    if (stage === 1) {
                        this.dataset.hint = ` [${mean}]`;
                        this.classList.add("stage-3");
                        askAndSave(wordToSave);
                    }
                    else {
                        this.dataset.hint = "";
                    }
                }
                else {
                    stage = (stage + 1) % 3;
                    if (stage === 1) {
                        this.dataset.hint = ` (${pronunciation})`;
                        this.classList.add("stage-1");
                    }
                    else if (stage === 2) {
                        this.dataset.hint = ` (${pronunciation}) [${mean}]`;
                        this.classList.add("stage-2");
                        askAndSave(wordToSave);
                    }
                    else {
                        this.dataset.hint = "";
                    }
                }
                this.dataset.stage = stage.toString();
            });
            viewerArea.appendChild(span);
            appendEnglishSpaceIfNeeded(words, index, text);
        });
    }
    function appendEnglishSpaceIfNeeded(words, index, currentText) {
        if (!isEnglishReader)
            return;
        const next = words[index + 1];
        if (!next || isLineBreakToken(next[1], next[4]))
            return;
        const nextText = next[1];
        const noSpaceBefore = [".", ",", "!", "?", ":", ";", ")", "]", "}", "'", "\""];
        const noSpaceAfter = ["(", "[", "{", "'", "\""];
        if (noSpaceBefore.includes(nextText) || noSpaceAfter.includes(currentText))
            return;
        viewerArea.appendChild(document.createTextNode(" "));
    }
    function parseJsonInput(input) {
        const cleaned = input
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        try {
            return JSON.parse(cleaned);
        }
        catch (error) {
            const start = cleaned.indexOf('{');
            const end = cleaned.lastIndexOf('}');
            if (start === -1 || end === -1 || end <= start)
                throw error;
            return JSON.parse(cleaned.slice(start, end + 1));
        }
    }
    function isLineBreakToken(text, mean) {
        return text === '\n' || text === '\\n' || mean === '줄바꿈';
    }
    function formatWordMeta(item) {
        return item.kana ? `(${item.kana}) [${item.mean}]` : `[${item.mean}]`;
    }
    function setReaderSupportVisible(isVisible) {
        readerSupportBoxes.forEach((box) => {
            box.style.display = isVisible ? 'block' : 'none';
        });
    }
    // 글 안에서 찾은 단어 저장 확인창
    function createSaveDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'word-save-dialog';
        dialog.setAttribute('aria-hidden', 'true');
        dialog.innerHTML = `
            <div class="word-save-card" role="dialog" aria-modal="true" aria-labelledby="word-save-title">
                <div class="word-save-label">단어 안내</div>
                <div class="word-save-title" id="word-save-title"></div>
                <div class="word-save-meta"></div>
                <div class="word-save-message">이 단어를 모르는 단어장에 보관할까요?</div>
                <div class="word-save-actions">
                    <button type="button" class="word-save-cancel">나중에</button>
                    <button type="button" class="word-save-confirm">보관하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        const cancelBtn = dialog.querySelector('.word-save-cancel');
        const confirmBtn = dialog.querySelector('.word-save-confirm');
        cancelBtn.addEventListener('click', closeSaveDialog);
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog)
                closeSaveDialog();
        });
        confirmBtn.addEventListener('click', () => {
            if (!pendingWord || savedWords.some((item) => item.text === pendingWord.text)) {
                closeSaveDialog();
                return;
            }
            savedWords.push(pendingWord);
            localStorage.setItem(storageKey, JSON.stringify(savedWords));
            updateWordbookUI();
            initStudyCard();
            closeSaveDialog();
        });
        return dialog;
    }
    function openSaveDialog(wordObj) {
        pendingWord = wordObj;
        const title = saveDialog.querySelector('.word-save-title');
        const meta = saveDialog.querySelector('.word-save-meta');
        title.textContent = wordObj.text;
        meta.textContent = wordObj.kana ? `${wordObj.kana} · ${wordObj.mean}` : wordObj.mean;
        saveDialog.classList.add('show');
        saveDialog.setAttribute('aria-hidden', 'false');
        const confirmBtn = saveDialog.querySelector('.word-save-confirm');
        confirmBtn.focus();
    }
    function closeSaveDialog() {
        saveDialog.classList.remove('show');
        saveDialog.setAttribute('aria-hidden', 'true');
        pendingWord = null;
    }
    function createClearDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'word-save-dialog';
        dialog.setAttribute('aria-hidden', 'true');
        dialog.innerHTML = `
            <div class="word-save-card clear-card" role="dialog" aria-modal="true" aria-labelledby="clear-dialog-title">
                <div class="word-save-label danger-label">단어장 정리</div>
                <div class="word-save-title" id="clear-dialog-title">전체 삭제</div>
                <div class="word-save-message">저장된 단어를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.</div>
                <div class="word-save-actions">
                    <button type="button" class="word-save-cancel">취소</button>
                    <button type="button" class="word-clear-confirm">삭제하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        const cancelBtn = dialog.querySelector('.word-save-cancel');
        const confirmBtn = dialog.querySelector('.word-clear-confirm');
        cancelBtn.addEventListener('click', closeClearDialog);
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog)
                closeClearDialog();
        });
        confirmBtn.addEventListener('click', () => {
            savedWords = [];
            localStorage.setItem(storageKey, JSON.stringify(savedWords));
            updateWordbookUI();
            initStudyCard();
            closeClearDialog();
        });
        return dialog;
    }
    function openClearDialog() {
        clearDialog.classList.add('show');
        clearDialog.setAttribute('aria-hidden', 'false');
        const cancelBtn = clearDialog.querySelector('.word-save-cancel');
        cancelBtn.focus();
    }
    function closeClearDialog() {
        clearDialog.classList.remove('show');
        clearDialog.setAttribute('aria-hidden', 'true');
    }
    function askAndSave(wordObj) {
        if (savedWords.some((item) => item.text === wordObj.text))
            return;
        setTimeout(() => openSaveDialog(wordObj), 100);
    }
    // 프롬프트 파일 로드 및 복사
    async function loadPromptText() {
        if (!promptTextEl)
            return;
        const src = promptTextEl.dataset.src || 'prompt.txt';
        try {
            const response = await fetch(src);
            if (!response.ok)
                throw new Error(`Failed to load ${src}`);
            promptContentText = await response.text();
            promptTextEl.textContent = promptContentText;
        }
        catch (error) {
            promptTextEl.textContent = 'prompt.txt를 불러오지 못했습니다. 로컬 서버로 실행한 뒤 다시 확인해 주세요.';
        }
    }
    async function loadExampleJson() {
        if (!exampleJsonEl)
            return;
        const src = exampleJsonEl.dataset.src || 'example.json';
        try {
            const response = await fetch(src);
            if (!response.ok)
                throw new Error(`Failed to load ${src}`);
            exampleJsonText = await response.text();
            exampleJsonEl.textContent = exampleJsonText;
        }
        catch (error) {
            exampleJsonEl.textContent = 'example.json을 불러오지 못했습니다. 로컬 서버로 실행한 뒤 다시 확인해 주세요.';
        }
    }
    copyPromptBtn.addEventListener('click', () => {
        const textToCopy = promptContentText || promptTextEl.innerText;
        if (!textToCopy)
            return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyPromptBtn.textContent = "✓ 복사 완료";
            copyPromptBtn.classList.add('success');
            setTimeout(() => {
                copyPromptBtn.textContent = "지침 복사하기";
                copyPromptBtn.classList.remove('success');
            }, 2000);
        });
    });
    copyExampleBtn.addEventListener('click', () => {
        const textToCopy = exampleJsonText || exampleJsonEl.innerText;
        if (!textToCopy)
            return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyExampleBtn.textContent = "✓ 복사 완료";
            copyExampleBtn.classList.add('success');
            setTimeout(() => {
                copyExampleBtn.textContent = "예시 복사하기";
                copyExampleBtn.classList.remove('success');
            }, 2000);
        });
    });
});
