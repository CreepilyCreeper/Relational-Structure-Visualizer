import * as THREE from 'three';
import { fetchData, discoverSelfiePath } from './database.js';
import { Visualizer } from './visualizer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { WebGLRenderTarget, HalfFloatType } from 'three';

// Camera configuration (hardcoded)
const cameraConfig = {
    center: new THREE.Vector3(0, 0, 0),
    radius: 30,
    theta: Math.PI / 6,
    phi: Math.PI / 3
};

// Expose cameraConfig for camera following in visualizer
window.cameraConfig = cameraConfig;

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
const nameSizeSlider = document.getElementById('name-size-slider');
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

// Expose selectedNode for camera following
window.selectedNode = selectedNode;

// Camera controls
let mouseDown = false;
let rightMouseDown = false;
let mouseX = 0;
let mouseY = 0;
let mouseDownX = 0;   // position at mousedown, for drag detection
let mouseDownY = 0;
let hasDragged = false; // true if mouse moved enough to count as a drag
let cameraRadius = cameraConfig.radius;
let cameraTheta = cameraConfig.theta;
let cameraPhi = cameraConfig.phi;
let draggingNode = null;
let dragOffset = new THREE.Vector3();
let dragLayerY = 0;
const DRAG_THRESHOLD = 5; // pixels

// --- Global drag state for animation loop ---
window.isDraggingNode = false;
window.draggedNode = null;
window.dragOffset = new THREE.Vector3();
window.dragLayerY = 0;
window.currentMouseX = 0;
window.currentMouseY = 0;

function updateCameraPosition() {
    camera.position.x = cameraConfig.center.x + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
    camera.position.y = cameraConfig.center.y + cameraRadius * Math.cos(cameraPhi);
    camera.position.z = cameraConfig.center.z + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
    camera.lookAt(cameraConfig.center.x, cameraConfig.center.y, cameraConfig.center.z);
}

// Expose updateCameraPosition for camera following in visualizer
window.updateCameraPosition = updateCameraPosition;

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
    // Show loading state while discovering actual selfie path
    nodeImageElem.src = '';
    nodeImageElem.alt = 'Loading...';
    // Lazy discover the correct selfie path
    if (node.name) {
        discoverSelfiePath(node.name, (actualPath) => {
            nodeImageElem.src = actualPath;
            nodeImageElem.alt = node.name;
        });
    }
    nodeDetailsElem.innerHTML = node.testimonial ? node.testimonial.replace(/\n/g, '<br>') : '';
}

renderer.domElement.addEventListener('contextmenu', (event) => {
    event.preventDefault(); // suppress right-click context menu
});

renderer.domElement.addEventListener('mousedown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDownX = event.clientX;
    mouseDownY = event.clientY;
    hasDragged = false;

    if (event.button === 2) {
        // Right mouse button — pan
        rightMouseDown = true;
        return;
    }

    mouseDown = true;

    mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
    mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
    if (intersects.length > 0) {
        // Accept either mesh or sprite
        const nodeData = intersects[0].object.userData.nodeData;
        if (nodeData) {
            const nodeInstance = nodeData.nodeRef; // actual Node class instance
            draggingNode = nodeInstance;
            // Set global drag flags - animation loop will handle position updates
            window.isDraggingNode = true;
            window.draggedNode = nodeInstance; // store Node instance for direct === comparison
            window.dragLayerY = nodeData.position.y; // nodeData.position IS node.position
            dragLayerY = nodeData.position.y; // Keep local for backward compatibility
            const mouseWorld = getMouseWorldPositionAtY(mouse, camera, window.dragLayerY);
            dragOffset.copy(nodeData.position).sub(mouseWorld);
            window.dragOffset.copy(nodeData.position).sub(mouseWorld);
            window.currentMouseX = event.clientX;
            window.currentMouseY = event.clientY;
            event.stopPropagation();
        }
    }
});

renderer.domElement.addEventListener('mouseup', (event) => {
    if (event.button === 2) {
        rightMouseDown = false;
        return;
    }
    mouseDown = false;
    draggingNode = null;
    // Clear global drag flags
    window.isDraggingNode = false;
    window.draggedNode = null;
});

renderer.domElement.addEventListener('mousemove', (event) => {
    // Update current mouse position for animation loop
    window.currentMouseX = event.clientX;
    window.currentMouseY = event.clientY;

    // Track whether this is a real drag (beyond threshold)
    if (mouseDown || rightMouseDown) {
        const dx = event.clientX - mouseDownX;
        const dy = event.clientY - mouseDownY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) hasDragged = true;
    }

    if (mouseDown && draggingNode) {
        // Dragging logic moved to animation loop - just update camera controls here
        window.dispatchEvent(new Event('visualizer-node-drag'));
    } else if (rightMouseDown) {
        // Right-click pan: translate cameraConfig.center along camera right/up
        const deltaX = event.clientX - mouseX;
        const deltaY = event.clientY - mouseY;
        const panSpeed = cameraRadius * 0.0015;

        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        const lookDir = new THREE.Vector3();
        camera.getWorldDirection(lookDir);
        right.crossVectors(lookDir, camera.up).normalize();
        up.crossVectors(right, lookDir).normalize();

        cameraConfig.center.addScaledVector(right, -deltaX * panSpeed);
        cameraConfig.center.addScaledVector(up, deltaY * panSpeed);
        updateCameraPosition();
        mouseX = event.clientX;
        mouseY = event.clientY;
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
    // Ignore click if it was end of a drag (node drag or camera pan/orbit)
    if (hasDragged) {
        hasDragged = false;
        return;
    }
    if (hoveredNode) {
        selectedNode = hoveredNode;
        window.selectedNode = selectedNode;
        // Camera follows node
        cameraConfig.center.copy(selectedNode.position);
        updateCameraPosition();
        // Highlight links
        visualizer.highlightLinksForNode(selectedNode, visualizerConfig.linkHighlightColor);

        // --- Show side menu with node data ---
        displayNodeData(selectedNode);
    }
});

