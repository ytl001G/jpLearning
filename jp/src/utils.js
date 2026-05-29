/**
 * AI가 출력한 마크다운 JSON 블록을 정제하여 객체로 파싱합니다.
 */
export function parseJsonInput(input) {
    // 시스템 제어문자 혼선을 방지하기 위해 백틱 정규식을 나누어 안전하게 정제합니다.
    const backticksPatternStart = new RegExp('^' + '`' + '`' + '`(?:json)?\\s*', 'i');
    const backticksPatternEnd = new RegExp('\\s*' + '`' + '`' + '`$', 'i');
    const cleaned = input
        .replace(backticksPatternStart, '')
        .replace(backticksPatternEnd, '')
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
/**
 * 화면에 커스텀 토스트 알림을 띄웁니다.
 * 중복 호출 시 이전 토스트를 자동으로 제거하여 DOM 누적을 방지합니다.
 */
export function showToast(message, isError = false) {
    // 기존에 남아있는 토스트가 있다면 즉시 지워서 메모리 누수 및 화면 중복 방지
    const existingToast = document.querySelector('.custom-toast');
    if (existingToast && existingToast.parentNode) {
        existingToast.parentNode.removeChild(existingToast);
    }
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    if (isError) {
        toast.classList.add('error-toast');
    }
    toast.textContent = message;
    document.body.appendChild(toast);
    // 브라우저 렌더링 프레임 타이밍에 맞춰 부드럽게 클래스 추가
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    // 2.5초 후 페이드아웃 및 DOM 완전 제거
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300); // CSS 트랜지션 시간(300ms)과 일치화
    }, 2500);
}
/**
 * 텍스트를 클립보드에 복사합니다. (Modern API 우선 -> 안되면 Fallback 백업 수행)
 */
export function copyTextToClipboard(text) {
    return new Promise((resolve) => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text)
                .then(() => resolve(true))
                .catch(() => fallbackCopy(text, resolve));
        }
        else {
            fallbackCopy(text, resolve);
        }
    });
}
/**
 * navigator.clipboard를 사용할 수 없는 환경(구형 브라우저 등)을 위한 폴백 복사 함수
 * 모바일 환경에서 화면 레이아웃이 깨지거나 스크롤이 튕기는 오작동을 완벽히 방어합니다.
 */
function fallbackCopy(text, resolve) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // 레이아웃 스크롤 흔들림을 원천 차단하기 위한 고정 초소형 투명 스타일링
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        resolve(successful);
    }
    catch (err) {
        if (textArea.parentNode) {
            document.body.removeChild(textArea);
        }
        resolve(false);
    }
}
