import type { DictionarySortMode, WordItem } from './utils.js';

interface TrieNode {
    key: string;
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
    private data!: StoredDictionary;

    constructor(
        private readonly storage: Storage,
        private readonly storageKey: string,
        private readonly legacyKeys: string[] = []
    ) {}

    async init(): Promise<void> {
        this.data = await this.load();
        await this.save();
    }

    async add(item: WordItem): Promise<boolean> {
        const normalized = normalizeKey(item.text);
        if (!normalized || this.has(item.text)) return false;

        let node = this.data.root;
        for (const char of Array.from(normalized)) {
            node.children[char] ??= createNode(char);
            node = node.children[char];
        }

        node.item = { ...item };
        node.insertedAt = Date.now();
        await this.save();
        return true;
    }

    async remove(text: string): Promise<boolean> {
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

        await this.save();
        return true;
    }

    async clear(): Promise<void> {
        this.data.root = createNode('root');
        await this.save();
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

    async setSortMode(sortMode: DictionarySortMode): Promise<void> {
        this.data.sortMode = sortMode;
        await this.save();
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

    async importData(data: unknown): Promise<boolean> {
        const normalized = normalizeStoredDictionary(data);
        if (!normalized) return false;
        this.data = normalized;
        await this.save();
        return true;
    }

    private findPath(text: string): Array<{ key: string; node: TrieNode }> | null {
        const normalized = normalizeKey(text);
        if (!normalized) return null;

        const path: Array<{ key: string; node: TrieNode }> = [{ key: '', node: this.data.root }];
        let node = this.data.root;

        for (const char of Array.from(normalized)) {
            const next = node.children[char];
            if (!next) return null;
            node = next;
            path.push({ key: char, node });
        }

        return path;
    }

    private entries(): DictionaryEntry[] {
        const output: DictionaryEntry[] = [];
        walkTrie(this.data.root, output);
        return output;
    }

    private async load(): Promise<StoredDictionary> {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) {
            const parsed = parseStoredText(raw);
            if (parsed) return parsed;
        }

        for (const key of this.legacyKeys) {
            const legacyRaw = this.storage.getItem(key);
            if (!legacyRaw) continue;
            const legacyParsed = parseStoredText(legacyRaw);
            if (legacyParsed) return legacyParsed;
        }

        return {
            version: STORAGE_VERSION,
            sortMode: DEFAULT_SORT_MODE,
            root: createNode('root')
        };
    }

    private async save(): Promise<void> {
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
        const normalized = normalizeKey(item.text);
        if (!normalized) return; 

        let node = data.root;
        for (const char of Array.from(normalized)) {
            node.children[char] ??= createNode(char);
            node = node.children[char];
        }
        node.item = { ...item };
        node.insertedAt = index;
    });

    return data;
}

function parseStoredText(text: string | null): StoredDictionary | null {
    if (!text) return null;
    const parsed = safeParse(text);
    const normalized = normalizeStoredDictionary(parsed);
    if (normalized) return normalized;
    if (Array.isArray(parsed)) return dictionaryFromWords(parsed);
    return null;
}

function normalizeStoredDictionary(data: unknown): StoredDictionary | null {
    if (!data || typeof data !== 'object') return null;
    if (isStoredDictionary(data)) return data;

    const record = data as Partial<StoredDictionary>;
    if (record.version !== STORAGE_VERSION || !isSortMode(record.sortMode) || !record.root) return null;

    const entries: DictionaryEntry[] = [];
    collectEntries(record.root, entries);
    const words = entries
        .sort((a, b) => a.insertedAt - b.insertedAt)
        .map((entry) => entry.item);
    const normalized = dictionaryFromWords(words);
    normalized.sortMode = record.sortMode;
    return normalized;
}

function collectEntries(node: unknown, output: DictionaryEntry[]): void {
    if (!node || typeof node !== 'object') return;
    const trieNode = node as { item?: unknown; insertedAt?: unknown; children?: unknown };
    if (isWordItem(trieNode.item)) {
        output.push({
            item: trieNode.item,
            insertedAt: typeof trieNode.insertedAt === 'number' ? trieNode.insertedAt : output.length
        });
    }
    if (!trieNode.children || typeof trieNode.children !== 'object') return;
    Object.values(trieNode.children).forEach((child) => collectEntries(child, output));
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

function createNode(key: string): TrieNode {
    return {
        key: key,
        children: {}
    };
}

function safeParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function isWordItem(value: unknown): value is WordItem {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<WordItem>;
    return typeof item.text === 'string' && typeof item.kana === 'string' && typeof item.mean === 'string';
}

function isStoredDictionary(value: unknown): value is StoredDictionary {
    if (!value || typeof value !== 'object') return false;
    const data = value as Partial<StoredDictionary>;
    return data.version === STORAGE_VERSION && isSortMode(data.sortMode) && isTrieNode(data.root);
}

function isTrieNode(value: unknown): value is TrieNode {
    if (!value || typeof value !== 'object') return false;
    const node = value as Partial<TrieNode>;
    return typeof node.key === 'string' && node.children !== null && typeof node.children === 'object';
}

function isSortMode(value: unknown): value is DictionarySortMode {
    return value === 'text' || value === 'kana' || value === 'mean' || value === 'recent';
}
