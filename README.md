# Relational-Structure-Visualizer 

## Overview
Relational-Structure-Visualizer is a 3D interactive tool designed to represent members of a community as nodes in a tree structure. Each node corresponds to a person in the community, displaying their selfie and information about their joining date and connections to other members.

## Features
- **3D Visualization**: Render community members in a 3D space using WebGL.
- **Interactive Nodes**: Clickable nodes that display additional information about each member.
- **Dynamic Data Loading**: Fetch community data from a JSON file to populate the visualizer.

## Links
- Data Input: https://docs.google.com/spreadsheets/d/1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA/
- Main Site: https://creepilycreeper.github.io/USTCCC-Relational-Structure-Visualizer/

## Project Structure 
```
community-visualizer
├── src
│   ├── index.html          # Main HTML document
│   ├── css
│   │   └── styles.css      # Styles for the visualizer
│   ├── js
│   │   ├── main.js         # Initializes the visualizer
│   │   ├── visualizer.js    # Logic for rendering the 3D tree
│   │   ├── database.js      # Handles data fetching
│   │   └── node.js         # Defines the Node class
│   ├── data
│   │   └── community.json   # Community data in JSON format
│   └── assets
│       └── textures        # Textures for node representations
├── package.json            # npm configuration file
├── webpack.config.js       # Webpack configuration file
└── README.md               # Project documentation
```

## Setup Instructions
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/community-visualizer.git
   ```
2. Navigate to the project directory:
   ```
   cd community-visualizer
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Build the project:
   ```
   npm run build
   ```
5. Serve the project locally:
   ```
   npm start
   ```

## Usage
Open `src/index.html` in your web browser to view the visualizer. Interact with the nodes to explore the community structure.
