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
    // 로컬스토리지 데이터 로드 파싱 (일본어 저장 키 강제 고정)
    const storageKey = 'forgotten_words_ko';
    let savedWords = JSON.parse(localStorage.getItem(storageKey) || '[]');
    let currentCardIdx = 0;
    let pendingWord = null;
    let promptContentText = '';
    let exampleJsonText = '';
    // 초기 외부 파일 로드 실행
    loadPromptText();
    loadExampleJson();
    // 반응형 고급 토스트 알림창 함수
    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '80px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        toast.style.backgroundColor = isError ? '#A94442' : '#3E3429';
        toast.style.color = '#FFFDFB';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        toast.style.zIndex = '9999';
        toast.style.fontSize = '14px';
        toast.style.fontFamily = 'sans-serif';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.pointerEvents = 'none';
        toast.style.textAlign = 'center';
        toast.style.minWidth = '250px';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 10);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 2500);
    }
    // 클립보드 복사 유틸리티 함수
    function copyTextToClipboard(text) {
        return new Promise((resolve) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => resolve(true))
                    .catch(() => fallbackCopy(text, resolve));
            }
            else {
                fallbackCopy(text, resolve);
            }
        });
    }
    function fallbackCopy(text, resolve) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.top = "-999999px";
            textArea.style.left = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            resolve(successful);
        }
        catch (err) {
            resolve(false);
        }
    }
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
                showToast('올바른 데이터 구조가 아닙니다.', true);
            }
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
    // 단어 직접 수동 추가
    addWordSubmit.addEventListener('click', () => {
        const jp = addJp.value.trim();
        const kana = addKana.value.trim();
        const mean = addMean.value.trim();
        if (!jp || !mean) {
            showToast('원형과 뜻은 필수 입력 항목입니다.', true);
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
            showToast('단어장에 추가되었습니다.');
        }
        else {
            showToast('이미 추가된 단어입니다.', true);
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
        showToast('단어가 삭제되었습니다.');
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
        if (idx < 0 || idx >= savedWords.length)
            return;
        const item = savedWords[idx];
        cardJp.textContent = item.text;
        cardHint.textContent = "클릭하여 뜻 확인";
        cardHint.classList.remove('revealed');
        cardCounter.textContent = `${idx + 1} / ${savedWords.length}`;
    }
    cardHint.addEventListener('click', function () {
        if (savedWords.length === 0)
            return;
        const item = savedWords[currentCardIdx];
        this.textContent = item.kana ? `${item.kana} ➔ ${item.mean}` : item.mean;
        this.classList.add('revealed');
    });
    cardPrev.addEventListener('click', () => {
        if (savedWords.length === 0)
            return;
        currentCardIdx = (currentCardIdx === 0) ? savedWords.length - 1 : currentCardIdx - 1;
        showCard(currentCardIdx);
    });
    cardNext.addEventListener('click', () => {
        if (savedWords.length === 0)
            return;
        currentCardIdx = (currentCardIdx === savedWords.length - 1) ? 0 : currentCardIdx + 1;
        showCard(currentCardIdx);
    });
    // 독서대 지문 컴포넌트 렌더링 시스템 (일본어 전용 최적화)
    function renderJSON(words) {
        viewerArea.innerHTML = '';
        words.forEach((wordData) => {
            const [type, text, kana, original, originalKana, contextMean, mean] = wordData;
            const pronunciation = kana || ""; // 스펠링 수정 완료
            const baseText = original && original.trim() ? original : text;
            const targetKana = originalKana && originalKana.trim() ? originalKana : pronunciation;
            const wordToSave = { text: baseText, kana: targetKana, mean: mean || "" };
            const displayMean = contextMean && contextMean.trim() ? contextMean : (mean || "");
            if (isLineBreakToken(text, mean || "")) {
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
                        this.dataset.hint = ` [${displayMean}]`;
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
                        // 👍 스펠링 수정 및 변수 매핑 정상화 완료
                        this.dataset.hint = ` (${pronunciation})`;
                        this.classList.add("stage-1");
                    }
                    else if (stage === 2) {
                        this.dataset.hint = ` (${pronunciation}) [${displayMean}]`;
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
        });
    }
    function parseJsonInput(input) {
        const cleaned = input
            .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
            .replace(/\s*\x60\x60\x60$/i, '')
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
            showToast('단어장에 보관되었습니다.');
        });
        return dialog;
    }
    // 괄호 오타가 완벽히 수정된 단어 알림창 호출 함수
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
            showToast('단어장이 초기화되었습니다.');
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
    function setReaderSupportVisible(isVisible) {
        readerSupportBoxes.forEach((box) => {
            box.style.display = isVisible ? 'block' : 'none';
        });
    }
    // 비동기 패치 흐름 및 변수 할당 로직 고정
    async function loadPromptText() {
        if (!promptTextEl)
            return;
        const src = promptTextEl.dataset.src || './prompt.txt';
        try {
            const response = await fetch(src);
            if (!response.ok)
                throw new Error();
            promptContentText = await response.text();
            promptTextEl.textContent = promptContentText;
        }
        catch (error) {
            promptTextEl.textContent = 'prompt.txt를 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.';
        }
    }
    // 비동기 패치 흐름 및 변수 할당 로직 고정
    async function loadExampleJson() {
        if (!exampleJsonEl)
            return;
        const src = exampleJsonEl.dataset.src || './example.json';
        try {
            const response = await fetch(src);
            if (!response.ok)
                throw new Error();
            exampleJsonText = await response.text();
            exampleJsonEl.textContent = exampleJsonText;
        }
        catch (error) {
            exampleJsonEl.textContent = 'example.json을 불러오지 못했습니다. 가상 서버(Live Server 등)를 구동했는지 확인해 주세요.';
        }
    }
    copyPromptBtn.addEventListener('click', () => {
        const textToCopy = promptContentText || promptTextEl.textContent || promptTextEl.innerText;
        if (!textToCopy || textToCopy.includes('불러오지 못했습니다'))
            return;
        copyTextToClipboard(textToCopy).then((success) => {
            if (success) {
                copyPromptBtn.textContent = "✓ 복사 완료";
                copyPromptBtn.classList.add('success');
                setTimeout(() => {
                    copyPromptBtn.textContent = "지침 복사하기";
                    copyPromptBtn.classList.remove('success');
                }, 2000);
            }
            else {
                showToast("복사에 실패했습니다.", true);
            }
        });
    });
    copyExampleBtn.addEventListener('click', () => {
        const textToCopy = exampleJsonText || exampleJsonEl.textContent || exampleJsonEl.innerText;
        if (!textToCopy || textToCopy.includes('불러오지 못했습니다'))
            return;
        copyTextToClipboard(textToCopy).then((success) => {
            if (success) {
                copyExampleBtn.textContent = "✓ 복사 완료";
                copyExampleBtn.classList.add('success');
                setTimeout(() => {
                    copyExampleBtn.textContent = "예시 복사하기";
                    copyExampleBtn.classList.remove('success');
                }, 2000);
            }
            else {
                showToast("복사에 실패했습니다.", true);
            }
        });
    });
});
export {};
