// Configurable options
const config = {
  layers: 8,
  minNodes: 10,
  maxNodes: 30,
  minYear: 2016,
  minReferrals: 1,
  maxReferrals: 5,
  maxReferralLayerOffset: 3, // how many layers ahead a node can refer to
};

const fs = require('fs');

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const members = [];
const nodeNames = [];

// Generate node names for all layers first
for (let l = 1; l <= config.layers; l++) {
  const nodeCount = getRandomInt(config.minNodes, config.maxNodes);
  nodeNames[l] = [];
  for (let n = 1; n <= nodeCount; n++) {
    nodeNames[l].push(`Layer${l}-Node${n}`);
  }
}

// --- Add root node ---
const rootNode = {
  name: "Root",
  selfie: "assets/selfies/root.png",
  joinDate: (config.minYear - 1).toString(),
  referrals: [...nodeNames[1]], // refer to all first layer nodes
};
members.push(rootNode);

// Track which nodes have already been referred
const referredNodes = {};
// Mark all first layer nodes as referred by root
for (const node of nodeNames[1]) {
  referredNodes[node] = true;
}

for (let l = 1; l <= config.layers; l++) {
  for (let n = 0; n < nodeNames[l].length; n++) {
    const name = nodeNames[l][n];
    const selfie = `assets/selfies/layer${l}-node${n+1}.png`;
    const joinDate = (config.minYear + l - 1).toString();
    let referrals = [];
    // Randomly decide how many referrals this node will make (minReferrals-maxReferrals)
    const numReferrals = getRandomInt(config.minReferrals, config.maxReferrals);
    let totalAdded = 0;
    // Try to refer to up to numReferrals nodes in up to maxReferralLayerOffset layers ahead
    for (let offset = 1; offset <= config.maxReferralLayerOffset && totalAdded < numReferrals; offset++) {
      const targetLayer = l + offset;
      if (targetLayer > config.layers) continue;
      // Get all available candidates in this layer
      const candidates = nodeNames[targetLayer]
        .map((node, idx) => ({ node, idx }))
        .filter(({ node }) => !referredNodes[node]);
      // Shuffle candidates for randomness
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = getRandomInt(0, i);
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (let c = 0; c < candidates.length && totalAdded < numReferrals; c++) {
        referrals.push(candidates[c].node);
        referredNodes[candidates[c].node] = true;
        totalAdded++;
      }
    }
    members.push({ name, selfie, joinDate, referrals });
  }
}

fs.writeFileSync('community.json', JSON.stringify({ members }, null, 2));

// Generate TSV for Google Sheets
const tsvRows = [
  'name	selfie	joinDate	referrals',
  ...members.map(m => {
    // No need to escape quotes for TSV, just join with tabs
    const name = m.name;
    const selfie = m.selfie;
    const joinDate = m.joinDate;
    const referrals = m.referrals.join(';');
    return [name, selfie, joinDate, referrals].join('\t');
  })
];
fs.writeFileSync('community-sheet.tsv', tsvRows.join('\n'));
console.log('Generated community.json and community-sheet.tsv with', members.length, 'members.');
