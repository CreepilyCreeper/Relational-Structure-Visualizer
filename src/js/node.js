import * as THREE from 'three';

class Node {
    constructor(personData, config = {}) {
        this.data = personData;
        this.mesh = null;
        this.position = new THREE.Vector3();
        this.textureLoader = new THREE.TextureLoader();
        this.config = {
            nodeSize: 0.5,
            glowEffect: false,
            ...config
        };
        this.originalScale = this.config.nodeSize;
        this.imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff'];
    }

    async createNode(allYears = null) {
        console.log(`Creating node for ${this.data.name}, selfie path: ${this.data.selfie}`);
        
        const geometry = new THREE.SphereGeometry(this.originalScale, 32, 32);
        const color = new THREE.Color(this.getPersonColor(allYears));
        
        // Create solid material (no transparency or glow)
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Only add glow effect if enabled in config
        if (this.config.glowEffect) {
            const glowGeometry = new THREE.SphereGeometry(this.originalScale * 1.2, 16, 16);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
            });
            
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            this.mesh.add(glowMesh);
        }
        
        // Add user data for interactions
        this.mesh.userData = {
            name: this.data.name,
            joinDate: this.data.joinDate,
            referrals: this.data.referrals || [],
            selfie: this.data.selfie,
            nodeInstance: this
        };
        
        return this.mesh;
    }

    async loadTextureWithFallback(imagePath) {
        // Extract the base path without extension
        const basePath = imagePath.replace(/\.[^/.]+$/, "");
        
        // Try each extension
        for (const ext of this.imageExtensions) {
            const testPath = `${basePath}.${ext}`;
            try {
                const texture = await this.loadTexturePromise(testPath);
                console.log(`Successfully loaded texture for ${this.data.name}: ${testPath}`);
                return texture;
            } catch (error) {
                console.log(`Failed to load ${testPath}, trying next extension...`);
            }
        }
        
        return null; // No texture found with any extension
    }

    loadTexturePromise(path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => resolve(texture), // onLoad
                undefined, // onProgress
                (error) => reject(error) // onError
            );
        });
    }

    getPersonColor(allYears = null) {
        // If no years provided, use a default range
        if (!allYears || allYears.length === 0) {
            return 0xff00ff; // Default magenta
        }
        
        const sortedYears = [...allYears].sort();
        const yearIndex = sortedYears.indexOf(this.data.joinDate);
        
        if (yearIndex === -1) return 0xff00ff; // Default magenta if year not found
        
        // Interpolate between magenta (ff00ff) and cyan (00ffff)
        const progress = sortedYears.length === 1 ? 0 : yearIndex / (sortedYears.length - 1);
        
        // Magenta RGB: (255, 0, 255), Cyan RGB: (0, 255, 255)
        const r = Math.round(255 * (1 - progress));
        const g = Math.round(255 * progress);
        const b = 255;
        
        return (r << 16) | (g << 8) | b;
    }

    update(newData) {
        this.data = newData;
        if (this.mesh) {
            this.mesh.userData = {
                name: this.data.name,
                joinDate: this.data.joinDate,
                referrals: this.data.referrals || [],
                selfie: this.data.selfie,
                nodeInstance: this
            };
        }
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.mesh) {
            this.mesh.position.copy(this.position);
        }
    }
}

export { Node };