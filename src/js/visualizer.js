import * as THREE from 'three';
import { Node } from './node.js';
import { Quadtree } from './quadtree.js';
// Add these imports for fat lines:
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

class Visualizer {

    // Interpolates between two THREE.Color objects (a, b) by t in [0,1]
    interpolateColor(a, b, t) {
        // Clamp t
        t = Math.max(0, Math.min(1, t));
        const r = a.r * (1 - t) + b.r * t;
        const g = a.g * (1 - t) + b.g * t;
        const b_ = a.b * (1 - t) + b.b * t;
        return new THREE.Color(r, g, b_);
    }
    getTreeLayoutCenter(layers) {
        if (!layers || layers.length === 0) return { x: 0, y: 0, z: 0 };
        const y = -((layers.length - 1) * this.config.verticalSpacing) / 2;
        let sumX = 0, sumZ = 0, count = 0;
        layers.forEach(layer => {
            layer.forEach(node => {
                sumX += node.position.x;
                sumZ += node.position.z;
                count++;
            });
        });
        const avgX = count > 0 ? sumX / count : 0;
        const avgZ = count > 0 ? sumZ / count : 0;
        return { x: avgX, y, z: avgZ };
    }

    constructor(scene, camera, renderer, composer = null) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.composer = composer;
        this.nodes = [];
        this.isAnimating = false;
        this.config = {
            nodeComplexity: 8,  // default: 16
            nodeSize: 0.5,
            nodeColor: 0xffffff,
            centeringForce: 0.1,
            layerTension: 1.0,
            firstLayerTension: -1,
            nodeRepulsion: 1.0,
            sameParentRepulsion: 0.5,
            firstLayerRepulsion: 5,
            sameParentSpringLength: 2.0,
            damping: 0.8,
            clamping: 10.0,
            verticalSpacing: 3.0,
            rootNodeName: "Root",
            nodePlacementInterval: 1,
            color_initial: 0x80FF80,
            color_mid: 0x40FFC0,
            color_final: 0x00FFFF,
            color_hover: 0xff0000,
            color_line: 0x808080,
            color_prc: 0xffffff, // <-- PRC node color (default: white)
            linktypeColors: {
                UFO: 0x808080,
                Alpha: 0xfcd392,
                Outreach: 0xfba8b6,
            },
            linktypeWidths: { // Add this for per-linktype linewidths
                UFO: 1,
                Alpha: 1,
                Outreach: 1,
                default: 1
            },
            physicsThrottle: 1, // <--- Add this: recalc physics every N frames (default: 1 = every frame)
            repulsionRadius: 10, // <--- Add this: radius for quadtree neighbor search
        };
        this.placedNodeCount = 0;
        this.iter = 0;
        this.clampVectorMax = new THREE.Vector3(this.config.clamping, this.config.clamping, this.config.clamping);
        this.clampVectorMin = new THREE.Vector3(-this.config.clamping, -this.config.clamping, -this.config.clamping);
        this.useCroppedImages = false;

        // Add reusable temp vectors for force calculations
        this._tempVec1 = new THREE.Vector3();
        this._tempVec2 = new THREE.Vector3();

