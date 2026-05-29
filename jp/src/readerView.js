import { showToast } from './utils.js';
const PUNCTUATION = new Set([
    '。', '、', '「', '」', '『', '』', '.', ',', '"', "'", '“', '”',
    '‘', '’', '(', ')', '！', '？', '!', '?', '：', ':', ';', '—', '-'
]);
export function renderReader(words, viewerArea, onSaveRequest, savedWords = [], // 💡 유연한 타입 지원 유지
resetStages = false // 🌟 [추가] 상태를 강제로 초기화할지 결정하는 플래그
) {
    const stageBackup = {};
    // 🌟 resetStages가 false일 때만 기존에 열려있던 단어 단계(Stage)를 기억합니다.
    if (!resetStages) {
        const existingSpans = viewerArea.querySelectorAll('span.playable');
        existingSpans.forEach((el, index) => {
            const span = el;
            const stageVal = span.dataset.stage || '0';
            if (stageVal !== '0') {
                stageBackup[index] = stageVal;
            }
        });
    }
    viewerArea.innerHTML = '';
    let playableIndex = 0;
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
        // 🌟 초기화 플래그가 켜졌다면 무조건 '0'단계(숨김), 아니라면 백업된 단계를 불러옵니다.
        const savedStage = resetStages ? '0' : (stageBackup[playableIndex] || '0');
        span.dataset.stage = savedStage;
        const isPronunciationOmitted = !pronunciation.trim() || text === pronunciation;
        restoreStageUI(span, Number.parseInt(savedStage, 10), isPronunciationOmitted, type, pronunciation, displayMean);
        playableIndex++;
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
            let currentList = [];
            if (Array.isArray(savedWords)) {
                currentList = savedWords;
            }
            else if (savedWords && typeof savedWords === 'object' && 'list' in savedWords) {
                currentList = savedWords.list;
            }
            const isAlreadySaved = currentList.some((item) => {
                return item.text.trim() === wordToSave.text.trim();
            });
            if (isAlreadySaved) {
                showToast('이미 저장된 단어입니다.');
            }
            else {
                onSaveRequest(wordToSave);
            }
        });
        viewerArea.appendChild(span);
    });
}
function restoreStageUI(span, stage, isPronunciationOmitted, type, pronunciation, displayMean) {
    if (stage === 0) {
        span.dataset.hint = '';
        return;
    }
    span.classList.remove('stage-1', 'stage-2', 'stage-3');
    if (isPronunciationOmitted || type === 2 || type === 4) {
        if (stage === 1) {
            span.dataset.hint = ` [${displayMean}]`;
            span.classList.add('stage-3');
        }
    }
    else {
        if (stage === 1) {
            span.dataset.hint = ` (${pronunciation})`;
            span.classList.add('stage-1');
        }
        else if (stage === 2) {
            span.dataset.hint = ` (${pronunciation}) [${displayMean}]`;
            span.classList.add('stage-2');
        }
    }
}
export function renderWordbook(wordList, container, onRemoveRequest) {
    container.innerHTML = '';
    if (wordList.length === 0) {
        container.innerHTML = `<div class="wordbook-empty">저장된 단어가 없습니다.</div>`;
        return;
    }
    wordList.forEach((item) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'wordbook-item';
        const bodyEl = document.createElement('div');
        bodyEl.className = 'wordbook-body';
        const jpSpan = document.createElement('span');
        jpSpan.className = 'jp';
        jpSpan.textContent = item.text;
        const metaSpan = document.createElement('span');
        metaSpan.className = 'meta';
        const kanaPart = item.kana ? `[${item.kana}] ` : '';
        metaSpan.textContent = `${kanaPart}${item.mean}`;
        // 일본어 단어와 뜻 정보만 순서대로 추가합니다.
        bodyEl.appendChild(jpSpan);
        bodyEl.appendChild(metaSpan);
        const actionsEl = document.createElement('div');
        actionsEl.className = 'wordbook-actions';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => onRemoveRequest(item.text));
        actionsEl.appendChild(removeBtn);
        itemEl.appendChild(bodyEl);
        itemEl.appendChild(actionsEl);
        container.appendChild(itemEl);
    });
    const sortSelectEl = document.getElementById('sort-select');
    if (sortSelectEl) {
        sortSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
}
function playJapaneseTts(text, triggerButton) {
    const query = text.trim();
    if (!query)
        return;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        openGoogleTranslate(query);
        return;
    }
    const speak = () => {
        const utterance = new SpeechSynthesisUtterance(query);
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
        utterance.voice = japaneseVoices.find((voice) => voice.name.toLowerCase().includes('google'))
            || japaneseVoices[0]
            || null;
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        utterance.onend = () => triggerButton?.classList.remove('is-playing');
        utterance.onerror = () => triggerButton?.classList.remove('is-playing');
        window.speechSynthesis.cancel();
        triggerButton?.classList.add('is-playing');
        window.speechSynthesis.speak(utterance);
    };
    if (window.speechSynthesis.getVoices().length > 0) {
        speak();
    }
    else {
        window.speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
        window.speechSynthesis.getVoices();
    }
}
function openGoogleTranslate(text) {
    window.open(`https://translate.google.com/?sl=ja&tl=ko&text=${encodeURIComponent(text)}&op=translate`, '_blank', 'noopener');
}
function speakerIconSvg() {
    return `
        <svg class="tts-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path class="tts-icon-body" d="M4.5 9.25h3.25L12.2 5.4v13.2l-4.45-3.85H4.5z"></path>
            <path class="tts-icon-wave" d="M15.1 9.25c.75.72 1.15 1.62 1.15 2.75s-.4 2.03-1.15 2.75"></path>
            <path class="tts-icon-wave" d="M17.75 6.75A7.1 7.1 0 0 1 19.9 12 a7.1 7.1 0 0 1-2.15 5.25"></path>
        </svg>
    `;
}
export class StudyCard {
    cardJp;
    cardHint;
    cardCounter;
    cardCtrls;
    cardPrev;
    cardNext;
    index = 0;
    words = [];
    ttsBtn;
    static instance = null;
    constructor(cardJp, cardHint, cardCounter, cardCtrls, cardPrev, cardNext) {
        this.cardJp = cardJp;
        this.cardHint = cardHint;
        this.cardCounter = cardCounter;
        this.cardCtrls = cardCtrls;
        this.cardPrev = cardPrev;
        this.cardNext = cardNext;
        this.ttsBtn = document.createElement('button');
        this.ttsBtn.className = 'tts-btn study-tts-btn';
        this.ttsBtn.type = 'button';
        this.ttsBtn.innerHTML = speakerIconSvg();
        this.ttsBtn.title = '발음 듣기';
        this.ttsBtn.setAttribute('aria-label', '플래시카드 발음 듣기');
        this.cardJp.after(this.ttsBtn);
        this.ttsBtn.addEventListener('click', () => {
            const item = this.words[this.index];
            if (item) {
                playJapaneseTts(item.text, this.ttsBtn);
            }
        });
        this.cardHint.addEventListener('click', () => this.reveal());
        this.cardPrev.addEventListener('click', () => this.move(-1));
        this.cardNext.addEventListener('click', () => this.move(1));
    }
    static init(words) {
        if (!this.instance) {
            const cardJp = document.getElementById('card-jp');
            const cardHint = document.getElementById('card-hint');
            const cardCounter = document.getElementById('card-counter');
            const cardCtrls = document.getElementById('card-ctrls');
            const cardPrev = document.getElementById('card-prev');
            const cardNext = document.getElementById('card-next');
            if (cardJp && cardHint && cardCounter && cardCtrls && cardPrev && cardNext) {
                this.instance = new StudyCard(cardJp, cardHint, cardCounter, cardCtrls, cardPrev, cardNext);
            }
        }
        if (this.instance) {
            this.instance.setWords(words);
        }
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
            this.ttsBtn.style.display = 'none';
            this.cardHint.style.display = 'none';
            this.cardCtrls.style.display = 'none';
            this.cardCounter.textContent = '0 / 0';
            return;
        }
        const item = this.words[this.index];
        this.ttsBtn.style.display = 'inline-flex';
        this.ttsBtn.setAttribute('aria-label', `${item.text} 발음 듣기`);
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
export function createSaveDialog(word, onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'word-save-dialog';
    dialog.setAttribute('aria-hidden', 'true');
    // 요미가나(발음)가 있으면 괄호 서식 추가
    const kanaBadge = word.kana ? ` <span class="dialog-word-kana">[${word.kana}]</span>` : '';
    dialog.innerHTML = `
        <div class="word-save-card" role="dialog" aria-modal="true" aria-labelledby="save-dialog-title">
            <div class="word-save-label">단어장 저장 확인</div>
            
            <div class="dialog-preview-box">
                <span class="dialog-checkbox-icon">❑</span>
                <span class="dialog-word-text" id="save-dialog-title">${word.text}</span>
                ${kanaBadge}
                <span class="dialog-word-mean">${word.mean}</span>
            </div>
            
            <div class="word-save-message">이 단어를 단어장에 보관할까요?</div>
            <div class="word-save-actions">
                <button type="button" class="word-save-cancel">취소</button>
                <button type="button" class="word-save-confirm">저장하기</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
    const cancelBtn = dialog.querySelector('.word-save-cancel');
    const confirmBtn = dialog.querySelector('.word-save-confirm');
    const close = () => {
        dialog.classList.add('hide'); // 부드러운 아웃 애니메이션용 (선택)
        dialog.classList.remove('show');
        dialog.setAttribute('aria-hidden', 'true');
        setTimeout(() => dialog.remove(), 250);
    };
    const open = () => {
        dialog.classList.add('show');
        dialog.setAttribute('aria-hidden', 'false');
        confirmBtn.focus();
    };
    cancelBtn.addEventListener('click', close);
    // 🌟 인풋값이 없으므로 원본 사전형 데이터(word)를 그대로 콜백에 태워 보냅니다.
    confirmBtn.addEventListener('click', () => {
        close();
        onConfirm(word);
    });
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog)
            close();
    });
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
