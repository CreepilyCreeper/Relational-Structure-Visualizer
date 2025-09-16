import * as THREE from 'three';
import { Node } from './node.js';

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
        this.connections = [];
        this.isAnimating = false;
        this.config = {
            nodeSize: 0.5,
            nodeColor: 0xffffff,
            centeringForce: 0.1, // configurable centering force (default 0.05)
            layerTension: 1.0,
            firstLayerTension: -1,
            nodeRepulsion: 1.0,
            sameParentRepulsion: 0.5, // <-- Add this line for configurable same-parent repulsion
            firstLayerRepulsion: 5, // <-- Add this line for configurable first-layer repulsion
            sameParentSpringLength: 2.0,
            damping: 0.8,
            clamping: 10.0,
            verticalSpacing: 3.0,
            glowEffect: false,
            rootNodeName: "Root", // configurable root node name
            nodePlacementInterval: 1, // configurable interval
            color_initial: 0xFFFF00, // #FFFF00
            color_mid: 0x80FF80, // #80FF80
            color_final: 0x00FFFF, // #00FFFF
            color_hover: 0xff0000, // #ff0000
            color_line: 0x808080, // #808080
        };
        this.placedNodeCount = 0; // Track how many nodes are placed
        this.iter = 0;
        this.clampVectorMax = new THREE.Vector3(this.config.clamping, this.config.clamping, this.config.clamping);
        this.clampVectorMin = new THREE.Vector3(-this.config.clamping, -this.config.clamping, -this.config.clamping);
        this.useCroppedImages = false; // <-- Add this line
    }

    setUseCroppedImages(flag) {
        this.useCroppedImages = flag;
    }

    async renderTree(data) {
        this.clearNodes();

        // Get all unique years for color calculation
        const allYears = [...new Set(data.map(person => person.joinDate))].sort();


        // Create node map and build tree structure
        const nodeMap = new Map();

        // Create nodes first and add to scene immediately
        data.forEach(person => {
            const node = new Node(person, this.config);
            node.useCroppedImage = this.useCroppedImages;
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
            });
        });

        // Initialize positions
        this.initializePositions(layers);

        // Create meshes for all nodes and add to scene
        for (const node of this.nodes) {
            node.useCroppedImage = this.useCroppedImages;
            const mesh = await node.createNode(allYears);
            mesh.position.copy(node.position);
            mesh.scale.set(1, 1, 1);
            mesh.visible = !!node.isPlaced;
            this.scene.add(mesh);
            node.mesh = mesh;
        }

        // Draw all connections (animated)
        await this.createAnimatedConnections(data, nodeMap);

        // Start render loop with physics
        if (!this.isAnimating) {
            this.startPhysicsRenderLoop(layers);
        }

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

    startPhysicsRenderLoop(layers) {
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

            this.applyLayerTension(placedLayers);
            this.applySameLayerRepulsion(placedLayers);

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
                node.velocity.add(node.force.clone().multiplyScalar(0.1));
                node.velocity.multiplyScalar(damping);
                const newPos = node.position.clone().add(node.velocity);
                node.position.x = newPos.x;
                node.position.z = newPos.z;
                if (node.mesh) {
                    node.mesh.position.x = node.position.x;
                    node.mesh.position.z = node.position.z;
                    // node.mesh.position.y is handled by glide logic above
                    node.mesh.visible = true;
                }
            });

            // Animate lines to follow node positions
            this.updateAnimatedConnections();

            // Render scene
            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
            this.iter++;
            requestAnimationFrame(animateIteration);
        };

        animateIteration();
    }

    applyLayerTension(layers) {
        // Flatten all placed nodes for easy lookup
        const allNodes = layers.flat();
        allNodes.forEach(childNode => {
            if (!childNode.isPlaced) return;
            const parentKey = childNode.data.parent;
            if (!parentKey) return;
            const parentNode = allNodes.find(n => n.data.uniqueKey === parentKey && n.isPlaced);
            if (!parentNode) return;

            // Calculate direction from parent to child (XZ plane)
            const direction = new THREE.Vector3().subVectors(childNode.position, parentNode.position);
            direction.y = 0;
            const distance = direction.length();
            if (distance > 0) {
                direction.normalize();
                // Use firstLayerTension if parentNode is root, otherwise use layerTension
                const tension = parentNode.data.name === this.config.rootNodeName
                    ? this.config.firstLayerTension
                    : this.config.layerTension;
                const force = direction.multiplyScalar(tension * distance * 0.1);
                parentNode.force.sub(force);
                childNode.force.add(force);
            }
        });
    }

    applySameLayerRepulsion(layers) {
        layers.forEach(layer => {
            for (let i = 0; i < layer.length; i++) {
                const nodeA = layer[i];
                const neighbors = [];
                for (let j = 0; j < layer.length; j++) {
                    if (i === j) continue;
                    const nodeB = layer[j];
                    const direction = new THREE.Vector3().subVectors(nodeA.position, nodeB.position);
                    direction.y = 0;
                    const distance = direction.length();
                    if (distance > 0 && distance < 10) {
                        neighbors.push({ node: nodeB, direction, distance });
                    }
                }
                neighbors.sort((a, b) => a.distance - b.distance);
                const closest = neighbors;
                closest.forEach(({ node: nodeB, direction, distance }) => {
                    direction.normalize();

                    // --- Use sameParentRepulsion if nodes share a parent ---
                    let repulsionForceValue = this.config.nodeRepulsion;
                    // Find if nodeA and nodeB share a parent (using uniqueKey only)
                    const parentA = nodeA.data.parent;
                    const parentB = nodeB.data.parent;
                    const sharedParent = parentA && parentB && parentA === parentB && parentA !== null;

                    // Hooke's law for nodes with shared parent
                    // Prioritize being in first layer over sharedParent
                    const parentNodeA = this.nodes.find(n => n.data.uniqueKey === parentA);
                    if (parentNodeA && parentNodeA.data.name === this.config.rootNodeName) {
                        // First layer repulsion takes priority
                        repulsionForceValue = this.config.firstLayerRepulsion;
                        const repulsionForce = repulsionForceValue / (distance * distance);
                        const force = direction.multiplyScalar(repulsionForce);
                        nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                    } else if (sharedParent && parentA !== null && parentA !== undefined) {
                        // Configurable spring length and constant
                        const springLength = this.config.sameParentSpringLength ?? 2.0; // default 2.0 units
                        const k = this.config.sameParentRepulsion; // spring constant
                        // F = -k * (x - L)
                        const displacement = distance - springLength;
                        const forceMagnitude = -k * displacement;
                        const force = direction.clone().multiplyScalar(forceMagnitude);
                        nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                    } else {
                        // Default repulsion
                        const repulsionForce = repulsionForceValue / (distance * distance);
                        const force = direction.multiplyScalar(repulsionForce);
                        nodeA.force.add(force.clamp(this.clampVectorMin, this.clampVectorMax));
                        nodeB.force.sub(force.clamp(this.clampVectorMin, this.clampVectorMax));
                    }
                });
            }
        });
    }


    // --- Animated Connections ---

    async createAnimatedConnections(data, nodeMap) {
        this.animatedConnections = [];
        const promises = [];
        data.forEach(person => {
            if (person.parent) {
                const parentNode = nodeMap.get(person.parent);
                const childNode = nodeMap.get(person.uniqueKey);
                if (parentNode && childNode) {
                    promises.push(this.animateConnection(parentNode, childNode));
                }
            }
        });
        await Promise.all(promises);
    }

    async animateConnection(parentNode, childNode) {
        // Animated line: grows from parent to child
        const points = [
            parentNode.position.clone(),
            parentNode.position.clone() // start as a zero-length line
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: this.config.color_line,
            transparent: true,
            opacity: 0.0
        });
        const line = new THREE.Line(geometry, material);
        this.scene.add(line);
        this.animatedConnections.push({ line, parentNode, childNode });

        // Animate opacity and length
        let progress = 0;
        const duration = 400; // ms
        const steps = 30;
        for (let i = 0; i <= steps; i++) {
            await new Promise(res => setTimeout(res, duration / steps));
            progress = i / steps;
            // Interpolate endpoint
            const newEnd = parentNode.position.clone().lerp(childNode.position, progress);
            geometry.setFromPoints([parentNode.position, newEnd]);
            material.opacity = progress;
        }
        // Ensure final state
        geometry.setFromPoints([parentNode.position, childNode.position]);
        material.opacity = 1.0;
    }

    updateAnimatedConnections() {
        if (!this.animatedConnections) return;
        this.animatedConnections.forEach(({ line, parentNode, childNode }) => {
            // Only update line geometry if both nodes are placed
            if (parentNode.isPlaced && childNode.isPlaced) {
                const positions = [parentNode.position, childNode.position];
                line.geometry.setFromPoints(positions);
                line.geometry.computeBoundingSphere(); // <-- Add this
                line.geometry.computeBoundingBox();    // <-- Add this
                line.visible = true;
            } else {
                line.visible = false;
            }
        });
    }

    // --- End Animated Connections ---

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
        this.connections.forEach(connection => {
            this.scene.remove(connection);
        });
        this.connections = [];
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
            mesh.material.color.set(this.config.color_hover);
        } else {
            mesh.material.color.copy(mesh.userData.originalColor);
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
}

export { Visualizer };