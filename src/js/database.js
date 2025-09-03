
// Replace with your sheet's ID and sheet name
const sheetId = '1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA';
const sheetName = 'Sheet1';
const url = `https://opensheet.elk.sh/${sheetId}/${sheetName}`;

// Helper to derive selfie path from name (e.g., 'Layer1-Node1' => 'assets/selfies/layer1-node1.png')
function deriveSelfiePath(name) {
    if (!name) return '';
    return `assets/selfies/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')}.png`;
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
            const response = await fetch('./data/community.json');
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
            const members = rows.map(row => ({
                name: row.name,
                //selfie: deriveSelfiePath(row.name),
                selfie: row.selfie,
                joinDate: row.joinDate,
                referrals: row.referrals ? row.referrals.split(';').map(s => s.trim()).filter(Boolean) : [],
                testimonial: row.testimonial
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