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
    const puncList = ["。", "、", "「", "」", "『", "』", "(", ")", "！", "？", "!", "?", "：", "—"];
    const saveDialog = createSaveDialog();
    // 로컬스토리지 데이터 로드 파싱
    let savedWords = JSON.parse(localStorage.getItem('fogotten_japanese_words') || '[]');
    let currentCardIdx = 0;
    let pendingWord = null;
    // 지문 분석기 구동
    processButton.addEventListener('click', () => {
        const jsonText = textInput.value.trim();
        if (!jsonText)
            return;
        try {
            const data = JSON.parse(jsonText);
            if (data && Array.isArray(data.words)) {
                renderJSON(data.words);
                inputPage.style.display = 'none';
                viewerPage.style.display = 'block';
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
    });
    // 단어 직접 수동 추가
    addWordSubmit.addEventListener('click', () => {
        const jp = addJp.value.trim();
        const kana = addKana.value.trim();
        const mean = addMean.value.trim();
        if (!jp || !mean) {
            alert('표기와 뜻은 필수 입력 항목입니다.');
            return;
        }
        if (!savedWords.some((item) => item.text === jp)) {
            savedWords.push({ text: jp, kana: kana, mean: mean });
            localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
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
        if (confirm('단어장을 초기화하시겠습니까?')) {
            savedWords = [];
            localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
            updateWordbookUI();
            initStudyCard();
        }
    });
    // 단어 개별 삭제 핸들러 전역 바인딩
    window.removeSingleWord = (text) => {
        savedWords = savedWords.filter((item) => item.text !== text);
        localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
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
            const meta = item.kana ? `(${item.kana}) [${item.mean}]` : `[${item.mean}]`;
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
        words.forEach((wordData) => {
            const [type, text, kana, , mean] = wordData;
            if (text === "\\n" || mean === "줄바꿈") {
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
            const isKanaOmitted = (!kana || !kana.trim() || text === kana);
            span.addEventListener('click', function () {
                let stage = parseInt(this.dataset.stage || "0");
                this.classList.remove("stage-1", "stage-2", "stage-3");
                if (isKanaOmitted || type === 2 || type === 4) {
                    stage = (stage + 1) % 2;
                    if (stage === 1) {
                        this.dataset.hint = ` [${mean}]`;
                        this.classList.add("stage-3");
                        askAndSave({ text, kana: "", mean });
                    }
                    else {
                        this.dataset.hint = "";
                    }
                }
                else {
                    stage = (stage + 1) % 3;
                    if (stage === 1) {
                        this.dataset.hint = ` (${kana})`;
                        this.classList.add("stage-1");
                    }
                    else if (stage === 2) {
                        this.dataset.hint = ` (${kana}) [${mean}]`;
                        this.classList.add("stage-2");
                        askAndSave({ text, kana, mean });
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
            localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
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
    function askAndSave(wordObj) {
        if (savedWords.some((item) => item.text === wordObj.text))
            return;
        setTimeout(() => openSaveDialog(wordObj), 100);
    }
    // 프롬프트 가이드라인 복사 스크립트
    copyPromptBtn.addEventListener('click', () => {
        const promptText = document.getElementById('prompt-text');
        if (promptText) {
            navigator.clipboard.writeText(promptText.innerText).then(() => {
                copyPromptBtn.textContent = "✓ 복사 완료";
                copyPromptBtn.classList.add('success');
                setTimeout(() => {
                    copyPromptBtn.textContent = "지침 복사하기";
                    copyPromptBtn.classList.remove('success');
                }, 2000);
            });
        }
    });
});
