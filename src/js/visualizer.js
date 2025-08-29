import * as THREE from 'three';
import { Node } from './node.js';

class Visualizer {
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
            layerTension: 1.0,        // Attraction between layers
            nodeRepulsion: 2.0,       // Repulsion within same layer
            verticalSpacing: 3.0,
            animationDelay: 100,
            glowEffect: false
        };
    }

    async renderTree(data) {
        this.clearNodes();
        
        // Start render loop immediately
        if (!this.isAnimating) {
            this.startRenderLoop();
        }
        
        // Get all unique years for color calculation
        const allYears = [...new Set(data.map(person => person.joinDate))].sort();
        
        // Create node map and build tree structure
        const nodeMap = new Map();
        
        // Create nodes first
        data.forEach(person => {
            const node = new Node(person, this.config);
            nodeMap.set(person.name, node);
            this.nodes.push(node);
        });
        
        // Build tree structure and organize by layers
        const layers = this.organizeByLayers(data, nodeMap);
        
        // Position nodes using physics-based approach
        this.positionNodesWithPhysics(layers);
        
        // Create and add meshes with animation and connections
        await this.createNodesSequentially(allYears, layers, data, nodeMap);
    }

    organizeByLayers(data, nodeMap) {
        const layers = [];
        const processed = new Set();
        
        // Find root nodes (those not referred by anyone)
        const referredPeople = new Set();
        data.forEach(person => {
            if (person.referrals) {
                person.referrals.forEach(referral => referredPeople.add(referral));
            }
        });
        
        const rootNodes = data
            .filter(person => !referredPeople.has(person.name))
            .map(person => nodeMap.get(person.name));
        
        layers.push(rootNodes);
        rootNodes.forEach(node => processed.add(node.data.name));
        
        // Build subsequent layers
        let currentLayer = 0;
        while (currentLayer < layers.length) {
            const nextLayerNodes = [];
            
            layers[currentLayer].forEach(node => {
                const person = data.find(p => p.name === node.data.name);
                if (person && person.referrals) {
                    person.referrals.forEach(referralName => {
                        if (!processed.has(referralName)) {
                            const childNode = nodeMap.get(referralName);
                            if (childNode) {
                                nextLayerNodes.push(childNode);
                                processed.add(referralName);
                            }
                        }
                    });
                }
            });
            
            if (nextLayerNodes.length > 0) {
                layers.push(nextLayerNodes);
            }
            currentLayer++;
        }
        
        return layers;
    }

    positionNodesWithPhysics(layers) {
        const iterations = 50; // Number of physics iterations
        const damping = 0.8;   // Velocity damping
        
        // Initialize positions and velocities
        layers.forEach((layer, layerIndex) => {
            const y = -layerIndex * this.config.verticalSpacing;
            
            layer.forEach((node, nodeIndex) => {
                // Initial random positioning in 3D space for each layer
                const angle = (nodeIndex / layer.length) * Math.PI * 2;
                const radius = Math.sqrt(layer.length) * 2;
                
                node.position.set(
                    Math.cos(angle) * radius + (Math.random() - 0.5) * 2,
                    y,
                    Math.sin(angle) * radius + (Math.random() - 0.5) * 2
                );
                
                // Initialize velocity
                node.velocity = new THREE.Vector3(0, 0, 0);
            });
        });
        
        // Physics simulation
        for (let iter = 0; iter < iterations; iter++) {
            // Reset forces
            this.nodes.forEach(node => {
                node.force = new THREE.Vector3(0, 0, 0);
            });
            
            // Apply forces
            this.applyLayerTension(layers);
            this.applySameLayerRepulsion(layers);
            
            // Update positions
            this.nodes.forEach(node => {
                if (!node.velocity) node.velocity = new THREE.Vector3(0, 0, 0);
                if (!node.force) node.force = new THREE.Vector3(0, 0, 0);
                
                // Update velocity with force
                node.velocity.add(node.force.clone().multiplyScalar(0.1));
                
                // Apply damping
                node.velocity.multiplyScalar(damping);
                
                // Update position (but keep Y fixed for layer constraint)
                const newPos = node.position.clone().add(node.velocity);
                node.position.x = newPos.x;
                node.position.z = newPos.z;
                // Y position remains fixed by layer
            });
        }
    }

    applyLayerTension(layers) {
        // Apply tension between nodes in adjacent layers
        for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
            const currentLayer = layers[layerIndex];
            const nextLayer = layers[layerIndex + 1];
            
            currentLayer.forEach(parentNode => {
                // Find children of this parent in next layer
                const person = this.nodes.find(n => n === parentNode)?.data;
                if (person && person.referrals) {
                    person.referrals.forEach(referralName => {
                        const childNode = nextLayer.find(n => n.data.name === referralName);
                        if (childNode) {
                            // Calculate tension force (attraction)
                            const direction = new THREE.Vector3()
                                .subVectors(childNode.position, parentNode.position);
                            direction.y = 0; // Only apply horizontal forces
                            
                            const distance = direction.length();
                            if (distance > 0) {
                                direction.normalize();
                                const force = direction.multiplyScalar(
                                    this.config.layerTension * distance * 0.1
                                );
                                
                                parentNode.force.sub(force);
                                childNode.force.add(force);
                            }
                        }
                    });
                }
            });
        }
    }

    applySameLayerRepulsion(layers) {
        // Apply repulsion between nodes in the same layer
        layers.forEach(layer => {
            for (let i = 0; i < layer.length; i++) {
                for (let j = i + 1; j < layer.length; j++) {
                    const nodeA = layer[i];
                    const nodeB = layer[j];
                    
                    const direction = new THREE.Vector3()
                        .subVectors(nodeA.position, nodeB.position);
                    direction.y = 0; // Only horizontal repulsion
                    
                    const distance = direction.length();
                    if (distance > 0 && distance < 10) { // Only apply if close enough
                        direction.normalize();
                        const repulsionForce = this.config.nodeRepulsion / (distance * distance);
                        const force = direction.multiplyScalar(repulsionForce);
                        
                        nodeA.force.add(force);
                        nodeB.force.sub(force);
                    }
                }
            }
        });
    }

    async createNodesSequentially(allYears, layers, data, nodeMap) {
        // Flatten layers into a single array while preserving layer order
        const allNodesInOrder = [];
        const createdNodes = new Map(); // Track created nodes for connection drawing
        
        layers.forEach(layer => {
            layer.forEach(node => {
                allNodesInOrder.push(node);
            });
        });
        
        // Create nodes one by one
        for (let i = 0; i < allNodesInOrder.length; i++) {
            const node = allNodesInOrder[i];
            
            const mesh = await node.createNode(allYears);
            mesh.position.copy(node.position);
            
            // Start with scale 0 for animation
            mesh.scale.set(0, 0, 0);
            this.scene.add(mesh);
            
            // Store the created node
            createdNodes.set(node.data.name, mesh);
            
            // Animate to full size
            this.animateNodeAppearance(mesh);
            
            // Create connections from this node to its referrals (if they exist)
            this.createConnectionsForNewNode(node, data, createdNodes);
            
            // Create connections from existing nodes to this node
            this.createConnectionsToNewNode(node, data, createdNodes);
            
            // Wait before creating next node
            if (this.config.animationDelay > 0 && i < allNodesInOrder.length - 1) {
                await this.delay(this.config.animationDelay);
            }
        }
    }

    createConnectionsForNewNode(newNode, data, createdNodes) {
        const person = newNode.data;
        if (person.referrals) {
            person.referrals.forEach(referralName => {
                const referralMesh = createdNodes.get(referralName);
                if (referralMesh) {
                    // Create connection from new node to its existing referral
                    this.createAnimatedConnection(newNode.position, referralMesh.position);
                }
            });
        }
    }

    createConnectionsToNewNode(newNode, data, createdNodes) {
        // Find nodes that refer to this new node
        data.forEach(person => {
            if (person.referrals && person.referrals.includes(newNode.data.name)) {
                const parentMesh = createdNodes.get(person.name);
                if (parentMesh) {
                    // Create connection from existing parent to new node
                    this.createAnimatedConnection(parentMesh.position, newNode.position);
                }
            }
        });
    }

    createAnimatedConnection(startPos, endPos) {
        const geometry = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
        
        // White lines with initial transparency for animation
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0 // Start invisible
        });
        
        const line = new THREE.Line(geometry, material);
        
        this.connections.push(line);
        this.scene.add(line);
        
        // Animate line appearance
        this.animateLineAppearance(line);
    }

    animateLineAppearance(line) {
        const animationDuration = 300; // ms
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            
            // Fade in the line
            line.material.opacity = progress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    createConnection(startPos, endPos) {
        const geometry = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
        
        // White solid lines (for non-animated connections)
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            transparent: false
        });
        
        const line = new THREE.Line(geometry, material);
        
        this.connections.push(line);
        this.scene.add(line);
    }

    positionTreeNodes(data, nodeMap, rootNodes) {
        const positioned = new Set();
        let currentY = 0;
        
        // Position root nodes first
        const rootSpacing = Math.max(this.config.minSeparation, rootNodes.length * 1.5);
        rootNodes.forEach((node, index) => {
            const x = (index - (rootNodes.length - 1) / 2) * rootSpacing;
            node.position.set(x, currentY, 0);
            positioned.add(node.data.name);
        });
        
        // Process each level
        const processLevel = (parentNodes, depth) => {
            const nextLevelNodes = [];
            const levelY = currentY - (depth + 1) * this.config.verticalSpacing;
            
            parentNodes.forEach(parentNode => {
                const person = data.find(p => p.name === parentNode.data.name);
                if (person && person.referrals && person.referrals.length > 0) {
                    const children = person.referrals
                        .map(name => nodeMap.get(name))
                        .filter(node => node && !positioned.has(node.data.name));
                    
                    if (children.length > 0) {
                        // Position children around parent
                        const childSpacing = Math.max(this.config.minSeparation, children.length * 1.2);
                        children.forEach((child, index) => {
                            const offsetX = (index - (children.length - 1) / 2) * childSpacing;
                            child.position.set(
                                parentNode.position.x + offsetX,
                                levelY,
                                0
                            );
                            positioned.add(child.data.name);
                            nextLevelNodes.push(child);
                        });
                    }
                }
            });
            
            if (nextLevelNodes.length > 0) {
                processLevel(nextLevelNodes, depth + 1);
            }
        };
        
        processLevel(rootNodes, 0);
    }

    animateNodeAppearance(mesh) {
        const targetScale = 1;
        const animationDuration = 500; // ms
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            
            // Ease-out animation
            const scale = targetScale * (1 - Math.pow(1 - progress, 3));
            mesh.scale.set(scale, scale, scale);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    createConnections(data, nodeMap) {
        data.forEach(person => {
            if (person.referrals && person.referrals.length > 0) {
                const parentNode = nodeMap.get(person.name);
                
                person.referrals.forEach(referralName => {
                    const childNode = nodeMap.get(referralName);
                    if (childNode) {
                        this.createConnection(parentNode.position, childNode.position);
                    }
                });
            }
        });
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    updateNode(person) {
        const node = this.nodes.find(n => n.data.name === person.name);
        if (node) {
            node.update(person);
        }
    }

    clearNodes() {
        // Remove nodes
        this.nodes.forEach(node => {
            if (node.mesh) {
                this.scene.remove(node.mesh);
            }
        });
        this.nodes = [];

        // Remove connections
        this.connections.forEach(connection => {
            this.scene.remove(connection);
        });
        this.connections = [];
    }

    startRenderLoop() {
        this.isAnimating = true;
        const animate = () => {
            if (this.isAnimating) {
                requestAnimationFrame(animate);
                if (this.composer) {
                    this.composer.render();
                } else {
                    this.renderer.render(this.scene, this.camera);
                }
            }
        };
        animate();
    }

    stopRenderLoop() {
        this.isAnimating = false;
    }
}

export { Visualizer };