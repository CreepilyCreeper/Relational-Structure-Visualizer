// Replace with your sheet's ID and sheet name
const sheetId = '1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA';
const sheetName = 'Sheet1';
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
        const potentialPath = selfieDir + name.replace(/[^a-zA-Z0-9_\-]/g, '_') + ext;
        try {
            const response = await fetch(potentialPath, { method: 'HEAD' });
            if (response.ok) {
                return potentialPath;
            }
        } catch {
            // Ignore errors and continue to the next extension
        }
    }
    return selfieDir + fallbackSelfie;
};

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

            // For each member, resolve the selfie path asynchronously
            const members = await Promise.all(rows.map(async row => {
                const name = row.name ? row.name.trim() : '';
                const selfiePath = await findSelfiePath(name);

                return {
                    name: name,
                    selfie: selfiePath,
                    joinDate: row.joinDate,
                    referrals: row.referrals
                        ? row.referrals.split(',').map(s => s.trim()).filter(Boolean)
                        : [],
                    testimonial: row.testimonial
                };
            }));

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