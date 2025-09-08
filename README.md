
# Relational Structure Visualizer

## Introduction

**Relational Structure Visualizer** is an interactive 3D web application for visualizing community structures as hierarchical trees. Each node represents a community member, displaying their selfie, joining date, and relationships to others. The tool is designed for intuitive exploration and analysis of social or organizational networks.

## Key Features

- **3D Visualization**: Explore community members and their relationships in a dynamic 3D environment powered by WebGL.
- **Interactive Nodes**: Click on nodes to reveal detailed information, including member photos and connection data.
- **Dynamic Data Loading**: Community data is loaded from JSON or TSV/CSV files, allowing for easy updates and customization.
- **Custom Textures**: Each node can display a unique selfie or fallback image for a personalized experience.

## Project Structure

```
Relational-Structure-Visualizer/
├── src/
│   ├── index.html           # Main HTML entry point
│   ├── css/
│   │   └── styles.css       # Application styles
│   ├── js/
│   │   ├── main.js          # App initialization
│   │   ├── visualizer.js    # 3D rendering logic
│   │   ├── database.js      # Data loading and parsing
│   │   └── node.js          # Node class definition
│   ├── data/
│   │   ├── community-sheet.csv
│   │   ├── community-sheet.tsv
│   │   ├── community-sheet2.tsv
│   │   ├── test_data_community.json
│   │   └── generate-community.js
│   └── assets/
│       ├── textures/        # Node textures
│       └── selfies/         # Member selfies
├── package.json             # Project metadata & dependencies
├── webpack.config.js        # Webpack build configuration
├── temp.json                # Temporary/generated data
└── README.md                # Project documentation
```

## Getting Started

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/Relational-Structure-Visualizer.git
   cd Relational-Structure-Visualizer
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Build the project:**
   ```sh
   npm run build
   ```
4. **Start a local server:**
   ```sh
   npm start
   ```
5. **Open the app:**
   Open `src/index.html` in your browser, or visit the local server URL provided in the terminal.

## Usage

- Click on nodes to view member details and connections.
- Use mouse controls to rotate, zoom, and pan the 3D view.
- Update or replace data files in `src/data/` to visualize different communities.