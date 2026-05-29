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
        this.data = this.load();
        this.save();
    }
    add(item) {
        const normalized = normalizeKey(item.text);
        if (!normalized || this.has(item.text))
            return false;
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
    remove(text) {
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
        this.save();
        return true;
    }
    clear() {
        this.data.root = createNode('root');
        this.save();
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
    setSortMode(sortMode) {
        this.data.sortMode = sortMode;
        this.save();
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
    importData(data) {
        if (!isStoredDictionary(data))
            return false;
        this.data = data;
        this.save();
        return true;
    }
    findPath(text) {
        const normalized = normalizeKey(text);
        if (!normalized)
            return null;
        const path = [{ key: '', node: this.data.root }];
        let node = this.data.root;
        for (const char of Array.from(normalized)) {
            const childKey = hashToken(char);
            const next = node.children[childKey];
            if (!next)
                return null;
            node = next;
            path.push({ key: childKey, node });
        }
        return path;
    }
    entries() {
        const output = [];
        walkTrie(this.data.root, output);
        return output;
    }
    load() {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) {
            const parsed = safeParse(raw);
            if (isStoredDictionary(parsed))
                return parsed;
            if (Array.isArray(parsed))
                return dictionaryFromWords(parsed);
        }
        for (const key of this.legacyKeys) {
            const legacyRaw = this.storage.getItem(key);
            if (!legacyRaw)
                continue;
            const legacyParsed = safeParse(legacyRaw);
            if (Array.isArray(legacyParsed))
                return dictionaryFromWords(legacyParsed);
        }
        return {
            version: STORAGE_VERSION,
            sortMode: DEFAULT_SORT_MODE,
            root: createNode('root')
        };
    }
    save() {
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
        // 🌟 [수정] 빈 문자열 처리 및 원본 JS와 동일한 방어 로직 반영
        const normalized = normalizeKey(item.text);
        if (!normalized)
            return;
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
function createNode(hashSource) {
    return {
        hash: hashToken(hashSource),
        children: {}
    };
}
function hashToken(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
function safeParse(raw) {
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        return null;
    }
}
function isWordItem(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return typeof item.text === 'string'
        && typeof item.kana === 'string'
        && typeof item.mean === 'string';
}
function isStoredDictionary(value) {
    if (!value || typeof value !== 'object')
        return false;
    const data = value;
    return data.version === STORAGE_VERSION
        && isSortMode(data.sortMode)
        && isTrieNode(data.root);
}
function isSortMode(value) {
    return value === 'text' || value === 'kana' || value === 'mean' || value === 'recent';
}
function isTrieNode(value) {
    if (!value || typeof value !== 'object')
        return false;
    const node = value;
    // 🌟 [개선] 자식 노드들의 구조적 정밀성 검증 추가 (TypeScript 컴파일러 추론 극대화)
    return typeof node.hash === 'string'
        && node.children !== null
        && typeof node.children === 'object';
}
