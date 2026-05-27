// 인터페이스 및 타입 정의
interface WordItem {
    text: string;
    kana: string;
    mean: string;
}

// JSON 구조 파싱을 위한 튜플 타입 정의 [type, text, kana, original, mean]
type WordData = [number, string, string, string, string];

interface JsonData {
    words: WordData[];
}

document.addEventListener("DOMContentLoaded", (): void => {
    
    // 💡 탭 스위칭 기능 구현
    (window as any).switchTab = (tabId: string): void => {
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        
        const targetPage = document.getElementById(tabId);
        if (targetPage) targetPage.classList.add('active');
        
        const btnIdx = tabId === 'tab-reader' ? 0 : 1;
        const targetBtn = document.querySelectorAll('.tab-btn')[btnIdx];
        if (targetBtn) targetBtn.classList.add('active');

        if (tabId === 'tab-wordbook') {
            updateWordbookUI();
            initStudyCard();
        }
    };

    // DOM 요소 타입 단언(Type Assertion) 처리
    const inputPage = document.getElementById('input-page') as HTMLDivElement;
    const viewerPage = document.getElementById('viewer-page') as HTMLDivElement;
    const viewerArea = document.getElementById('viewer-area') as HTMLDivElement;
    const textInput = document.getElementById('text-input') as HTMLTextAreaElement;
    const processButton = document.getElementById('process-button') as HTMLButtonElement;
    const backButton = document.getElementById('back-button') as HTMLButtonElement;
    const copyPromptBtn = document.getElementById('copy-prompt-btn') as HTMLButtonElement;
    const promptTextEl = document.getElementById('prompt-text') as HTMLDivElement;
    const promptBox = document.querySelector('.prompt-box') as HTMLDivElement;

    const wordbookContainer = document.getElementById('wordbook-list-container') as HTMLDivElement;
    const clearAllBtn = document.getElementById('clear-all-btn') as HTMLButtonElement;
    const addJp = document.getElementById('add-jp') as HTMLInputElement;
    const addKana = document.getElementById('add-kana') as HTMLInputElement;
    const addMean = document.getElementById('add-mean') as HTMLInputElement;
    const addWordSubmit = document.getElementById('add-word-submit') as HTMLButtonElement;

    const cardJp = document.getElementById('card-jp') as HTMLDivElement;
    const cardHint = document.getElementById('card-hint') as HTMLDivElement;
    const cardCounter = document.getElementById('card-counter') as HTMLDivElement;
    const cardCtrls = document.getElementById('card-ctrls') as HTMLDivElement;
    const cardPrev = document.getElementById('card-prev') as HTMLButtonElement;
    const cardNext = document.getElementById('card-next') as HTMLButtonElement;

    const puncList: string[] = ["。", "、", "「", "」", "『", "』", "(", ")", "！", "？", "!", "?", "：", "—"];
    const saveDialog = createSaveDialog();
    const clearDialog = createClearDialog();
    
    // 로컬스토리지 데이터 로드 파싱
    let savedWords: WordItem[] = JSON.parse(localStorage.getItem('fogotten_japanese_words') || '[]');
    let currentCardIdx: number = 0;
    let pendingWord: WordItem | null = null;
    let promptContentText: string = '';

    loadPromptText();

    // 지문 분석기 구동
    processButton.addEventListener('click', (): void => {
        const jsonText: string = textInput.value.trim();
        if (!jsonText) return;
        try {
            const data: JsonData = JSON.parse(jsonText);
            if (data && Array.isArray(data.words)) {
                renderJSON(data.words);
                inputPage.style.display = 'none';
                viewerPage.style.display = 'block';
                promptBox.style.display = 'none';
            } else {
                alert('올바른 데이터 구조가 아닙니다.');
            }
        } catch (e) {
            alert('JSON 형식을 다시 확인해 주세요.');
        }
    });

    backButton.addEventListener('click', (): void => {
        viewerPage.style.display = 'none';
        inputPage.style.display = 'flex';
        promptBox.style.display = 'block';
    });

    // 단어 직접 수동 추가
    addWordSubmit.addEventListener('click', (): void => {
        const jp: string = addJp.value.trim();
        const kana: string = addKana.value.trim();
        const mean: string = addMean.value.trim();
        
        if (!jp || !mean) { 
            alert('표기와 뜻은 필수 입력 항목입니다.'); 
            return; 
        }
        
        if (!savedWords.some((item: WordItem) => item.text === jp)) {
            savedWords.push({ text: jp, kana: kana, mean: mean });
            localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
            addJp.value = ''; addKana.value = ''; addMean.value = '';
            updateWordbookUI();
            initStudyCard();
        } else { 
            alert('이미 추가된 단어입니다.'); 
        }
    });

    // 전체 삭제 기능
    clearAllBtn.addEventListener('click', (): void => {
        openClearDialog();
    });

    // 단어 개별 삭제 핸들러 전역 바인딩
    (window as any).removeSingleWord = (text: string): void => {
        savedWords = savedWords.filter((item: WordItem) => item.text !== text);
        localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
        updateWordbookUI();
        if (currentCardIdx >= savedWords.length) {
            currentCardIdx = Math.max(0, savedWords.length - 1);
        }
        initStudyCard();
    };

    // 저장된 단어 리스트 출력 UI 빌더
    function updateWordbookUI(): void {
        wordbookContainer.innerHTML = '';
        if (savedWords.length === 0) {
            wordbookContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:30px 0; font-size:14px;">저장된 단어가 없습니다.</div>';
            return;
        }
        savedWords.forEach((item: WordItem) => {
            const div: HTMLDivElement = document.createElement('div');
            div.className = 'wordbook-item';
            const meta: string = item.kana ? `(${item.kana}) [${item.mean}]` : `[${item.mean}]`;
            div.innerHTML = `<div><span class="jp">${item.text}</span><span class="meta">${meta}</span></div>
                             <button class="remove-btn" onclick="removeSingleWord('${item.text}')">✕</button>`;
            wordbookContainer.appendChild(div);
        });
    }

    // 암기 카드 상태 컨트롤러
    function initStudyCard(): void {
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

    function showCard(idx: number): void {
        const item: WordItem = savedWords[idx];
        cardJp.textContent = item.text;
        cardHint.textContent = "클릭하여 뜻 확인";
        cardHint.classList.remove('revealed');
        cardCounter.textContent = `${idx + 1} / ${savedWords.length}`;
    }

    cardHint.addEventListener('click', function(this: HTMLDivElement): void {
        const item: WordItem = savedWords[currentCardIdx];
        this.textContent = item.kana ? `${item.kana} ➔ ${item.mean}` : item.mean;
        this.classList.add('revealed');
    });

    cardPrev.addEventListener('click', (): void => {
        if (currentCardIdx > 0) { 
            currentCardIdx--; 
            showCard(currentCardIdx); 
        }
    });
    
    cardNext.addEventListener('click', (): void => {
        if (currentCardIdx < savedWords.length - 1) { 
            currentCardIdx++; 
            showCard(currentCardIdx); 
        }
    });

    // 독서대 지문 컴포넌트 렌더링 시스템
    function renderJSON(words: WordData[]): void {
        viewerArea.innerHTML = '';
        words.forEach((wordData: WordData) => {
            const [type, text, kana, , mean] = wordData; 
            
            if (text === "\\n" || mean === "줄바꿈") {
                const br: HTMLBRElement = document.createElement('br');
                const brBlock: HTMLSpanElement = document.createElement('span');
                brBlock.className = 'br-block';
                viewerArea.appendChild(br); 
                viewerArea.appendChild(brBlock);
                return;
            }
            
            const span: HTMLSpanElement = document.createElement('span');
            span.className = 'word'; 
            span.textContent = text;
            
            if (type === 2 && puncList.includes(text)) { 
                viewerArea.appendChild(span); 
                return; 
            }

            span.classList.add('playable');
            span.dataset.stage = "0";

            const isKanaOmitted: boolean = (!kana || !kana.trim() || text === kana);

            span.addEventListener('click', function(this: HTMLSpanElement) {
                let stage: number = parseInt(this.dataset.stage || "0");
                this.classList.remove("stage-1", "stage-2", "stage-3");

                if (isKanaOmitted || type === 2 || type === 4) {
                    stage = (stage + 1) % 2;
                    if (stage === 1) { 
                        this.dataset.hint = ` [${mean}]`; 
                        this.classList.add("stage-3"); 
                        askAndSave({ text, kana: "", mean });
                    } else { 
                        this.dataset.hint = ""; 
                    }
                } else {
                    stage = (stage + 1) % 3;
                    if (stage === 1) { 
                        this.dataset.hint = ` (${kana})`; 
                        this.classList.add("stage-1"); 
                    } else if (stage === 2) { 
                        this.dataset.hint = ` (${kana}) [${mean}]`; 
                        this.classList.add("stage-2"); 
                        askAndSave({ text, kana, mean });
                    } else { 
                        this.dataset.hint = ""; 
                    }
                }
                this.dataset.stage = stage.toString();
            });
            viewerArea.appendChild(span);
        });
    }

    // 글 안에서 찾은 단어 저장 확인창
    function createSaveDialog(): HTMLDivElement {
        const dialog: HTMLDivElement = document.createElement('div');
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

        const cancelBtn = dialog.querySelector('.word-save-cancel') as HTMLButtonElement;
        const confirmBtn = dialog.querySelector('.word-save-confirm') as HTMLButtonElement;

        cancelBtn.addEventListener('click', closeSaveDialog);
        dialog.addEventListener('click', (event: MouseEvent): void => {
            if (event.target === dialog) closeSaveDialog();
        });
        confirmBtn.addEventListener('click', (): void => {
            if (!pendingWord || savedWords.some((item: WordItem) => item.text === pendingWord!.text)) {
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

    function openSaveDialog(wordObj: WordItem): void {
        pendingWord = wordObj;
        const title = saveDialog.querySelector('.word-save-title') as HTMLDivElement;
        const meta = saveDialog.querySelector('.word-save-meta') as HTMLDivElement;

        title.textContent = wordObj.text;
        meta.textContent = wordObj.kana ? `${wordObj.kana} · ${wordObj.mean}` : wordObj.mean;
        saveDialog.classList.add('show');
        saveDialog.setAttribute('aria-hidden', 'false');

        const confirmBtn = saveDialog.querySelector('.word-save-confirm') as HTMLButtonElement;
        confirmBtn.focus();
    }

    function closeSaveDialog(): void {
        saveDialog.classList.remove('show');
        saveDialog.setAttribute('aria-hidden', 'true');
        pendingWord = null;
    }

    function createClearDialog(): HTMLDivElement {
        const dialog: HTMLDivElement = document.createElement('div');
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

        const cancelBtn = dialog.querySelector('.word-save-cancel') as HTMLButtonElement;
        const confirmBtn = dialog.querySelector('.word-clear-confirm') as HTMLButtonElement;

        cancelBtn.addEventListener('click', closeClearDialog);
        dialog.addEventListener('click', (event: MouseEvent): void => {
            if (event.target === dialog) closeClearDialog();
        });
        confirmBtn.addEventListener('click', (): void => {
            savedWords = [];
            localStorage.setItem('fogotten_japanese_words', JSON.stringify(savedWords));
            updateWordbookUI();
            initStudyCard();
            closeClearDialog();
        });

        return dialog;
    }

    function openClearDialog(): void {
        clearDialog.classList.add('show');
        clearDialog.setAttribute('aria-hidden', 'false');

        const cancelBtn = clearDialog.querySelector('.word-save-cancel') as HTMLButtonElement;
        cancelBtn.focus();
    }

    function closeClearDialog(): void {
        clearDialog.classList.remove('show');
        clearDialog.setAttribute('aria-hidden', 'true');
    }

    function askAndSave(wordObj: WordItem): void {
        if (savedWords.some((item: WordItem) => item.text === wordObj.text)) return;
        setTimeout(() => openSaveDialog(wordObj), 100); 
    }

    // 프롬프트 파일 로드 및 복사
    async function loadPromptText(): Promise<void> {
        if (!promptTextEl) return;

        const src = promptTextEl.dataset.src || 'prompt.txt';
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`Failed to load ${src}`);

            promptContentText = await response.text();
            promptTextEl.textContent = promptContentText;
        } catch (error) {
            promptTextEl.textContent = 'prompt.txt를 불러오지 못했습니다. 로컬 서버로 실행한 뒤 다시 확인해 주세요.';
        }
    }

    copyPromptBtn.addEventListener('click', (): void => {
        const textToCopy = promptContentText || promptTextEl.innerText;
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy).then(() => {
            copyPromptBtn.textContent = "✓ 복사 완료"; 
            copyPromptBtn.classList.add('success');
            setTimeout(() => { 
                copyPromptBtn.textContent = "지침 복사하기"; 
                copyPromptBtn.classList.remove('success'); 
            }, 2000);
        });
    });
});
