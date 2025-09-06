import * as THREE from 'three';
import { fetchData } from './database.js';
import { Visualizer } from './visualizer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { WebGLRenderTarget, HalfFloatType } from 'three';

// Camera configuration (hardcoded)
const cameraConfig = {
    center: { x: 0, y: 0, z: 0 },
    radius: 30,
    theta: Math.PI / 6,
    phi: Math.PI / 3
};

const visualizerConfig = {
    nodeSize: 0.2,
    nodeColor: 0xffffff,
    linkHighlightColor: 0xff0000, // configurable highlight color
    layerTension: -75.0,    //always do negative
    firstLayerTension: -10,
    nodeRepulsion: 50,
    firstLayerRepulsion: 10,
    sameParentRepulsion: 2, //feeds into hooke's law
    sameParentSpringLength: 2.5, //feeds into hooke's law
    damping: 0.2,             //0 is max damping, positive is less damping
    clamping: 100.0,            //clamping of maximum force applied
    verticalSpacing: 4.0,
    glowEffect: false,
    rootNodeName: "Christ"
};

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x050505, 1);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('visualizer-container').appendChild(renderer.domElement);

function getSideMenuWidth() {
    // Get the width from CSS variable
    const rootStyles = getComputedStyle(document.documentElement);
    console.log('--side-menu-width:', rootStyles.getPropertyValue('--side-menu-width'));
    const width = rootStyles.getPropertyValue('--side-menu-width').trim();

    if (width.endsWith('vw')) {
        const percentage = parseFloat(width.replace('vw', ''));
        return (window.innerWidth * percentage) / 100;
    } else if (width.endsWith('px')) {
        return parseInt(width);
    }

    return 0; // Default fallback
}

function resizeRenderer() {
    const sideMenuWidth = getSideMenuWidth();
    const width = window.innerWidth - sideMenuWidth;
    console.log(`Side menu width: ${sideMenuWidth}, Window Width: ${window.innerWidth}, Renderer width: ${width}`);
    const height = window.innerHeight;
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.top = '0';
}

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
scene.add(ambientLight);

// --- Raycaster setup ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredNode = null;
let hoveredMesh = null; // Add this line
let selectedNode = null;

// Camera controls
let mouseDown = false;
let mouseX = 0;
let mouseY = 0;
let cameraRadius = cameraConfig.radius;
let cameraTheta = cameraConfig.theta;
let cameraPhi = cameraConfig.phi;
let draggingNode = null;
let dragOffset = new THREE.Vector3();
let dragLayerY = 0;

function updateCameraPosition() {
    camera.position.x = cameraConfig.center.x + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
    camera.position.y = cameraConfig.center.y + cameraRadius * Math.cos(cameraPhi);
    camera.position.z = cameraConfig.center.z + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
    camera.lookAt(cameraConfig.center.x, cameraConfig.center.y, cameraConfig.center.z);
}

function getMouseWorldPositionAtY(mouse, camera, y) {
    // Ray from camera through mouse, intersect with plane y=layerY
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const intersection = new THREE.Vector3();
    ray.ray.intersectPlane(plane, intersection);
    return intersection;
}

renderer.domElement.addEventListener('mousedown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;

    // Calculate normalized device coordinates
    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
    if (intersects.length > 0) {
        draggingNode = intersects[0].object.userData.nodeData;
        dragLayerY = draggingNode.position.y;
        // Compute offset between node position and mouse world position
        const mouseWorld = getMouseWorldPositionAtY(mouse, camera, dragLayerY);
        dragOffset.copy(draggingNode.position).sub(mouseWorld);
        // Prevent camera drag if node drag starts
        event.stopPropagation();
    }
});

renderer.domElement.addEventListener('mouseup', () => {
    mouseDown = false;
    draggingNode = null;
});

renderer.domElement.addEventListener('mousemove', (event) => {
    if (mouseDown && draggingNode) {
        const mouseWorld = getMouseWorldPositionAtY(mouse, camera, dragLayerY);
        draggingNode.position.copy(mouseWorld.add(dragOffset));
    } else if (mouseDown) {
        const deltaX = event.clientX - mouseX;
        const deltaY = event.clientY - mouseY;
        cameraTheta += deltaX * 0.01;
        cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi - deltaY * 0.01)); // Invert up/down
        updateCameraPosition();
        mouseX = event.clientX;
        mouseY = event.clientY;
    }

    // Calculate normalized device coordinates
    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
    if (intersects.length > 0) {
        const mesh = intersects[0].object;
        if (hoveredMesh && hoveredMesh !== mesh) {
            visualizer.highlightNode(hoveredMesh, false); // Remove highlight from previous
        }
        hoveredNode = mesh.userData.nodeData;
        hoveredMesh = mesh;
        visualizer.highlightNode(mesh, true);
    } else {
        if (hoveredMesh) visualizer.highlightNode(hoveredMesh, false);
        hoveredNode = null;
        hoveredMesh = null;
    }
});

