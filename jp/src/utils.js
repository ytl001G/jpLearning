export function parseJsonInput(input) {
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
export function showToast(message, isError = false) {
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
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    });
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 400);
    }, 2300);
}
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
// 부모 스코프 변수 쉐도잉 해결을 위한 인자명 조정 (err)
function fallbackCopy(text, resolve) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
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
    catch (copyError) {
        if (textArea.parentNode) {
            document.body.removeChild(textArea);
        }
        resolve(false);
    }
}
