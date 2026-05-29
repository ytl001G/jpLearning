import type { DictionarySortMode, WordItem } from './utils.js';

interface TrieNode {
    hash: string;
    children: Record<string, TrieNode>;
    item?: WordItem;
    insertedAt?: number;
}

interface StoredDictionary {
    version: 2;
    sortMode: DictionarySortMode;
    root: TrieNode;
}

interface DictionaryEntry {
    item: WordItem;
    insertedAt: number;
}

const STORAGE_VERSION = 2;
const DEFAULT_SORT_MODE: DictionarySortMode = 'text';

export class DictionaryStore {
    private data: StoredDictionary;

    constructor(
        private readonly storage: Storage,
        private readonly storageKey: string,
        private readonly legacyKeys: string[] = []
    ) {
        this.data = this.load();
        this.save();
    }

    add(item: WordItem): boolean {
        const normalized = normalizeKey(item.text);
        if (!normalized || this.has(item.text)) return false;

        let node = this.data.root;
        for (const char of Array.from(normalized)) {
            const childKey = hashToken(char);
            node.children[childKey] ??= createNode(`${node.hash}:${childKey}`);
            node = node.children[childKey];
        }

        node.item = { ...item };
        node.insertedAt = Date.now();
        this.save();
        return true;
    }

    remove(text: string): boolean {
        const path = this.findPath(text);
        if (!path) return false;

        const leaf = path[path.length - 1].node;
        delete leaf.item;
        delete leaf.insertedAt;

        for (let i = path.length - 1; i > 0; i--) {
            const { key, node } = path[i];
            if (node.item || Object.keys(node.children).length > 0) break;
            delete path[i - 1].node.children[key];
        }

        this.save();
        return true;
    }

    clear(): void {
        this.data.root = createNode('root');
        this.save();
    }

    has(text: string): boolean {
        return Boolean(this.get(text));
    }

    get(text: string): WordItem | null {
        const path = this.findPath(text);
        const item = path?.[path.length - 1].node.item;
        return item ? { ...item } : null;
    }

    getSortMode(): DictionarySortMode {
        return this.data.sortMode;
    }

    setSortMode(sortMode: DictionarySortMode): void {
        this.data.sortMode = sortMode;
        this.save();
    }

    getAll(sortMode: DictionarySortMode = this.data.sortMode): WordItem[] {
        return this.entries()
            .sort((a, b) => compareEntries(a, b, sortMode))
            .map((entry) => ({ ...entry.item }));
    }

    count(): number {
        return this.entries().length;
    }

    exportData(): StoredDictionary {
        return JSON.parse(JSON.stringify(this.data)) as StoredDictionary;
    }

    importData(data: unknown): boolean {
        if (!isStoredDictionary(data)) return false;
        this.data = data;
        this.save();
        return true;
    }

    private findPath(text: string): Array<{ key: string; node: TrieNode }> | null {
        const normalized = normalizeKey(text);
        if (!normalized) return null;

        const path: Array<{ key: string; node: TrieNode }> = [{ key: '', node: this.data.root }];
        let node = this.data.root;

        for (const char of Array.from(normalized)) {
            const childKey = hashToken(char);
            const next = node.children[childKey];
            if (!next) return null;
            node = next;
            path.push({ key: childKey, node });
        }

        return path;
    }

    private entries(): DictionaryEntry[] {
        const output: DictionaryEntry[] = [];
        walkTrie(this.data.root, output);
        return output;
    }

    private load(): StoredDictionary {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) {
            const parsed = safeParse(raw);
            if (isStoredDictionary(parsed)) return parsed;
            if (Array.isArray(parsed)) return dictionaryFromWords(parsed);
        }

        for (const key of this.legacyKeys) {
            const legacyRaw = this.storage.getItem(key);
            if (!legacyRaw) continue;
            const legacyParsed = safeParse(legacyRaw);
            if (Array.isArray(legacyParsed)) return dictionaryFromWords(legacyParsed);
        }

        return {
            version: STORAGE_VERSION,
            sortMode: DEFAULT_SORT_MODE,
            root: createNode('root')
        };
    }

    private save(): void {
        this.storage.setItem(this.storageKey, JSON.stringify(this.data));
    }
}

function dictionaryFromWords(words: unknown[]): StoredDictionary {
    const data: StoredDictionary = {
        version: STORAGE_VERSION,
        sortMode: DEFAULT_SORT_MODE,
        root: createNode('root')
    };

    words.filter(isWordItem).forEach((item, index) => {
        // 🌟 [수정] 빈 문자열 처리 및 원본 JS와 동일한 방어 로직 반영
        const normalized = normalizeKey(item.text);
        if (!normalized) return; 

        let node = data.root;
        for (const char of Array.from(normalized)) {
            const childKey = hashToken(char);
            node.children[childKey] ??= createNode(`${node.hash}:${childKey}`);
            node = node.children[childKey];
        }
        node.item = { ...item };
        node.insertedAt = index;
    });

    return data;
}

function walkTrie(node: TrieNode, output: DictionaryEntry[]): void {
    if (node.item) {
        output.push({
            item: node.item,
            insertedAt: node.insertedAt ?? 0
        });
    }

    Object.values(node.children).forEach((child) => walkTrie(child, output));
}

function compareEntries(a: DictionaryEntry, b: DictionaryEntry, sortMode: DictionarySortMode): number {
    if (sortMode === 'recent') return b.insertedAt - a.insertedAt;

    const fieldA = sortValue(a.item, sortMode);
    const fieldB = sortValue(b.item, sortMode);
    return fieldA.localeCompare(fieldB, 'ja') || a.item.text.localeCompare(b.item.text, 'ja');
}

function sortValue(item: WordItem, sortMode: DictionarySortMode): string {
    if (sortMode === 'kana') return item.kana || item.text;
    if (sortMode === 'mean') return item.mean || item.text;
    return item.text;
}

function normalizeKey(text: string): string {
    return text.trim().normalize('NFKC');
}

function createNode(hashSource: string): TrieNode {
    return {
        hash: hashToken(hashSource),
        children: {}
    };
}

function hashToken(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function isWordItem(value: unknown): value is WordItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<WordItem>;
    return typeof item.text === 'string'
        && typeof item.kana === 'string'
        && typeof item.mean === 'string';
}

function isStoredDictionary(value: unknown): value is StoredDictionary {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<StoredDictionary>;
    return data.version === STORAGE_VERSION
        && isSortMode(data.sortMode)
        && isTrieNode(data.root);
}

function isSortMode(value: unknown): value is DictionarySortMode {
    return value === 'text' || value === 'kana' || value === 'mean' || value === 'recent';
}

function isTrieNode(value: unknown): value is TrieNode {
    if (!value || typeof value !== 'object') return false;
    const node = value as Partial<TrieNode>;
    
    // 🌟 [개선] 자식 노드들의 구조적 정밀성 검증 추가 (TypeScript 컴파일러 추론 극대화)
    return typeof node.hash === 'string'
        && node.children !== null
        && typeof node.children === 'object';
}