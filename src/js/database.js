// Replace with your sheet's ID and sheet name
const sheetId = '1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA';
const sheetName = 'Main Data';
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
 * @returns {Promise<object>} - Community data in the same structure as community.json
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
        // Load from Google Sheets
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const rows = await response.json();

            // Filter out rows with no name
            const filteredRows = rows.filter(row => row.name && row.name.trim());

            // First, create all members with uniqueKey, but don't process referrals yet
            const members = await Promise.all(filteredRows.map(async row => {
                const name = row.name.trim();
                const joinDate = row.joinDate ? row.joinDate.trim() : '';
                const uniqueKey = `${name}__${joinDate}`;
                const selfiePath = await findSelfiePath(name);
                return {
                    name: name,
                    selfie: selfiePath,
                    selfiecropped: getSelfieCroppedPath(selfiePath, name),
                    joinDate: joinDate,
                    uniqueKey: uniqueKey,
                    // Store original referrals string for now
                    _rawReferrals: row.referrals,
                    testimonial: row.testimonial
                };
            }));

            // Build a lookup: name -> array of member objects sorted by joinDate ascending
            const nameToMembers = {};
            for (const member of members) {
                if (!nameToMembers[member.name]) nameToMembers[member.name] = [];
                nameToMembers[member.name].push(member);
            }
            for (const arr of Object.values(nameToMembers)) {
                arr.sort((a, b) => {
                    // Compare joinDate as string (ISO or YYYY-MM-DD preferred)
                    if (a.joinDate < b.joinDate) return -1;
                    if (a.joinDate > b.joinDate) return 1;
                    return 0;
                });
            }

            // Now process referrals for each member
            for (const member of members) {
                const parentJoinDate = member.joinDate;
                const rawReferrals = member._rawReferrals;
                let referralNames = [];
                if (rawReferrals) {
                    referralNames = rawReferrals.split(',').map(s => s.trim()).filter(Boolean);
                }
                // Count occurrences of each referral name in the list
                const nameCounts = {};
                for (const refName of referralNames) {
                    nameCounts[refName] = (nameCounts[refName] || 0) + 1;
                }
                // For each referral name, find the correct referred nodes
                const resolvedReferrals = [];
                for (const [refName, count] of Object.entries(nameCounts)) {
                    const candidates = (nameToMembers[refName] || []).filter(m => m.joinDate > parentJoinDate);
                    // Sort by joinDate ascending (already sorted, but filter may change order)
                    for (let i = 0; i < count; i++) {
                        if (candidates[i]) {
                            resolvedReferrals.push(candidates[i].uniqueKey);
                        }
                        // If not enough candidates, skip
                    }
                }
                member.referrals = resolvedReferrals;
                delete member._rawReferrals;
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