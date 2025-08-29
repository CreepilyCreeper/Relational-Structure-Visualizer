import * as THREE from 'three';
import { fetchData } from './database.js';
import { Visualizer } from './visualizer.js';
import { EffectComposer } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Initialize renderer
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1); // Pure black background
renderer.shadowMap.enabled = false; // Disable shadows as requested
document.getElementById('visualizer-container').appendChild(renderer.domElement);

// Position camera for better 3D viewing
camera.position.z = 15;
camera.position.y = 10;
camera.position.x = 5;
camera.lookAt(0, 0, 0);

// Add basic lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.2); // Very dim ambient
scene.add(ambientLight);

// Remove directional light or make it very subtle
// const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
// directionalLight.position.set(10, 10, 5);
// scene.add(directionalLight);

// Add mouse controls for camera
let mouseDown = false;
let mouseX = 0;
let mouseY = 0;
let cameraRadius = 15;
let cameraTheta = 0;
let cameraPhi = Math.PI / 4;

function updateCameraPosition() {
    camera.position.x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
    camera.position.y = cameraRadius * Math.cos(cameraPhi);
    camera.position.z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
    camera.lookAt(0, 0, 0);
}

// Mouse event listeners for camera control
renderer.domElement.addEventListener('mousedown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
});

renderer.domElement.addEventListener('mouseup', () => {
    mouseDown = false;
});

renderer.domElement.addEventListener('mousemove', (event) => {
    if (mouseDown) {
        const deltaX = event.clientX - mouseX;
        const deltaY = event.clientY - mouseY;
        
        cameraTheta += deltaX * 0.01;
        cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
        
        updateCameraPosition();
        
        mouseX = event.clientX;
        mouseY = event.clientY;
    }
});

// Zoom with mouse wheel
renderer.domElement.addEventListener('wheel', (event) => {
    cameraRadius = Math.max(5, Math.min(30, cameraRadius + event.deltaY * 0.01));
    updateCameraPosition();
    event.preventDefault();
});

// Initialize camera position with better 3D perspective
cameraRadius = 20;
cameraTheta = Math.PI / 6;  // 30 degrees
cameraPhi = Math.PI / 3;    // 60 degrees
updateCameraPosition();

// Post-processing for bloom effect
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5, // strength
    0.4, // radius  
    0.85 // threshold
);
composer.addPass(bloomPass);

// Initialize visualizer with custom config
const visualizer = new Visualizer(scene, camera, renderer, composer);

// Configure the visualizer
visualizer.updateConfig({
    nodeSize: 1.3,           // Reasonable node size
    layerTension: 0.2,       // Attraction between parent-child nodes
    nodeRepulsion: 3.0,      // Repulsion between nodes in same layer
    verticalSpacing: 4.0,    // Vertical space between layers
    animationDelay: 50,     // Delay between individual node appearances (ms)
    glowEffect: false        // Solid nodes, no glow
});

// Load and render community data
async function init() {
    try {
        const data = await fetchData();
        if (data && data.members) {
            await visualizer.renderTree(data.members);
        }
    } catch (error) {
        console.error('Failed to initialize visualizer:', error);
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the application
init();