// Configurable options
const config = {
  layers: 12,
  minNodes: 15,
  maxNodes: 30,
  minYear: 2016,
  minReferrals: 0,
  maxReferrals: 5,
  maxReferralLayerOffset: 3, // how many layers ahead a node can be a parent
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
  name: "Christ",
  selfie: "assets/selfies/Christ.jpg",
  joinDate: (config.minYear - 1).toString(),
  parent: "", // Root has no parent
  linktype: "",
};
members.push(rootNode);

// Prepare parent assignment tracking
const parentChildCounts = {}; // key: node name, value: number of children

// Initialize parentChildCounts for all nodes (including root)
parentChildCounts[rootNode.name] = 0;
for (let l = 1; l <= config.layers; l++) {
  for (const name of nodeNames[l]) {
    parentChildCounts[name] = 0;
  }
}

// For each node (except root), assign a parent
const nodeObjects = {}; // name -> node object for easy lookup
for (let l = 1; l <= config.layers; l++) {
  for (let n = 0; n < nodeNames[l].length; n++) {
    const name = nodeNames[l][n];
    const selfie = `assets/selfies/layer${l}-node${n+1}.png`;
    const joinDate = (config.minYear + l - 1).toString();

    // Find all eligible parents in previous layers within offset
    let eligibleParents = [];
    for (let offset = 1; offset <= config.maxReferralLayerOffset; offset++) {
      const parentLayer = l - offset;
      if (parentLayer < 0) break;
      if (parentLayer === 0) {
        eligibleParents.push(rootNode.name);
      } else if (nodeNames[parentLayer]) {
        eligibleParents = eligibleParents.concat(nodeNames[parentLayer]);
      }
    }

    // Filter parents that have not exceeded maxReferrals
    eligibleParents = eligibleParents.filter(parentName =>
      parentChildCounts[parentName] < config.maxReferrals
    );

    // If no eligible parent, assign root as parent
    let parent = "";
    if (eligibleParents.length > 0) {
      parent = eligibleParents[getRandomInt(0, eligibleParents.length - 1)];
      parentChildCounts[parent]++;
    } else {
      parent = rootNode.name;
      parentChildCounts[rootNode.name]++;
    }

    const linktype = "referral";
    const node = { name, selfie, joinDate, parent, linktype };
    members.push(node);
    nodeObjects[name] = node;
  }
}

// Now, ensure that each parent has at least minReferrals children (except root)
for (let l = 1; l <= config.layers; l++) {
  for (const parentName of nodeNames[l]) {
    if (parentChildCounts[parentName] < config.minReferrals) {
      // Find nodes that could be reassigned to this parent
      // Only nodes in later layers (within offset) are eligible
      for (let offset = 1; offset <= config.maxReferralLayerOffset; offset++) {
        const childLayer = l + offset;
        if (childLayer > config.layers) continue;
        for (const childName of nodeNames[childLayer]) {
          const child = nodeObjects[childName];
          if (!child) continue;
          // Check if child's current parent is not this parent, and this parent is eligible
          if (
            child.parent !== parentName &&
            parentChildCounts[parentName] < config.maxReferrals
          ) {
            // Decrement old parent's count
            if (parentChildCounts[child.parent] !== undefined) {
              parentChildCounts[child.parent]--;
            }
            child.parent = parentName;
            child.linktype = "referral";
            parentChildCounts[parentName]++;
            // Stop if minReferrals reached
            if (parentChildCounts[parentName] >= config.minReferrals) break;
          }
        }
        if (parentChildCounts[parentName] >= config.minReferrals) break;
      }
    }
  }
}

// Write JSON
fs.writeFileSync('test_data_community.json', JSON.stringify({ members }, null, 2));

// Generate TSV for Google Sheets
const tsvRows = [
  'name	selfie	joinDate	parent	linktype',
  ...members.map(m => {
    const name = m.name;
    const selfie = '';
    const joinDate = m.joinDate;
    const parent = m.parent || '';
    const linktype = m.linktype || '';
    return [name, selfie, joinDate, parent, linktype].join('\t');
  })
];
fs.writeFileSync('test_data_community-sheet.tsv', tsvRows.join('\n'));
console.log('Generated test_data_community.json and test_data_community-sheet.tsv');