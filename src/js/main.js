import * as THREE from 'three';
import { fetchData } from './database.js';
import { Visualizer } from './visualizer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
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
    linkHighlightColor: 0xff0000,
    centeringForce: 0.01,
    layerTension: -75.0,
    firstLayerTension: -10,
    nodeRepulsion: 20,
    firstLayerRepulsion: 10,
    sameParentRepulsion: 5,
    sameParentSpringLength: 2.5,
    damping: 0.2,
    verticalSpacing: 4.0,
    rootNodeName: "Christ",
    nodePlacementInterval: 1,
    color_initial: 0xFFFF00, // #FFFF00
    color_mid: 0x80FF80, // #80FF80
    color_final: 0x00FFFF, // #00FFFF
    color_hover: 0xff0000, // #ff0000
    color_line: 0x808080, // #808080
    color_prc: 0xffffff, // <-- PRC node color (default: white)
    linktypeColors: {    // Example: "mentor": 0x00ff00, "collab": 0x0000ff
        UFO: 0x808080,      // #808080
        Alpha: 0xfcd392,    // #C04040
        Outreach: 0xfba8b6, // #40C040
    },
    physicsThrottle: 1, // frames, configurable throttle
    repulsionRadius: 10, // <--- Add this: radius for quadtree neighbor search
    bloom: true, // Enable or disable bloom pass
    bloomStrength: 0.5,
    bloomRadius: 0,
    bloomThreshold: 0.5,
};

// --- Cache DOM elements at the top ---
const visualizerContainer = document.getElementById('visualizer-container');
const sideMenu = document.getElementById('side-menu');
const sidebarSearch = document.getElementById('sidebar-search');
const nodeNameElem = document.getElementById('node-name');
const nodeImageElem = document.getElementById('node-image');
const nodeDetailsElem = document.getElementById('node-details');
const croppedToggle = document.getElementById('cropped-toggle');
const spriteScaleSlider = document.getElementById('sprite-scale-slider');
const toggleNamesBtn = document.getElementById('toggle-names');
const nodeLabelsContainer = document.getElementById('node-labels-container');

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio); // Cap pixel ratio for performance
renderer.setClearColor(0x050505, 1);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
visualizerContainer.appendChild(renderer.domElement);

function getSideMenuWidth() {
    const rootStyles = getComputedStyle(document.documentElement);
    const width = rootStyles.getPropertyValue('--side-menu-width').trim();
    if (width.endsWith('vw')) {
        const percentage = parseFloat(width.replace('vw', ''));
        return (window.innerWidth * percentage) / 100;
    } else if (width.endsWith('px')) {
        return parseInt(width);
    }
    return 0;
}

function resizeRenderer() {
    const sideMenuWidth = getSideMenuWidth();
    const width = window.innerWidth - sideMenuWidth;
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
let hoveredMesh = null;
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
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const intersection = new THREE.Vector3();
    ray.ray.intersectPlane(plane, intersection);
    return intersection;
}

function displayNodeData(node) {
    nodeNameElem.innerHTML = `${node.name || ''} (${node.joinDate || ''})`;
    nodeImageElem.src = node.selfie || '';
    nodeDetailsElem.innerHTML = node.testimonial ? node.testimonial.replace(/\n/g, '<br>') : '';
}

renderer.domElement.addEventListener('mousedown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;

    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
    if (intersects.length > 0) {
        // Accept either mesh or sprite
        const nodeData = intersects[0].object.userData.nodeData;
        if (nodeData) {
            draggingNode = nodeData;
            dragLayerY = draggingNode.position.y;
            const mouseWorld = getMouseWorldPositionAtY(mouse, camera, dragLayerY);
            dragOffset.copy(draggingNode.position).sub(mouseWorld);
            event.stopPropagation();
        }
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
        // Fire custom event to resume physics
        window.dispatchEvent(new Event('visualizer-node-drag'));
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
        displayNodeData(selectedNode);
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
            // Fire custom event to resume physics
            window.dispatchEvent(new Event('visualizer-node-drag'));
        } else {
            const deltaX = pos.clientX - mouseX;
            const deltaY = pos.clientY - mouseY;
            cameraTheta += deltaX * 0.01;
            cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi - deltaY * 0.01));
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
            displayNodeData(selectedNode);
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

let composer = null;
if (visualizerConfig.bloom) {
    composer = new EffectComposer(renderer, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        visualizerConfig.bloomStrength,
        visualizerConfig.bloomRadius,
        visualizerConfig.bloomThreshold
    );
    composer.addPass(bloomPass);
} else {
    composer = { 
        render: () => renderer.render(scene, camera), 
        setSize: (w, h) => renderer.setSize(w, h) 
    };
}

// Initialize visualizer with custom config
const visualizer = new Visualizer(scene, camera, renderer, composer);
visualizer.updateConfig(visualizerConfig);

// --- Node label overlay logic (now handled by Visualizer) ---
visualizer.setLabelContainer(nodeLabelsContainer);

toggleNamesBtn.addEventListener('click', () => {
    visualizer.showNodeLabels = !visualizer.showNodeLabels;
    toggleNamesBtn.textContent = visualizer.showNodeLabels ? "Hide Names" : "Show Names";
    visualizer.toggleNodeLabels(visualizer.showNodeLabels);
});

// --- Search Bar Functionality (unchanged, see your original) ---
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
    const nodeMeshes = visualizer.getNodeMeshes();
    const mesh = nodeMeshes.find(m => m.userData.nodeData && m.userData.nodeData.name === member.name);
    if (mesh) {
        selectedNode = mesh.userData.nodeData;
        cameraConfig.center = selectedNode.position;
        updateCameraPosition();
        visualizer.highlightLinksForNode(selectedNode, visualizerConfig.linkHighlightColor);
        displayNodeData(selectedNode);
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
            const { layers } = await visualizer.renderTree(data.members);
            const center = visualizer.getTreeLayoutCenter(layers);
            cameraConfig.center = center;
            updateCameraPosition();
            document.getElementById('side-menu').style.display = 'block';
            resizeRenderer();
            setupSidebarSearch(data.members);
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

// Toggle cropped images
let croppedMode = false;
croppedToggle.addEventListener('click', () => {
    croppedMode = !croppedMode;
    croppedToggle.textContent = croppedMode ? "Remove Selfies" : "Show Selfies";
    visualizer.setUseCroppedImages(croppedMode);
    const scale = parseFloat(spriteScaleSlider.value);
    animateSpriteScale(scale, 400);
});

spriteScaleSlider.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value);
    visualizer.nodes.forEach(node => {
        if (node.sprite && node.sprite.visible) {
            node.setSpriteScale(scale);
        }
    });
});

function animateSpriteScale(targetScale, duration = 400) {
    const nodes = visualizer.nodes;
    const startTime = performance.now();
    const initialScales = nodes.map(node => node.sprite ? node.sprite.scale.x / node.originalScale : 0);

    function animate() {
        const now = performance.now();
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        nodes.forEach((node, i) => {
            if (node.sprite) {
                const from = initialScales[i];
                const to = targetScale;
                const scale = croppedMode
                    ? from + (to - from) * ease
                    : from + (0 - from) * ease;
                node.setSpriteScale(scale);
                node.sprite.visible = scale > 0.01;
            }
        });
        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            nodes.forEach(node => {
                if (node.sprite) {
                    node.setSpriteScale(croppedMode ? targetScale : 0);
                    node.sprite.visible = croppedMode;
                }
            });
        }
    }
    animate();
}