renderer.domElement.addEventListener('click', (event) => {
    if (hoveredNode) {
        selectedNode = hoveredNode;
        // Camera follows node
        cameraConfig.center = selectedNode.position; // or selectedNode.mesh.position
        updateCameraPosition();
        // Highlight links
        visualizer.highlightLinksForNode(selectedNode, visualizerConfig.linkHighlightColor);

        // --- Show side menu with node data ---
        document.getElementById('node-name').innerHTML = selectedNode.name || '';
        document.getElementById('node-image').src = selectedNode.selfie || '';
        document.getElementById('node-details').innerHTML = selectedNode.testimonial ? selectedNode.testimonial.replace(/\n/g, '<br>') : '';
    }
});

renderer.domElement.addEventListener('wheel', (event) => {
    cameraRadius = Math.max(5, Math.min(70, cameraRadius + event.deltaY * 0.05));
    updateCameraPosition();
    event.preventDefault();
});



// --- Touch event helpers ---
function getTouchPos(touch) {
    const rect = renderer.domElement.getBoundingClientRect();
    return {
        x: ((touch.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((touch.clientY - rect.top) / rect.height) * 2 + 1,
        clientX: touch.clientX,
        clientY: touch.clientY
    };
}

renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
        mouseDown = true;
        const touch = event.touches[0];
        const pos = getTouchPos(touch);
        mouseX = pos.clientX;
        mouseY = pos.clientY;
        mouse.x = pos.x;
        mouse.y = pos.y;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
        if (intersects.length > 0) {
            draggingNode = intersects[0].object.userData.nodeData;
            dragLayerY = draggingNode.position.y;
            const mouseWorld = getMouseWorldPositionAtY(mouse, camera, dragLayerY);
            dragOffset.copy(draggingNode.position).sub(mouseWorld);
            event.preventDefault();
        }
    }
    // For pinch zoom, store initial distance
    if (event.touches.length === 2) {
        mouseDown = false;
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        renderer._touchZoomDistance = Math.sqrt(dx * dx + dy * dy);
        renderer._touchZoomRadius = cameraRadius;
    }
}, { passive: false });

renderer.domElement.addEventListener('touchmove', (event) => {
    if (event.touches.length === 1 && mouseDown) {
        const touch = event.touches[0];
        const pos = getTouchPos(touch);
        if (draggingNode) {
            const mouseWorld = getMouseWorldPositionAtY(pos, camera, dragLayerY);
            draggingNode.position.copy(mouseWorld.add(dragOffset));
        } else {
            const deltaX = pos.clientX - mouseX;
            const deltaY = pos.clientY - mouseY;
            cameraTheta += deltaX * 0.01;
            cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
            updateCameraPosition();
            mouseX = pos.clientX;
            mouseY = pos.clientY;
        }
        mouse.x = pos.x;
        mouse.y = pos.y;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
        if (intersects.length > 0) {
            const mesh = intersects[0].object;
            if (hoveredMesh && hoveredMesh !== mesh) {
                visualizer.highlightNode(hoveredMesh, false);
            }
            hoveredNode = mesh.userData.nodeData;
            hoveredMesh = mesh;
            visualizer.highlightNode(mesh, true);
        } else {
            if (hoveredMesh) visualizer.highlightNode(hoveredMesh, false);
            hoveredNode = null;
            hoveredMesh = null;
        }
        event.preventDefault();
    }
    // Pinch zoom
    if (event.touches.length === 2 && renderer._touchZoomDistance) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const delta = dist - renderer._touchZoomDistance;
        cameraRadius = Math.max(5, Math.min(70, renderer._touchZoomRadius - delta * 0.05));
        updateCameraPosition();
        event.preventDefault();
    }
}, { passive: false });

renderer.domElement.addEventListener('touchend', (event) => {
    if (event.touches.length === 0) {
        mouseDown = false;
        draggingNode = null;
        renderer._touchZoomDistance = null;
    }
}, { passive: false });

renderer.domElement.addEventListener('touchcancel', () => {
    mouseDown = false;
    draggingNode = null;
    renderer._touchZoomDistance = null;
}, { passive: false });

renderer.domElement.addEventListener('touchstart', (event) => {
    // Tap to select node
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        const pos = getTouchPos(touch);
        mouse.x = pos.x;
        mouse.y = pos.y;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
        if (intersects.length > 0) {
            hoveredNode = intersects[0].object.userData.nodeData;
            selectedNode = hoveredNode;
            cameraConfig.center = selectedNode.position;
            updateCameraPosition();
            visualizer.highlightLinksForNode(selectedNode, visualizerConfig.linkHighlightColor);
            document.getElementById('node-name').innerHTML = selectedNode.name || '';
            document.getElementById('node-image').src = selectedNode.selfie || '';
            document.getElementById('node-details').innerHTML = selectedNode.testimonial ? selectedNode.testimonial.replace(/\n/g, '<br>') : '';
        }
    }
}, { passive: false });



