// Replace with your sheet's ID and sheet name
const sheetId = '1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA';
const sheetName = 'Rebuild Test(1) Data';  //use Main Data for real data, Test(1/2) Data for testing
const url = `https://opensheet.elk.sh/${sheetId}/${sheetName}`;
const selfieDir = './assets/selfies/';
const fallbackSelfie = 'fallback.png';

// List of common image extensions to check
const commonExtensions = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico', '.heic'
];

/**
 * Asynchronously finds the first existing selfie image for a member.
 * @param {string} name - The member's name (used as the filename).
 * @returns {Promise<string>} - The path to the found selfie image or the fallback.
 */
const findSelfiePath = async (name) => {
    for (const ext of commonExtensions) {
        // Allow Unicode (including Chinese) in filenames, only replace illegal file chars
        const safeName = name.replace(/[\/\\:*?"<>|]/g, '_');
        const potentialPath = selfieDir + safeName + ext;
        try {
            const response = await fetch(potentialPath, { method: 'HEAD' });
            if (response.ok) {
                return potentialPath;
            }
        } catch {
            // Ignore errors and continue
        }
    }
    console.log(`Using fallback selfie for ${name}`);
    return selfieDir + fallbackSelfie;
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
    if (useTestData) {
        // Load from local test data
        try {
            const response = await fetch('./data/test_data_community.json');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching community data:', error);
        }
    } else {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const rows = await response.json();

            // Filter out rows with no name
            const filteredRows = rows.filter(row => row.name && row.name.trim());

            // First, create all members with uniqueKey
            const members = await Promise.all(filteredRows.map(async row => {
                const name = row.name.trim();
                const joinDate = row.joinDate ? row.joinDate.trim() : '';
                const uniqueKey = `${name}__${joinDate}`;
                const selfiePath = await findSelfiePath(name);
                return {
                    uniqueKey,
                    name,
                    selfie: selfiePath,
                    selfiecropped: getSelfieCroppedPath(selfiePath, name),
                    joinDate,
                    parent: row.parent ? row.parent.trim() : "",
                    linktype: row.linktype ? row.linktype.trim() : "",
                    testimonial: row.testimonial || ""
                };
            }));

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
                            if (candidate.joinDate < member.joinDate) {
                                if (
                                    !chosenParent ||
                                    candidate.joinDate > chosenParent.joinDate
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
            console.error('Error fetching Google Sheets data:', error);
        }
    }
};

export { fetchData };