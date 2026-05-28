const PUNCTUATION = new Set([
    '。', '、', '「', '」', '『', '』', '.', ',', '"', "'", '“', '”',
    '‘', '’', '(', ')', '！', '？', '!', '?', '：', ':', ';', '—', '-'
]);
export function renderReader(words, viewerArea, onSaveRequest) {
    viewerArea.innerHTML = '';
    words.forEach((wordData) => {
        const [type, text, kana, original, originalKana, contextMean, mean] = wordData;
        const pronunciation = kana || '';
        const baseText = original && original.trim() ? original : text;
        const targetKana = originalKana && originalKana.trim() ? originalKana : pronunciation;
        const wordToSave = { text: baseText, kana: targetKana, mean: mean || '' };
        const displayMean = contextMean && contextMean.trim() ? contextMean : (mean || '');
        if (isLineBreakToken(text, mean || '')) {
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
        if (type === 2 && PUNCTUATION.has(text)) {
            viewerArea.appendChild(span);
            return;
        }
        span.classList.add('playable');
        span.dataset.stage = '0';
        const isPronunciationOmitted = !pronunciation.trim() || text === pronunciation;
        span.addEventListener('click', function () {
            let stage = Number.parseInt(this.dataset.stage || '0', 10);
            this.classList.remove('stage-1', 'stage-2', 'stage-3');
            if (isPronunciationOmitted || type === 2 || type === 4) {
                stage = (stage + 1) % 2;
                if (stage === 1) {
                    this.dataset.hint = ` [${displayMean}]`;
                    this.classList.add('stage-3');
                }
                else {
                    this.dataset.hint = '';
                }
            }
            else {
                stage = (stage + 1) % 3;
                if (stage === 1) {
                    this.dataset.hint = ` (${pronunciation})`;
                    this.classList.add('stage-1');
                }
                else if (stage === 2) {
                    this.dataset.hint = ` (${pronunciation}) [${displayMean}]`;
                    this.classList.add('stage-2');
                }
                else {
                    this.dataset.hint = '';
                }
            }
            this.dataset.stage = stage.toString();
        });
        span.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            onSaveRequest(wordToSave);
        });
        viewerArea.appendChild(span);
    });
}
export function renderWordbook(container, words, onRemove) {
    container.innerHTML = '';
    if (words.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'wordbook-empty';
        empty.textContent = '저장된 단어가 없습니다.';
        container.appendChild(empty);
        return;
    }
    words.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'wordbook-item';
        const body = document.createElement('div');
        const jp = document.createElement('span');
        const meta = document.createElement('span');
        const removeBtn = document.createElement('button');
        jp.className = 'jp';
        jp.textContent = item.text;
        meta.className = 'meta';
        meta.textContent = item.kana ? `(${item.kana}) [${item.mean}]` : `[${item.mean}]`;
        removeBtn.className = 'remove-btn';
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => onRemove(item.text));
        body.append(jp, meta);
        div.append(body, removeBtn);
        container.appendChild(div);
    });
}
export class StudyCard {
    constructor(cardJp, cardHint, cardCounter, cardCtrls, cardPrev, cardNext) {
        this.cardJp = cardJp;
        this.cardHint = cardHint;
        this.cardCounter = cardCounter;
        this.cardCtrls = cardCtrls;
        this.cardPrev = cardPrev;
        this.cardNext = cardNext;
        this.index = 0;
        this.words = [];
        this.cardHint.addEventListener('click', () => this.reveal());
        this.cardPrev.addEventListener('click', () => this.move(-1));
        this.cardNext.addEventListener('click', () => this.move(1));
    }
    setWords(words) {
        this.words = words;
        if (this.index >= words.length) {
            this.index = Math.max(0, words.length - 1);
        }
        this.render();
    }
    render() {
        if (this.words.length === 0) {
            this.cardJp.textContent = '단어장이 비어있습니다';
            this.cardHint.style.display = 'none';
            this.cardCtrls.style.display = 'none';
            this.cardCounter.textContent = '0 / 0';
            return;
        }
        const item = this.words[this.index];
        this.cardHint.style.display = 'inline-block';
        this.cardCtrls.style.display = 'flex';
        this.cardJp.textContent = item.text;
        this.cardHint.textContent = '클릭하여 뜻 확인';
        this.cardHint.classList.remove('revealed');
        this.cardCounter.textContent = `${this.index + 1} / ${this.words.length}`;
    }
    reveal() {
        if (this.words.length === 0)
            return;
        const item = this.words[this.index];
        this.cardHint.textContent = item.kana ? `${item.kana} ➔ ${item.mean}` : item.mean;
        this.cardHint.classList.add('revealed');
    }
    move(delta) {
        if (this.words.length === 0)
            return;
        this.index = (this.index + delta + this.words.length) % this.words.length;
        this.render();
    }
}
export function createSaveDialog(onConfirm) {
    let pendingWord = null;
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
    const close = () => {
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
        pendingWord = null;
    };
    cancelBtn.addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
    confirmBtn.addEventListener('click', () => {
        if (pendingWord)
            onConfirm(pendingWord);
        close();
    });
    const open = (word) => {
        pendingWord = word;
        const title = dialog.querySelector('.word-save-title');
        const meta = dialog.querySelector('.word-save-meta');
        title.textContent = word.text;
        meta.textContent = word.kana ? `${word.kana} · ${word.mean}` : word.mean;
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        confirmBtn.focus();
    };
    return { open, close };
}
export function createClearDialog(onConfirm) {
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
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
    confirmBtn.addEventListener('click', () => {
        onConfirm();
        close();
    });
    return { open, close };
}
function isLineBreakToken(text, mean) {
    return text === '\n' || text === '\\n' || mean === '줄바꿈';
}
