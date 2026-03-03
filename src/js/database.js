// At the top of your file
let sheetId = '';
let sheetName = '';
let url = '';

async function loadConfig() {
    // Dynamically determine the repo name from the URL path for GitHub Pages
    let repoName = '';
    if (location.hostname.endsWith('github.io')) {
        // e.g. https://username.github.io/repo-name/
        const pathParts = location.pathname.split('/').filter(Boolean);
        repoName = pathParts.length > 0 ? pathParts[0] : '';
    }
    let configPath = repoName ? `/${repoName}/site_config.json` : '/site_config.json';
    // If running locally (file:// or localhost), use relative path
    if (location.hostname === 'localhost' || location.protocol === 'file:') {
        configPath = '../../site_config.json';
    }
    const response = await fetch(configPath);
    const config = await response.json();
    sheetId = config.sheetId;
    sheetName = config.sheetName;
    url = `https://opensheet.elk.sh/${sheetId}/${sheetName}`;
}
await loadConfig();

const selfieDir = './assets/selfies/';
const fallbackSelfie = 'fallback.png';

// Default extension to try first (most common format)
const defaultExtension = '.jpg';

// List of image extensions to check (for lazy discovery)
const commonExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico', '.heic'
];

/**
 * Returns a default selfie path without checking if it exists.
 * The UI should handle 404s gracefully with fallback images.
 * @param {string} name - The member's name
 * @returns {string} - Default path to try
 */
const getDefaultSelfiePath = (name) => {
    const safeName = name.replace(/[\/\\:*?"<>|]/g, '_');
    return selfieDir + safeName + defaultExtension;
};

/**
 * Lazily discovers the actual selfie path (used only when displaying node detail).
 * Caches results to avoid repeated lookups.
 * @param {string} name - The member's name
 * @param {function} callback - Called with the found path
 */
const selfiePathCache = new Map();
const discoverSelfiePath = (name, callback) => {
    if (selfiePathCache.has(name)) {
        callback(selfiePathCache.get(name));
        return;
    }
    
    const safeName = name.replace(/[\/\\:*?"<>|]/g, '_');
    let extensionIndex = 0;
    
    const tryNext = () => {
        if (extensionIndex >= commonExtensions.length) {
            const fallback = selfieDir + fallbackSelfie;
            selfiePathCache.set(name, fallback);
            callback(fallback);
            return;
        }
        
        const ext = commonExtensions[extensionIndex];
        const potentialPath = selfieDir + safeName + ext;
        extensionIndex++;
        
        fetch(potentialPath, { method: 'HEAD' })
            .then(response => {
                if (response.ok) {
                    selfiePathCache.set(name, potentialPath);
                    callback(potentialPath);
                } else {
                    tryNext();
                }
            })
            .catch(() => tryNext());
    };
    
    tryNext();
};

// Derive selfieCroppedPath from selfiePath
function getSelfieCroppedPath(selfiePath, name) {
    if (!selfiePath || !name) return '';
    const extMatch = selfiePath.match(/\.[^/.]+$/);
    const ext = extMatch ? extMatch[0] : '';
    // Allow Unicode (including Chinese) in filenames, only replace illegal file chars
    const safeName = name.replace(/[\/\\:*?"<>|]/g, '_');
    return `./assets/selfiescropped/${safeName}_CROPPED${ext}`;
}

/**
 * Fetches community data.
 * @param {boolean} useTestData - If true, loads from community.json. If false, loads from Google Sheets.
 * @returns {Promise<object>} - Community data in the new structure
 */
const fetchData = async (useTestData = false) => {
    let rawRows = [];
    try {
        if (useTestData) {
            const response = await fetch('./data/test_data_community.json');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            rawRows = data.members || [];
        } else {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            rawRows = await response.json();
        }

        // Filter out rows with no name
        const filteredRows = rawRows.filter(row => row.name && row.name.trim());

        // First, create all members with uniqueKey (no blocking image discovery)
        const members = filteredRows.map(row => {
            const name = row.name.trim();
            const joinDate = row.joinDate ? row.joinDate.trim() : '';
            const uniqueKey = `${name}__${joinDate}`;
            // Use provided selfie path or default (no HEAD requests)
            const selfiePath = row.selfie ? row.selfie : getDefaultSelfiePath(name);
            return {
                uniqueKey,
                name,
                selfie: selfiePath,
                selfiecropped: getSelfieCroppedPath(selfiePath, name),
                joinDate,
                parent: row.parent ? row.parent.trim() : "",
                linktype: row.linktype ? row.linktype.trim() : "",
                nodetype: row.nodetype ? row.nodetype.trim() : "",
                testimonial: row.testimonial || ""
            };
        });

        // Build a lookup: name -> array of members with that name, sorted by joinDate ascending
        const nameLookup = {};
        for (const member of members) {
            if (!nameLookup[member.name]) nameLookup[member.name] = [];
            nameLookup[member.name].push(member);
        }
        for (const arr of Object.values(nameLookup)) {
            arr.sort((a, b) => (a.joinDate > b.joinDate ? 1 : -1));
        }

        // For each member, resolve parent to uniqueKey
        for (const member of members) {
            if (member.parent) {
                const parentCandidates = nameLookup[member.parent];
                if (parentCandidates && parentCandidates.length > 0) {
                    // Find the parent with joinDate < member's joinDate, closest to it
                    let chosenParent = null;
                    for (const candidate of parentCandidates) {
                        if (candidate.joinDate <= member.joinDate) {
                            if (
                                !chosenParent ||
                                candidate.joinDate >= chosenParent.joinDate
                            ) {
                                chosenParent = candidate;
                            }
                        }
                    }
                    member.parent = chosenParent ? chosenParent.uniqueKey : "";
                } else {
                    member.parent = "";
                }
            }
        }

        const communityData = { members };
        // Store in localStorage (static sites can't write to files)
        localStorage.setItem('communityData', JSON.stringify(communityData));
        return communityData;
    } catch (error) {
        console.error('Error fetching community data:', error);
    }
};

export { fetchData, discoverSelfiePath };