        // InstancedMesh related
        this.instancedMesh = null;
        this._instancedMeshNeedsUpdate = false;
    }

    setUseCroppedImages(flag) {
        // Animate sprite scale in/out based on flag
        // The actual scale value is controlled by main.js via animateSpriteScale
        this.useCroppedImages = flag;
        // No need to set node.useCroppedImage anymore
        // Sprite scale/visibility is handled externally
    }

    async renderTree(data) {
        this.clearNodes();

        // --- Sort data so that for any node, its parent (even in same layer) comes first ---
        const dataMap = new Map(data.map(person => [person.uniqueKey, person]));
        const sorted = [];
        const visited = new Set();

        function visit(node) {
            if (visited.has(node.uniqueKey)) return;
            if (node.parent && dataMap.has(node.parent)) {
                visit(dataMap.get(node.parent));
            }
            visited.add(node.uniqueKey);
            sorted.push(node);
        }
        data.forEach(person => visit(person));

        // Use sorted data from here on
        data = sorted;

        // Get all unique years for color calculation
        const allYears = [...new Set(data.map(person => person.joinDate))].sort();


        // Create node map and build tree structure
        const nodeMap = new Map();

        // Create nodes first and add to scene immediately
        data.forEach(person => {
            const node = new Node(person, this.config);
            // node.useCroppedImage = this.useCroppedImages; // REMOVE THIS LINE
            nodeMap.set(person.uniqueKey, node);
            this.nodes.push(node);
        });

        // Build tree structure and organize by layers
        const layers = this.organizeByLayers(data, nodeMap);

        // --- Set node colors based on layer (holographic gradient) ---
        // We'll interpolate: color_initial -> color_mid -> color_final
        const layerCount = layers.length;
        layers.forEach((layer, i) => {
            let color;
            if (layerCount === 1) {
                color = new THREE.Color(this.config.color_initial);
            } else if (i <= (layerCount - 1) / 2) {
                // Interpolate color_initial to color_mid
                const t = i / ((layerCount - 1) / 2);
                const colorStart = new THREE.Color(this.config.color_initial);
                const colorEnd = new THREE.Color(this.config.color_mid);
                color = this.interpolateColor(colorStart, colorEnd, t);
                //console.log(`Layer ${i} color interpolation t=${t.toFixed(2)} from ${colorStart.getHexString()} to ${colorEnd.getHexString()} resulting in ${color.getHexString()}`);
            } else {
                // Interpolate color_mid to color_final
                const t = (i - (layerCount - 1) / 2) / ((layerCount - 1) / 2);
                const colorStart = new THREE.Color(this.config.color_mid);
                const colorEnd = new THREE.Color(this.config.color_final);
                color = this.interpolateColor(colorStart, colorEnd, t);
                //console.log(`Layer ${i} color interpolation t=${t.toFixed(2)} from ${colorStart.getHexString()} to ${colorEnd.getHexString()} resulting in ${color.getHexString()}`);
            }
            layer.forEach(node => {
                node.data._layerColor = color;
                node.config = { ...node.config, nodeColor: color.getHex() };

                // --- PRC node color override ---
                if (node.data.nodetype === "prc") {
                    node.config.nodeColor = this.config.color_prc;
                }
            });
        });

        // Initialize positions
        this.initializePositions(layers);

        // Create meshes for all nodes and add to scene
        for (const node of this.nodes) {
            // node.useCroppedImage = this.useCroppedImages; // REMOVE THIS LINE
            const mesh = await node.createNode(allYears);
            mesh.position.copy(node.position);
            mesh.scale.set(1, 1, 1);
            mesh.visible = !!node.isPlaced;
            this.scene.add(mesh);
            node.mesh = mesh;
        }

        // --- InstancedMesh optimization ---
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh = null;
        }
        const sphereGeometry = new THREE.SphereGeometry(this.config.nodeSize, this.config.nodeComplexity, this.config.nodeComplexity);
        const sphereMaterial = new THREE.MeshStandardMaterial({ color: this.config.nodeColor });
        this.instancedMesh = new THREE.InstancedMesh(sphereGeometry, sphereMaterial, this.nodes.length);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.instancedMesh);
        this._instancedMeshNeedsUpdate = true;

        // Draw all connections (animated)
        await this.createAnimatedConnections(data, nodeMap);

        // Start render loop with physics
        if (!this.isAnimating) {
            this.startPhysicsRenderLoop(nodeMap);
        }

        // Save nodeMap for later use if needed elsewhere
        this._nodeMap = nodeMap;

        return { layers, allYears, data, nodeMap };
    }

    initializePositions(layers) {
        this.placedNodeCount = 0; // Reset on new tree
        this.allNodesFlat = layers.flat();
        this.layersForPlacement = layers;
        // Place only the root node at first
        layers.forEach((layer, layerIndex) => {
            layer.forEach((node, nodeIndex) => {
                if (this.config.rootNodeName && node.data.name === this.config.rootNodeName && layerIndex === 0) {
                    node.position.set(0, -layerIndex * this.config.verticalSpacing, 0);
                    node.isPlaced = true;
                    this.placedNodeCount = 1;
                } else {
                    node.isPlaced = false;
                }
                node.velocity = new THREE.Vector3(0, 0, 0);
            });
        });
    }

    organizeByLayers(data, nodeMap) {
        const joinDates = [...new Set(data.map(person => person.joinDate))].sort();
        const layers = joinDates.map(date => {
            return data
                .filter(person => person.joinDate === date)
                .map(person => nodeMap.get(person.uniqueKey))
                .filter(node => node);
        });
        return layers;
    }

    startPhysicsRenderLoop(nodeMap) {
        this.isAnimating = true;
        const damping = this.config.damping;

        // --- FPS Meter ---
        console.log("Enter toggleFPS() in console to toggle FPS meter");
        if (typeof window.__showFPS === "undefined") window.__showFPS = false;
        window.toggleFPS = function () {
            window.__showFPS = !window.__showFPS;
            console.log("FPS meter " + (window.__showFPS ? "enabled" : "disabled"));
        };

        let lastFpsTime = performance.now();
        let frameCount = 0;

        // --- Physics throttling ---
        let physicsFrameCounter = 0;

        const animateIteration = () => {
            if (!this.isAnimating) return;

            // --- FPS Meter logic ---
            frameCount++;
            const now = performance.now();
            if (now - lastFpsTime >= 1000) {
                const fps = frameCount / ((now - lastFpsTime) / 1000);
                if (window.__showFPS) {
                    console.log(`FPS: ${fps.toFixed(1)}`);
                }
                frameCount = 0;
                lastFpsTime = now;
            }

            // Place a new node every N iterations
            if (
                this.iter % this.config.nodePlacementInterval === 0 &&
                this.placedNodeCount < this.allNodesFlat.length
            ) {
                const nodeToPlace = this.allNodesFlat[this.placedNodeCount];
                if (nodeToPlace && !nodeToPlace.isPlaced) {
                    // Find parent node using parent property
                    let parentNode = null;
                    if (nodeToPlace.data.parent) {
                        parentNode = this.nodes.find(n => n.data.uniqueKey === nodeToPlace.data.parent);
                    }
                    // If parent found and placed, position at parent; else, use layer Y
                    let x = 0, z = 0;
                    const layerIndex = this.layersForPlacement.findIndex(layer => layer.includes(nodeToPlace));
                    let y = -layerIndex * this.config.verticalSpacing;
                    let parentY = y;
                    if (parentNode && parentNode.isPlaced) {
                        x = parentNode.position.x;
                        z = parentNode.position.z;
                        parentY = parentNode.position.y;
                    }
                    nodeToPlace.position.set(x, parentY, z); // Start at parent's position
                    nodeToPlace.targetY = y; // Glide to this Y
                    nodeToPlace.glideProgress = 0; // 0 to 1 over 20 frames
                    nodeToPlace.isPlaced = true;
                    // Assign a small random initial velocity to nudge the node
                    const angle = Math.random() * 2 * Math.PI;
                    const speed = 1; // Small random speed
                    nodeToPlace.velocity = new THREE.Vector3(
                        Math.cos(angle) * speed,
                        0,
                        Math.sin(angle) * speed
                    );
                    this.placedNodeCount++;
                    if (nodeToPlace.mesh) nodeToPlace.mesh.visible = true;
                }
            }

            // --- Y GLIDE LOGIC ---
            this.nodes.forEach(node => {
                if (node.isPlaced && typeof node.targetY === "number" && node.glideProgress < 1) {
                    node.glideProgress += 1 / 100; // 100 iterations
                    if (node.glideProgress > 1) node.glideProgress = 1;
                    // Linear interpolation from current y to targetY
                    node.position.y = node.position.y * (1 - node.glideProgress) + node.targetY * node.glideProgress;
                    if (node.mesh) node.mesh.position.y = node.position.y;
                }
            });

            // Reset forces
            this.nodes.forEach(node => {
                node.force = new THREE.Vector3(0, 0, 0);
            });


            // Only apply forces to placed nodes
            const placedLayers = this.layersForPlacement.map(layer => layer.filter(n => n.isPlaced));

            this.applyLayerTension(placedLayers, nodeMap);
            this.applySameLayerRepulsion(placedLayers, nodeMap);

            // --- Centering force (applied in x and z only) ---
            this.nodes.forEach(node => {
                if (!node.isPlaced) return;
                // Center is at (0, *, 0)
                const centeringStrength = this.config.centeringForce ?? 0.05;
                // Vector from node to center (0, *, 0)
                const centerVec = new THREE.Vector3(-node.position.x, 0, -node.position.z);
                // Only apply in x and z
                centerVec.y = 0;
                // Apply centering force
                //console.log(`Before Force: (${node.force.x.toFixed(2)}, ${node.force.y.toFixed(2)}, ${node.force.z.toFixed(2)})`);
                node.force.add(centerVec.multiplyScalar(centeringStrength));
                //console.log(`After Force: (${node.force.x.toFixed(2)}, ${node.force.y.toFixed(2)}, ${node.force.z.toFixed(2)})`);
            });

            // Update positions
            this.nodes.forEach(node => {
                if (!node.isPlaced) {
                    if (node.mesh) node.mesh.visible = false;
                    return;
                }
                if (this.config.rootNodeName && node.data.name === this.config.rootNodeName) {
                    node.position.x = 0;
                    node.position.z = 0;
                    node.velocity.set(0, 0, 0);
                    if (node.mesh) node.mesh.position.copy(node.position);
                    return;
                }
                if (!node.velocity) node.velocity = new THREE.Vector3(0, 0, 0);
                if (!node.force) node.force = new THREE.Vector3(0, 0, 0);
                physicsFrameCounter++;
                const doPhysics = (physicsFrameCounter % (this.config.physicsThrottle || 1)) === 0;
                // Only update velocity/position if physics was calculated this frame
                if (doPhysics) {
                    node.velocity.add(node.force.clone().multiplyScalar(0.1));
                    node.velocity.multiplyScalar(damping);
                }
                const newPos = node.position.clone().add(node.velocity);
                node.position.x = newPos.x;
                node.position.z = newPos.z;
                if (node.mesh) {
                    node.mesh.position.x = node.position.x;
                    node.mesh.position.z = node.position.z;
                    node.mesh.visible = true;
                }
            });

            // --- InstancedMesh update ---
            if (this.instancedMesh) {
                let anyVisible = false;
                this.nodes.forEach((node, i) => {
                    if (node.isPlaced && node.mesh /* && !node.useCroppedImage */) {
                        const m = new THREE.Matrix4().setPosition(node.position);
                        this.instancedMesh.setMatrixAt(i, m);
                        this.instancedMesh.setColorAt(i, new THREE.Color(node.config.nodeColor));
                        anyVisible = true;
                    } else {
                        // Move offscreen if not visible or using sprite
                        const m = new THREE.Matrix4().makeTranslation(9999, 9999, 9999);
                        this.instancedMesh.setMatrixAt(i, m);
                    }
                });
                this.instancedMesh.instanceMatrix.needsUpdate = true;
                if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
                this.instancedMesh.visible = anyVisible;
            }

            // Animate lines to follow node positions
            this.updateAnimatedConnections();

            // Render scene (only here!)
            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }

            // --- Node label update ---
            if (this.needsLabelUpdate && this.nodeLabelsContainer) {
                this.updateNodeLabels(this.camera, this.renderer);
            }

            this.iter++;
            requestAnimationFrame(animateIteration);
        };

        animateIteration();
    }

    _resumePhysicsOnDrag() {
        this._resumePhysics();
    }

    applyLayerTension(layers, nodeMap) {
        // Flatten all placed nodes for easy lookup
        const allNodes = layers.flat();
        allNodes.forEach(childNode => {
            if (!childNode.isPlaced) return;
            const parentKey = childNode.data.parent;
            if (!parentKey) return;
            // Use nodeMap for O(1) lookup
            const parentNode = nodeMap.get(parentKey);
            if (!parentNode || !parentNode.isPlaced) return;

            // Use reusable temp vector for direction
            const direction = this._tempVec1.subVectors(childNode.position, parentNode.position);
            direction.y = 0;
            const distance = direction.length();
            if (distance > 0) {
                direction.normalize();
                // Use firstLayerTension if parentNode is root, otherwise use layerTension
                const tension = parentNode.data.name === this.config.rootNodeName
                    ? this.config.firstLayerTension
                    : this.config.layerTension;
                // Clone direction before multiplying to avoid mutating the temp vector for other uses
                const force = direction.clone().multiplyScalar(tension * distance * 0.1);
                parentNode.force.sub(force);
                childNode.force.add(force);
            }
        });
    }

    applySameLayerRepulsion(layers, nodeMap) {
        layers.forEach(layer => {
            // Build quadtree for this layer
            if (layer.length < 2) return;
            // Compute bounds
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            layer.forEach(node => {
                minX = Math.min(minX, node.position.x);
                maxX = Math.max(maxX, node.position.x);
                minZ = Math.min(minZ, node.position.z);
                maxZ = Math.max(maxZ, node.position.z);
            });
            const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
            const w = (maxX - minX) / 2 + 2, h = (maxZ - minZ) / 2 + 2;
            const qt = new Quadtree({ x: cx, z: cz, w, h }, 8);
            layer.forEach(node => qt.insert(node));

            for (let i = 0; i < layer.length; i++) {
                const nodeA = layer[i];
                // Query neighbors within a radius (e.g., 10 units)
                const neighbors = qt.query({ x: nodeA.position.x, z: nodeA.position.z, w: this.config.repulsionRadius, h: this.config.repulsionRadius });
                for (const nodeB of neighbors) {
                    if (nodeA === nodeB) continue;
                    // Use temp vector for calculation, but clone before using in force
                    const direction = this._tempVec2.subVectors(nodeA.position, nodeB.position);
                    direction.y = 0;
                    const distance = direction.length();
                    if (distance > 0 && distance < 10) {
                        direction.normalize();
                        let repulsionForceValue = this.config.nodeRepulsion;
                        const parentA = nodeA.data.parent;
                        const parentB = nodeB.data.parent;
                        const sharedParent = parentA && parentB && parentA === parentB && parentA !== null;
                        const parentNodeA = this.nodes.find(n => n.data.uniqueKey === parentA);
                        if (parentNodeA && parentNodeA.data.name === this.config.rootNodeName) {
                            repulsionForceValue = this.config.firstLayerRepulsion;
                            const repulsionForce = repulsionForceValue / (distance * distance);
                            const force = direction.clone().multiplyScalar(repulsionForce);
                            nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                            nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        } else if (sharedParent && parentA !== null && parentA !== undefined) {
                            const springLength = this.config.sameParentSpringLength ?? 2.0;
                            const k = this.config.sameParentRepulsion;
                            const displacement = distance - springLength;
                            const forceMagnitude = -k * displacement;
                            const force = direction.clone().multiplyScalar(forceMagnitude);
                            nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                            nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        } else {
                            const repulsionForce = repulsionForceValue / (distance * distance);
                            const force = direction.clone().multiplyScalar(repulsionForce);
                            nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                            nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        }
                    }
                }
            }
        });
    }


    // --- Animated Connections ---

    async createAnimatedConnections(data, nodeMap) {
        // Remove previous batched lines if any
        if (this.batchedLines) {
            this.scene.remove(this.batchedLines);
            this.batchedLines.geometry.dispose();
            this.batchedLines.material.dispose();
            this.batchedLines = null;
        }
        if (this.batchedThinLines) {
            this.scene.remove(this.batchedThinLines);
            this.batchedThinLines.geometry.dispose();
            this.batchedThinLines.material.dispose();
            this.batchedThinLines = null;
        }

        // Collect all connections
        const fatPositions = [];
        const fatColors = [];
        const fatConnections = [];

        const thinPositions = [];
        const thinColors = [];
        const thinConnections = [];

        data.forEach(person => {
            if (person.parent) {
                const parentNode = nodeMap.get(person.parent);
                const childNode = nodeMap.get(person.uniqueKey);
                if (parentNode && childNode) {
                    let lineColor = this.config.color_line;
                    if (childNode.data.linktype && this.config.linktypeColors[childNode.data.linktype]) {
                        lineColor = this.config.linktypeColors[childNode.data.linktype];
                    } else if (this.config.linktypeColors.default) {
                        lineColor = this.config.linktypeColors.default;
                    }
                    let lineWidth = 2;
                    if (childNode.data.linktype && this.config.linktypeWidths[childNode.data.linktype]) {
                        lineWidth = this.config.linktypeWidths[childNode.data.linktype];
                    } else if (this.config.linktypeWidths.default) {
                        lineWidth = this.config.linktypeWidths.default;
                    }
                    const color = new THREE.Color(lineColor);
                    if (lineWidth > 1) {
                        fatConnections.push({ parentNode, childNode });
                        // If childNode is not placed, make the line zero-length at parent
                        if (!childNode.isPlaced) {
                            fatPositions.push(
                                parentNode.position.x, parentNode.position.y, parentNode.position.z,
                                parentNode.position.x, parentNode.position.y, parentNode.position.z
                            );
                        } else {
                            fatPositions.push(
                                parentNode.position.x, parentNode.position.y, parentNode.position.z,
                                childNode.position.x, childNode.position.y, childNode.position.z
                            );
                        }
                        fatColors.push(
                            color.r, color.g, color.b,
                            color.r, color.g, color.b
                        );
                    } else {
                        thinConnections.push({ parentNode, childNode });
                        if (!childNode.isPlaced) {
                            thinPositions.push(
                                parentNode.position.x, parentNode.position.y, parentNode.position.z,
                                parentNode.position.x, parentNode.position.y, parentNode.position.z
                            );
                        } else {
                            thinPositions.push(
                                parentNode.position.x, parentNode.position.y, parentNode.position.z,
                                childNode.position.x, childNode.position.y, childNode.position.z
                            );
                        }
                        thinColors.push(
                            color.r, color.g, color.b,
                            color.r, color.g, color.b
                        );
                    }
                }
            }
        });

        // --- Fat lines ---
        if (fatPositions.length > 0) {
            const fatGeometry = new LineSegmentsGeometry();
            fatGeometry.setPositions(fatPositions);
            fatGeometry.setColors(fatColors);

            const fatMaterial = new LineMaterial({
                color: 0xffffff,
                linewidth: 2,
                vertexColors: true,
                transparent: true,
                opacity: 1.0,
                resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
            });

            const fatLines = new LineSegments2(fatGeometry, fatMaterial);
            fatLines.computeLineDistances();
            fatLines.scale.set(1, 1, 1);
            this.scene.add(fatLines);
            this.batchedLines = fatLines;
            this.batchedConnections = fatConnections;
            this.batchedLinesGeometry = fatGeometry;
            this.batchedLinesMaterial = fatMaterial;
        } else {
            this.batchedLines = null;
            this.batchedConnections = [];
            this.batchedLinesGeometry = null;
            this.batchedLinesMaterial = null;
        }

        // --- Thin lines ---
        if (thinPositions.length > 0) {
            const thinGeometry = new LineSegmentsGeometry();
            thinGeometry.setPositions(thinPositions);
            thinGeometry.setColors(thinColors);

            const thinMaterial = new LineMaterial({
                color: 0xffffff,
                linewidth: 1,
                vertexColors: true,
                transparent: true,
                opacity: 1.0,
                resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
            });

            const thinLines = new LineSegments2(thinGeometry, thinMaterial);
            thinLines.computeLineDistances();
            thinLines.scale.set(1, 1, 1);
            this.scene.add(thinLines);
            this.batchedThinLines = thinLines;
            this.batchedThinConnections = thinConnections;
            this.batchedThinLinesGeometry = thinGeometry;
            this.batchedThinLinesMaterial = thinMaterial;
        } else {
            this.batchedThinLines = null;
            this.batchedThinConnections = [];
            this.batchedThinLinesGeometry = null;
            this.batchedThinLinesMaterial = null;
        }

        // Animate lines in
        const steps = 60;
        const duration = 400;
        for (let i = 0; i <= steps; i++) {
            await new Promise(res => setTimeout(res, duration / steps));
            const progress = i / steps;
            // Fat lines
            if (this.batchedLines && this.batchedConnections) {
                for (let j = 0; j < this.batchedConnections.length; j++) {
                    const { parentNode, childNode } = this.batchedConnections[j];
                    const newEnd = parentNode.position.clone().lerp(childNode.position, progress);
                    fatPositions[j * 6 + 0] = parentNode.position.x;
                    fatPositions[j * 6 + 1] = parentNode.position.y;
                    fatPositions[j * 6 + 2] = parentNode.position.z;
                    fatPositions[j * 6 + 3] = newEnd.x;
                    fatPositions[j * 6 + 4] = newEnd.y;
                    fatPositions[j * 6 + 5] = newEnd.z;
                }
                this.batchedLinesGeometry.setPositions(fatPositions);
                this.batchedLinesMaterial.opacity = progress;
            }
            // Thin lines
            if (this.batchedThinLines && this.batchedThinConnections) {
                for (let j = 0; j < this.batchedThinConnections.length; j++) {
                    const { parentNode, childNode } = this.batchedThinConnections[j];
                    const newEnd = parentNode.position.clone().lerp(childNode.position, progress);
                    thinPositions[j * 6 + 0] = parentNode.position.x;
                    thinPositions[j * 6 + 1] = parentNode.position.y;
                    thinPositions[j * 6 + 2] = parentNode.position.z;
                    thinPositions[j * 6 + 3] = newEnd.x;
                    thinPositions[j * 6 + 4] = newEnd.y;
                    thinPositions[j * 6 + 5] = newEnd.z;
                }
                this.batchedThinLinesGeometry.setPositions(thinPositions);
                this.batchedThinLinesMaterial.opacity = progress;
            }
        }
        // Ensure final state
        if (this.batchedLines && this.batchedConnections) {
            for (let j = 0; j < this.batchedConnections.length; j++) {
                const { parentNode, childNode } = this.batchedConnections[j];
                fatPositions[j * 6 + 0] = parentNode.position.x;
                fatPositions[j * 6 + 1] = parentNode.position.y;
                fatPositions[j * 6 + 2] = parentNode.position.z;
                fatPositions[j * 6 + 3] = childNode.position.x;
                fatPositions[j * 6 + 4] = childNode.position.y;
                fatPositions[j * 6 + 5] = childNode.position.z;
            }
            this.batchedLinesGeometry.setPositions(fatPositions);
            this.batchedLinesMaterial.opacity = 1.0;
        }
        if (this.batchedThinLines && this.batchedThinConnections) {
            for (let j = 0; j < this.batchedThinConnections.length; j++) {
                const { parentNode, childNode } = this.batchedThinConnections[j];
                thinPositions[j * 6 + 0] = parentNode.position.x;
                thinPositions[j * 6 + 1] = parentNode.position.y;
                thinPositions[j * 6 + 2] = parentNode.position.z;
                thinPositions[j * 6 + 3] = childNode.position.x;
                thinPositions[j * 6 + 4] = childNode.position.y;
                thinPositions[j * 6 + 5] = childNode.position.z;
            }
            this.batchedThinLinesGeometry.setPositions(thinPositions);
            this.batchedThinLinesMaterial.opacity = 1.0;
        }
    }

    updateAnimatedConnections() {
        // Update batched fat lines
        if (this.batchedLines && this.batchedConnections) {
            const positions = [];
            for (let j = 0; j < this.batchedConnections.length; j++) {
                const { parentNode, childNode } = this.batchedConnections[j];
                if (!childNode.isPlaced) {
                    // Zero-length line at parent
                    positions.push(
                        parentNode.position.x, parentNode.position.y, parentNode.position.z,
                        parentNode.position.x, parentNode.position.y, parentNode.position.z
                    );
                } else {
                    positions.push(
                        parentNode.position.x, parentNode.position.y, parentNode.position.z,
                        childNode.position.x, childNode.position.y, childNode.position.z
                    );
                }
            }
            this.batchedLinesGeometry.setPositions(positions);
        }
        // Update batched thin lines
        if (this.batchedThinLines && this.batchedThinConnections) {
            const positions = [];
            for (let j = 0; j < this.batchedThinConnections.length; j++) {
                const { parentNode, childNode } = this.batchedThinConnections[j];
                if (!childNode.isPlaced) {
                    positions.push(
                        parentNode.position.x, parentNode.position.y, parentNode.position.z,
                        parentNode.position.x, parentNode.position.y, parentNode.position.z
                    );
                } else {
                    positions.push(
                        parentNode.position.x, parentNode.position.y, parentNode.position.z,
                        childNode.position.x, childNode.position.y, childNode.position.z
                    );
                }
            }
            this.batchedThinLinesGeometry.setPositions(positions);
        }
        // Legacy support (if needed)
        if (this.animatedConnections) {
            this.animatedConnections.forEach(({ line, parentNode, childNode, geometry, material }) => {
                if (parentNode.isPlaced && childNode.isPlaced) {
                    if (line.isLine2) {
                        geometry.setPositions([
                            parentNode.position.x, parentNode.position.y, parentNode.position.z,
                            childNode.position.x, childNode.position.y, childNode.position.z
                        ]);
                    } else {
                        geometry.setFromPoints([
                            parentNode.position.clone(),
                            childNode.position.clone()
                        ]);
                    }
                    line.visible = true;
                } else {
                    line.visible = false;
                }
            });
        }
    }

    // --- End Animated Connections ---

    // --- Node label overlay logic ---
    setLabelContainer(container) {
        this.nodeLabelsContainer = container;
        this.showNodeLabels = false;
        this.needsLabelUpdate = true;
    }

    toggleNodeLabels(show) {
        this.showNodeLabels = show;
        if (this.nodeLabelsContainer) {
            this.nodeLabelsContainer.style.display = show ? "block" : "none";
        }
        this.needsLabelUpdate = true;
    }

    updateNodeLabels(camera, renderer) {
        if (!this.showNodeLabels || !this.nodeLabelsContainer) return;
        const rect = renderer.domElement.getBoundingClientRect();
        this.nodeLabelsContainer.innerHTML = '';
        this.nodes.forEach(node => {
            if (!node.isPlaced) return;
            const pos = node.position.clone();
            pos.project(camera);
            const x = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
            const y = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
            const label = document.createElement('div');
            label.className = 'node-label';
            label.textContent = node.data.name;
            label.style.left = `${x}px`;
            label.style.top = `${y - 18}px`;
            this.nodeLabelsContainer.appendChild(label);
        });
        this.needsLabelUpdate = false;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    updateNode(person) {
        const node = this.nodes.find(n => n.data.uniqueKey === person.uniqueKey);
        if (node) {
            node.update(person);
        }
    }

    clearNodes() {
        this.nodes.forEach(node => {
            if (node.mesh) {
                this.scene.remove(node.mesh);
            }
        });
        this.nodes = [];
        if (this.animatedConnections) {
            this.animatedConnections.forEach(({ line }) => {
                this.scene.remove(line);
            });
            this.animatedConnections = [];
        }
        // Remove InstancedMesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh = null;
        }
    }

    // 1. Return all node meshes for raycasting
    getNodeMeshes() {
        const objects = [];
        this.nodes.forEach(node => {
            if (node.mesh) {
                node.mesh.userData.nodeData = {
                    ...node.data,
                    mesh: node.mesh,
                    position: node.position,
                    nodeRef: node
                };
                objects.push(node.mesh);
            }
            if (node.sprite && node.sprite.visible) {
                node.sprite.userData.nodeData = {
                    ...node.data,
                    mesh: node.mesh,
                    position: node.position,
                    nodeRef: node
                };
                objects.push(node.sprite);
            }
        });
        return objects;
    }

    // 2. Highlight or unhighlight a node mesh (e.g., on hover)
    highlightNode(mesh, isHovered) {
        if (!mesh) return;
        if (!mesh.userData.originalColor) {
            mesh.userData.originalColor = mesh.material.color.clone();
        }
        if (isHovered) {
            if (!mesh.material.color.equals(new THREE.Color(this.config.color_hover))) {
                mesh.material.color.set(this.config.color_hover);
            }
        } else {
            if (!mesh.material.color.equals(mesh.userData.originalColor)) {
                mesh.material.color.copy(mesh.userData.originalColor);
            }
        }
    }

    // 3. Highlight all links connected to a node (incoming and outgoing)
    // Also highlight all ancestor links up to the root
    highlightLinksForNode(nodeData, color) {
        if (!this.animatedConnections) return;
        // Reset all lines to default color first
        this.animatedConnections.forEach(({ line }) => {
            if (!line.userData.originalColor) {
                line.userData.originalColor = line.material.color.clone();
            }
            line.material.color.copy(line.userData.originalColor);
        });

        // Highlight outgoing and incoming links
        this.animatedConnections.forEach(({ line, parentNode, childNode }) => {
            if (
                (parentNode.data.uniqueKey === nodeData.uniqueKey) || // outgoing
                (childNode.data.uniqueKey === nodeData.uniqueKey)     // incoming
            ) {
                line.material.color.set(color);
            }
        });

        // --- Highlight all ancestor links up to the root ---
        let currentNode = nodeData;
        while (true) {
            // Find parent of the current node
            const parent = this.nodes.find(n => n.data.uniqueKey === currentNode.parent);
            if (!parent) break; // No more parents, stop
            // Highlight the link from parent to currentNode
            this.animatedConnections.forEach(({ line, parentNode, childNode }) => {
                if (
                    parentNode.data.uniqueKey === parent.data.uniqueKey &&
                    childNode.data.uniqueKey === currentNode.uniqueKey
                ) {
                    line.material.color.set(color);
                }
            });
            // Continue up the chain with this parent
            currentNode = parent.data;
        }
    }

    setAllSpriteScales(scale) {
        this.nodes.forEach(node => {
            if (typeof node.setSpriteScale === "function") {
                node.setSpriteScale(scale);
            }
        });
    }

    // Helper: Get interpolated color for a layer index
    getLayerColor(layerIndex, layerCount) {
        if (layerCount === 1) {
            return new THREE.Color(this.config.color_initial);
        } else if (layerIndex <= (layerCount - 1) / 2) {
            // Interpolate color_initial to color_mid
            const t = layerIndex / ((layerCount - 1) / 2);
            return this.interpolateColor(
                new THREE.Color(this.config.color_initial),
                new THREE.Color(this.config.color_mid),
                t
            );
        } else {
            // Interpolate color_mid to color_final
            const t = (layerIndex - (layerCount - 1) / 2) / ((layerCount - 1) / 2);
            return this.interpolateColor(
                new THREE.Color(this.config.color_mid),
                new THREE.Color(this.config.color_final),
                t
            );
        }
    }

    // Helper: Assign colors to all layers
    assignLayerColors(layers) {
        const layerCount = layers.length;
        layers.forEach((layer, i) => {
            const color = this.getLayerColor(i, layerCount);
            layer.forEach(node => {
                node.data._layerColor = color;
                node.config = { ...node.config, nodeColor: color.getHex() };
                if (node.data.nodetype === "prc") {
                    node.config.nodeColor = this.config.color_prc;
                }
            });
        });
    }

}

export { Visualizer };