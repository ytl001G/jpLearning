const STORAGE_VERSION = 2;
const DEFAULT_SORT_MODE = 'text';
export class DictionaryStore {
    storage;
    storageKey;
    legacyKeys;
    data;
    constructor(storage, storageKey, legacyKeys = []) {
        this.storage = storage;
        this.storageKey = storageKey;
        this.legacyKeys = legacyKeys;
    }
    async init() {
        this.data = await this.load();
        await this.save();
    }
    async add(item) {
        const normalized = normalizeKey(item.text);
        if (!normalized || this.has(item.text))
            return false;
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
    async remove(text) {
        const path = this.findPath(text);
        if (!path)
            return false;
        const leaf = path[path.length - 1].node;
        delete leaf.item;
        delete leaf.insertedAt;
        for (let i = path.length - 1; i > 0; i--) {
            const { key, node } = path[i];
            if (node.item || Object.keys(node.children).length > 0)
                break;
            delete path[i - 1].node.children[key];
        }
        await this.save();
        return true;
    }
    async clear() {
        this.data.root = createNode('root');
        await this.save();
    }
    has(text) {
        return Boolean(this.get(text));
    }
    get(text) {
        const path = this.findPath(text);
        const item = path?.[path.length - 1].node.item;
        return item ? { ...item } : null;
    }
    getSortMode() {
        return this.data.sortMode;
    }
    async setSortMode(sortMode) {
        this.data.sortMode = sortMode;
        await this.save();
    }
    getAll(sortMode = this.data.sortMode) {
        return this.entries()
            .sort((a, b) => compareEntries(a, b, sortMode))
            .map((entry) => ({ ...entry.item }));
    }
    count() {
        return this.entries().length;
    }
    exportData() {
        return JSON.parse(JSON.stringify(this.data));
    }
    // 🌟 [수정] 외부(Firebase 등)에서 가져온 구형 데이터 유형을 유연하게 변환 및 마이그레이션하도록 개선
    async importData(data) {
        let normalized = null;
        if (typeof data === 'string') {
            normalized = parseStoredText(data);
        }
        else if (data && typeof data === 'object') {
            if (isStoredDictionary(data)) {
                normalized = data;
            }
            else if (Array.isArray(data)) {
                normalized = dictionaryFromWords(data);
            }
            else {
                // 구버전 트리 구조 등은 문자열 직렬화 후 안전하게 하위 호환 함수로 위임
                normalized = parseStoredText(JSON.stringify(data));
            }
        }
        if (!normalized)
            return false;
        this.data = normalized;
        await this.save();
        return true;
    }
    findPath(text) {
        const normalized = normalizeKey(text);
        if (!normalized)
            return null;
        const path = [{ key: '', node: this.data.root }];
        let node = this.data.root;
        for (const char of Array.from(normalized)) {
            const next = node.children[char];
            if (!next)
                return null;
            node = next;
            path.push({ key: char, node });
        }
        return path;
    }
    entries() {
        const output = [];
        walkTrie(this.data.root, output);
        return output;
    }
    // 🌟 [수정] 로컬 저장소가 손상되었거나 구조가 비정상적인 경우 에러를 던지지 않고 안전하게 새 단어장으로 복구 및 예방
    async load() {
        try {
            const raw = this.storage.getItem(this.storageKey);
            if (raw) {
                const parsed = parseStoredText(raw);
                if (parsed)
                    return parsed;
            }
            for (const key of this.legacyKeys) {
                const legacyRaw = this.storage.getItem(key);
                if (!legacyRaw)
                    continue;
                const legacyParsed = parseStoredText(legacyRaw);
                if (legacyParsed)
                    return legacyParsed;
            }
        }
        catch (e) {
            console.error("로컬 스토리지 데이터 로드 실패, 자동 초기화 진행:", e);
        }
        return {
            version: STORAGE_VERSION,
            sortMode: DEFAULT_SORT_MODE,
            root: createNode('root')
        };
    }
    async save() {
        this.storage.setItem(this.storageKey, JSON.stringify(this.data));
    }
}
function dictionaryFromWords(words) {
    const data = {
        version: STORAGE_VERSION,
        sortMode: DEFAULT_SORT_MODE,
        root: createNode('root')
    };
    words.filter(isWordItem).forEach((item, index) => {
        const normalized = normalizeKey(item.text);
        if (!normalized)
            return;
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
function parseStoredText(text) {
    if (!text)
        return null;
    const parsed = safeParse(text);
    const normalized = normalizeStoredDictionary(parsed);
    if (normalized)
        return normalized;
    if (Array.isArray(parsed))
        return dictionaryFromWords(parsed);
    return null;
}
function normalizeStoredDictionary(data) {
    if (!data || typeof data !== 'object')
        return null;
    if (isStoredDictionary(data))
        return data;
    const record = data;
    if (record.version !== STORAGE_VERSION || !isSortMode(record.sortMode) || !record.root)
        return null;
    const entries = [];
    collectEntries(record.root, entries);
    const words = entries
        .sort((a, b) => a.insertedAt - b.insertedAt)
        .map((entry) => entry.item);
    const normalized = dictionaryFromWords(words);
    normalized.sortMode = record.sortMode;
    return normalized;
}
function collectEntries(node, output) {
    if (!node || typeof node !== 'object')
        return;
    const trieNode = node;
    if (isWordItem(trieNode.item)) {
        output.push({
            item: trieNode.item,
            insertedAt: typeof trieNode.insertedAt === 'number' ? trieNode.insertedAt : output.length
        });
    }
    if (!trieNode.children || typeof trieNode.children !== 'object')
        return;
    Object.values(trieNode.children).forEach((child) => collectEntries(child, output));
}
function walkTrie(node, output) {
    if (node.item) {
        output.push({
            item: node.item,
            insertedAt: node.insertedAt ?? 0
        });
    }
    Object.values(node.children).forEach((child) => walkTrie(child, output));
}
function compareEntries(a, b, sortMode) {
    if (sortMode === 'recent')
        return b.insertedAt - a.insertedAt;
    const fieldA = sortValue(a.item, sortMode);
    const fieldB = sortValue(b.item, sortMode);
    return fieldA.localeCompare(fieldB, 'ja') || a.item.text.localeCompare(b.item.text, 'ja');
}
function sortValue(item, sortMode) {
    if (sortMode === 'kana')
        return item.kana || item.text;
    if (sortMode === 'mean')
        return item.mean || item.text;
    return item.text;
}
function normalizeKey(text) {
    return text.trim().normalize('NFKC');
}
function createNode(key) {
    return {
        key: key,
        children: {}
    };
}
function safeParse(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function isWordItem(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return typeof item.text === 'string' && typeof item.kana === 'string' && typeof item.mean === 'string';
}
function isStoredDictionary(value) {
    if (!value || typeof value !== 'object')
        return false;
    const data = value;
    return data.version === STORAGE_VERSION && isSortMode(data.sortMode) && isTrieNode(data.root);
}
function isTrieNode(value) {
    if (!value || typeof value !== 'object')
        return false;
    const node = value;
    return typeof node.key === 'string' && node.children !== null && typeof node.children === 'object';
}
function isSortMode(value) {
    return value === 'text' || value === 'kana' || value === 'mean' || value === 'recent';
}
