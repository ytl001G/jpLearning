export interface WordItem {
    text: string;
    kana: string;
    mean: string;
}

export type WordData = [number, string, string, string, string, string, string?];

export interface JsonData {
    words: WordData[];
}

export type DictionarySortMode = 'text' | 'kana' | 'mean' | 'recent';

export function parseJsonInput(input: string): JsonData {
    const cleaned = input
        .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
        .replace(/\s*\x60\x60\x60$/i, '')
        .trim();

    try {
        return JSON.parse(cleaned) as JsonData;
    } catch (error) {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) throw error;
        return JSON.parse(cleaned.slice(start, end + 1)) as JsonData;
    }
}

export function showToast(message: string, isError: boolean = false): void {
    const toast = document.createElement('div');
    toast.className = 'custom-toast';

    if (isError) {
        toast.classList.add('error-toast');
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.parentNode?.removeChild(toast);
        }, 300);
    }, 2500);
}

export function copyTextToClipboard(text: string): Promise<boolean> {
    return new Promise((resolve) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => resolve(true))
                .catch(() => fallbackCopy(text, resolve));
        } else {
            fallbackCopy(text, resolve);
        }
    });
}

function fallbackCopy(text: string, resolve: (val: boolean) => void): void {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-999999px';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        resolve(successful);
    } catch (err) {
        resolve(false);
    }
}