renderer.domElement.addEventListener('wheel', (event) => {
    cameraRadius = Math.max(1, cameraRadius + event.deltaY * 0.05);
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
        window.currentMouseX = pos.clientX;
        window.currentMouseY = pos.clientY;
        mouse.x = pos.x;
        mouse.y = pos.y;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(visualizer.getNodeMeshes());
        if (intersects.length > 0) {
            const touchNodeData = intersects[0].object.userData.nodeData;
            const nodeInstance = touchNodeData.nodeRef; // actual Node class instance
            draggingNode = nodeInstance;
            // Set global drag flags - animation loop will handle position updates
            window.isDraggingNode = true;
            window.draggedNode = nodeInstance; // store Node instance for direct === comparison
            window.dragLayerY = touchNodeData.position.y; // nodeData.position IS node.position
            dragLayerY = touchNodeData.position.y; // Keep local for backward compatibility
            const mouseWorld = getMouseWorldPositionAtY(mouse, camera, window.dragLayerY);
            dragOffset.copy(touchNodeData.position).sub(mouseWorld);
            window.dragOffset.copy(touchNodeData.position).sub(mouseWorld);
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
        // Update current mouse position for animation loop
        window.currentMouseX = pos.clientX;
        window.currentMouseY = pos.clientY;

        if (draggingNode) {
            // Dragging logic moved to animation loop - just dispatch event
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
        cameraRadius = Math.max(1, renderer._touchZoomRadius - delta * 0.05);
        updateCameraPosition();
        event.preventDefault();
    }
}, { passive: false });

renderer.domElement.addEventListener('touchend', (event) => {
    if (event.touches.length === 0) {
        mouseDown = false;
        draggingNode = null;
        // Clear global drag flags
        window.isDraggingNode = false;
        window.draggedNode = null;
        renderer._touchZoomDistance = null;
    }
}, { passive: false });

renderer.domElement.addEventListener('touchcancel', () => {
    mouseDown = false;
    draggingNode = null;
    // Clear global drag flags
    window.isDraggingNode = false;
    window.draggedNode = null;
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
            window.selectedNode = selectedNode;
            cameraConfig.center.copy(selectedNode.position);
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

// Create a dedicated composer for bloom so we can render bloom only for specific layers
let bloomComposer = null;
if (visualizerConfig.bloom) {
    bloomComposer = new EffectComposer(renderer, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    bloomComposer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        visualizerConfig.bloomStrength,
        visualizerConfig.bloomRadius,
        visualizerConfig.bloomThreshold
    );
    bloomComposer.addPass(bloomPass);
} else {
    bloomComposer = { render: () => renderer.render(scene, camera), setSize: (w,h)=>renderer.setSize(w,h) };
}

// Layer constants: layer 0 = bloom-eligible (default), layer 1 = non-bloom (sprites)
window.BLOOM_LAYER = 0;
window.NON_BLOOM_LAYER = 1;
window.bloomComposer = bloomComposer;
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

// --- Name size slider --- only apply on release to avoid per-frame texture regen
nameSizeSlider.addEventListener('change', () => {
    const size = parseFloat(nameSizeSlider.value);
    visualizer.setLabelSize(size);
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
        window.selectedNode = selectedNode;
        cameraConfig.center.copy(selectedNode.position);
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
            cameraConfig.center.set(center.x, center.y, center.z);
            updateCameraPosition();
            // Slide in the side menu with a CSS transition
            const sideMenuEl = document.getElementById('side-menu');
            requestAnimationFrame(() => sideMenuEl.classList.remove('side-menu-hidden'));
            resizeRenderer();
            setupSidebarSearch(data.members);

            // 5-second spawn camera: track centroid of placed nodes and zoom to fit
            const spawnDuration = 5000;
            const spawnStart = performance.now();
            function spawnCameraFrame() {
                const elapsed = performance.now() - spawnStart;
                if (elapsed >= spawnDuration) return;

                const placed = visualizer.nodes.filter(n => n.isPlaced);
                if (placed.length > 1) {
                    // Compute centroid
                    let cx = 0, cy = 0, cz = 0;
                    placed.forEach(n => { cx += n.position.x; cy += n.position.y; cz += n.position.z; });
                    cx /= placed.length; cy /= placed.length; cz /= placed.length;

                    // Compute bounding radius from centroid
                    let maxDist = 0;
                    placed.forEach(n => {
                        const dx = n.position.x - cx;
                        const dy = n.position.y - cy;
                        const dz = n.position.z - cz;
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (d > maxDist) maxDist = d;
                    });

                    // Smooth camera toward centroid
                    cameraConfig.center.lerp(new THREE.Vector3(cx, cy, cz), 0.04);
                    // Smooth radius to fit all nodes (with padding)
                    const targetRadius = Math.max(cameraConfig.radius, maxDist * 2.0);
                    cameraRadius += (targetRadius - cameraRadius) * 0.04;
                    updateCameraPosition();
                }
                requestAnimationFrame(spawnCameraFrame);
            }
            requestAnimationFrame(spawnCameraFrame);
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