cameraRadius = cameraConfig.radius;
cameraTheta = cameraConfig.theta;
cameraPhi = cameraConfig.phi;
updateCameraPosition();

// Post-processing for bloom effect
const renderTarget = new WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    type: HalfFloatType,
    format: THREE.RGBAFormat,
    encoding: THREE.sRGBEncoding
});
const composer = new EffectComposer(renderer, renderTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0,
    0.85
);
composer.addPass(bloomPass);

// Initialize visualizer with custom config
const visualizer = new Visualizer(scene, camera, renderer, composer);
visualizer.updateConfig(visualizerConfig);

// --- Search Bar Functionality ---
let allMembers = [];
let searchResultsDropdown = null;

function createSearchDropdown() {
    if (!searchResultsDropdown) {
        searchResultsDropdown = document.createElement('div');
        searchResultsDropdown.id = 'sidebar-search-dropdown';
        searchResultsDropdown.style.position = 'absolute';
        searchResultsDropdown.style.left = '20px';
        searchResultsDropdown.style.right = '20px';
        searchResultsDropdown.style.top = '56px';
        searchResultsDropdown.style.background = '#fff';
        searchResultsDropdown.style.color = '#222';
        searchResultsDropdown.style.border = '1px solid #bbb';
        searchResultsDropdown.style.borderRadius = '6px';
        searchResultsDropdown.style.zIndex = '100';
        searchResultsDropdown.style.maxHeight = '200px';
        searchResultsDropdown.style.overflowY = 'auto';
        searchResultsDropdown.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        searchResultsDropdown.style.display = 'none';
        document.getElementById('side-menu').appendChild(searchResultsDropdown);
    }
}

function showSearchResults(results) {
    createSearchDropdown();
    searchResultsDropdown.innerHTML = '';
    if (results.length === 0) {
        searchResultsDropdown.style.display = 'none';
        return;
    }
    results.forEach(member => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #eee';
        item.textContent = `${member.name || ''} (${member.joinDate || ''})`;
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            selectNodeFromSearch(member);
            searchResultsDropdown.style.display = 'none';
            document.getElementById('sidebar-search').value = '';
        });
        searchResultsDropdown.appendChild(item);
    });
    searchResultsDropdown.style.display = 'block';
}

function selectNodeFromSearch(member) {
    // Find the mesh for this member
    const nodeMeshes = visualizer.getNodeMeshes();
    const mesh = nodeMeshes.find(m => m.userData.nodeData && m.userData.nodeData.name === member.name);
    if (mesh) {
        selectedNode = mesh.userData.nodeData;
        cameraConfig.center = selectedNode.position;
        updateCameraPosition();
        visualizer.highlightLinksForNode(selectedNode, visualizerConfig.linkHighlightColor);
        document.getElementById('node-name').innerHTML = selectedNode.name || '';
        document.getElementById('node-image').src = selectedNode.selfie || '';
        document.getElementById('node-details').innerHTML = selectedNode.testimonial ? selectedNode.testimonial.replace(/\n/g, '<br>') : '';
    }
}

function setupSidebarSearch(members) {
    allMembers = members;
    createSearchDropdown();
    const searchInput = document.getElementById('sidebar-search');
    searchInput.addEventListener('input', function () {
        const query = this.value.trim().toLowerCase();
        if (!query) {
            showSearchResults([]);
            return;
        }
        const results = allMembers.filter(member => {
            const name = (member.name || '').toLowerCase();
            const joinDate = (member.joinDate || '').toLowerCase();
            return name.includes(query) || joinDate.includes(query);
        });
        showSearchResults(results.slice(0, 10));
    });
    searchInput.addEventListener('blur', function () {
        setTimeout(() => {
            if (searchResultsDropdown) searchResultsDropdown.style.display = 'none';
        }, 150);
    });
}

// --- Patch init() to setup search ---
async function init() {
    try {
        const data = await fetchData();
        if (data && data.members) {
            // Render all nodes and connections immediately, then apply physics
            const { layers } = await visualizer.renderTree(data.members);
            // Center camera on the layout
            const center = visualizer.getTreeLayoutCenter(layers);
            cameraConfig.center = center;
            updateCameraPosition();
            document.getElementById('side-menu').style.display = 'block';
            resizeRenderer();
            setupSidebarSearch(data.members); // <-- Add this line
        }
    } catch (error) {
        console.error('Failed to initialize visualizer:', error);
    }
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    resizeRenderer();
});

init();


